#include "media_inspector.h"

#include <opencv2/videoio.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/video/tracking.hpp>

#include <algorithm>
#include <cmath>
#include <stdexcept>

namespace pmt {

namespace {

// Convert each decoded frame into the grayscale representation required by Lucas-Kanade.
cv::Mat toGray(const cv::Mat& frame) {
    if (frame.empty()) {
        throw std::runtime_error("OpenCV a renvoyé une image vidéo vide.");
    }
    if (frame.channels() == 1) {
        return frame.clone();
    }
    cv::Mat gray;
    cv::cvtColor(frame, gray, cv::COLOR_BGR2GRAY);
    return gray;
}

// Limit the first synchronous addon iteration so an accidental long range cannot freeze the panel indefinitely.
constexpr std::int64_t maximumTrackedFrames = 3600;

} // namespace

MediaInspection inspectMedia(const std::string& mediaPath) {
    if (mediaPath.empty()) {
        throw std::invalid_argument("Le chemin du média est vide.");
    }

    // Let OpenCV choose the platform decoder; Windows resolves to Media Foundation in this build.
    cv::VideoCapture capture(mediaPath, cv::CAP_ANY);
    MediaInspection result;
    result.path = mediaPath;
    if (capture.isOpened()) {
        result.backend = capture.getBackendName();
        result.width = static_cast<int>(std::lround(capture.get(cv::CAP_PROP_FRAME_WIDTH)));
        result.height = static_cast<int>(std::lround(capture.get(cv::CAP_PROP_FRAME_HEIGHT)));
        result.frameCount = static_cast<std::int64_t>(std::llround(capture.get(cv::CAP_PROP_FRAME_COUNT)));
        result.framesPerSecond = capture.get(cv::CAP_PROP_FPS);
    }
    if (result.width < 1 || result.height < 1) {
        // Still-image targets have no reliable video stream, so inspect their native pixel dimensions directly.
        const cv::Mat image = cv::imread(mediaPath, cv::IMREAD_UNCHANGED);
        if (image.empty()) {
            throw std::runtime_error("Impossible d’ouvrir le média avec OpenCV : " + mediaPath);
        }
        result.backend = "OpenCV image";
        result.width = image.cols;
        result.height = image.rows;
        result.frameCount = 1;
        result.framesPerSecond = 0.0;
    }

    if (result.width < 1 || result.height < 1) {
        throw std::runtime_error("Le média ne fournit pas de dimensions vidéo valides.");
    }
    if (!std::isfinite(result.framesPerSecond) || result.framesPerSecond < 0.0) {
        result.framesPerSecond = 0.0;
    }
    if (result.frameCount > 0 && result.framesPerSecond > 0.0) {
        result.durationSeconds = static_cast<double>(result.frameCount) / result.framesPerSecond;
    }
    return result;
}

std::vector<MediaTrackingSample> trackMedia(
    const std::string& mediaPath,
    double normalizedX,
    double normalizedY,
    double startSeconds,
    double endSeconds,
    const TrackingProgressCallback& progressCallback,
    int searchRadius
) {
    if (!std::isfinite(normalizedX) || !std::isfinite(normalizedY) || normalizedX < 0.0 || normalizedX > 1.0 || normalizedY < 0.0 || normalizedY > 1.0) {
        throw std::invalid_argument("Le point de tracking doit être normalisé entre 0 et 1.");
    }
    if (!std::isfinite(startSeconds) || !std::isfinite(endSeconds) || startSeconds < 0.0 || endSeconds <= startSeconds) {
      throw std::invalid_argument("La plage média de tracking est invalide.");
    }
    if (searchRadius < 5 || searchRadius > 40) {
        throw std::invalid_argument("La zone de recherche doit être comprise entre 5 et 40 pixels.");
    }

    // Open the same platform decoder used by media inspection so the session stays consistent.
    cv::VideoCapture capture(mediaPath, cv::CAP_ANY);
    if (!capture.isOpened()) {
        throw std::runtime_error("Impossible d’ouvrir le média avec OpenCV : " + mediaPath);
    }
    const double framesPerSecond = capture.get(cv::CAP_PROP_FPS);
    if (!std::isfinite(framesPerSecond) || framesPerSecond <= 0.0) {
        throw std::runtime_error("Le média ne fournit pas de cadence image exploitable.");
    }
    const std::int64_t firstFrame = std::max<std::int64_t>(0, static_cast<std::int64_t>(std::floor(startSeconds * framesPerSecond)));
    const std::int64_t lastFrame = static_cast<std::int64_t>(std::ceil(endSeconds * framesPerSecond));
    if (lastFrame - firstFrame + 1 > maximumTrackedFrames) {
        throw std::runtime_error("La plage dépasse 3600 images ; réduisez les In/Out avant l’analyse.");
    }
    if (!capture.set(cv::CAP_PROP_POS_FRAMES, static_cast<double>(firstFrame))) {
        throw std::runtime_error("OpenCV ne peut pas atteindre le début de la plage demandée.");
    }

    cv::Mat decodedFrame;
    if (!capture.read(decodedFrame)) {
        throw std::runtime_error("OpenCV ne peut pas lire la première image de la plage demandée.");
    }
    cv::Mat previousGray = toGray(decodedFrame);
    cv::Point2f trackedPoint(
        static_cast<float>(normalizedX * static_cast<double>(previousGray.cols - 1)),
        static_cast<float>(normalizedY * static_cast<double>(previousGray.rows - 1))
    );

    std::vector<MediaTrackingSample> samples;
    samples.push_back({ firstFrame, static_cast<double>(firstFrame) / framesPerSecond, normalizedX, normalizedY, 1.0, true });
    // Stop decoding promptly when the UI cancels an asynchronous tracking task.
    if (progressCallback && !progressCallback(samples.back())) {
        throw std::runtime_error("Tracking cancelled.");
    }
    for (std::int64_t frame = firstFrame + 1; frame <= lastFrame && capture.read(decodedFrame); frame += 1) {
        cv::Mat currentGray = toGray(decodedFrame);
        const std::vector<cv::Point2f> sourcePoint { trackedPoint };
        std::vector<cv::Point2f> forwardPoint;
        std::vector<unsigned char> forwardStatus;
        std::vector<float> forwardError;
        // Use the user-selected local search window while keeping the proven three-level optical-flow pyramid.
        const cv::Size searchWindow(searchRadius * 2 + 1, searchRadius * 2 + 1);
        cv::calcOpticalFlowPyrLK(previousGray, currentGray, sourcePoint, forwardPoint, forwardStatus, forwardError, searchWindow, 3);

        std::vector<cv::Point2f> backwardPoint;
        std::vector<unsigned char> backwardStatus;
        std::vector<float> backwardError;
        if (!forwardPoint.empty() && !forwardStatus.empty() && forwardStatus[0]) {
            // Track back to reject points that cannot reproduce their source coordinate.
            cv::calcOpticalFlowPyrLK(currentGray, previousGray, forwardPoint, backwardPoint, backwardStatus, backwardError, searchWindow, 3);
        }

        double confidence = 0.0;
        bool valid = !forwardPoint.empty() && !forwardStatus.empty() && forwardStatus[0]
            && !backwardPoint.empty() && !backwardStatus.empty() && backwardStatus[0];
        if (valid) {
            const double backwardDistance = cv::norm(backwardPoint[0] - trackedPoint);
            confidence = std::clamp(1.0 - backwardDistance / 2.0, 0.0, 1.0);
            valid = backwardDistance <= 1.5;
            if (valid) {
                trackedPoint = forwardPoint[0];
            }
        }

        const double pointX = std::clamp(static_cast<double>(trackedPoint.x) / static_cast<double>(currentGray.cols - 1), 0.0, 1.0);
        const double pointY = std::clamp(static_cast<double>(trackedPoint.y) / static_cast<double>(currentGray.rows - 1), 0.0, 1.0);
        samples.push_back({ frame, static_cast<double>(frame) / framesPerSecond, pointX, pointY, confidence, valid });
        // Publish one plain-data sample at a time so the panel can update the overlay while tracking runs.
        if (progressCallback && !progressCallback(samples.back())) {
            throw std::runtime_error("Tracking cancelled.");
        }
        previousGray = std::move(currentGray);
    }
    return samples;
}

} // namespace pmt
