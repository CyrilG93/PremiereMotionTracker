#include "media_inspector.h"

#include <opencv2/videoio.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>
// OpenCV 5 moved goodFeaturesToTrack out of the legacy features2d header.
#if CV_VERSION_MAJOR >= 5
#include <opencv2/features.hpp>
#else
#include <opencv2/features2d.hpp>
#endif
#include <opencv2/video/tracking.hpp>
#include <opencv2/calib3d.hpp>

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

// Turn the panel's normalized selection into a safe OpenCV polygon for feature detection.
std::vector<cv::Point2f> makeSurfaceCorners(const std::array<std::array<double, 2>, 4>& normalizedCorners, int width, int height) {
    std::vector<cv::Point2f> corners;
    corners.reserve(normalizedCorners.size());
    for (const auto& corner : normalizedCorners) {
        if (!std::isfinite(corner[0]) || !std::isfinite(corner[1]) || corner[0] < 0.0 || corner[0] > 1.0 || corner[1] < 0.0 || corner[1] > 1.0) {
            throw std::invalid_argument("Les quatre coins de surface doivent être normalisés entre 0 et 1.");
        }
        corners.emplace_back(static_cast<float>(corner[0] * static_cast<double>(width - 1)), static_cast<float>(corner[1] * static_cast<double>(height - 1)));
    }
    if (std::abs(cv::contourArea(corners)) < 100.0) {
        throw std::invalid_argument("La surface sélectionnée est trop petite pour être suivie.");
    }
    if (!cv::isContourConvex(corners)) {
        throw std::invalid_argument("Les quatre coins doivent former une surface convexe.");
    }
    return corners;
}

// Convert OpenCV's pixel-space corners back to durable coordinates used by the UXP panel.
SurfaceTrackingSample makeSurfaceSample(
    std::int64_t frame,
    double framesPerSecond,
    const std::vector<cv::Point2f>& corners,
    int width,
    int height,
    double confidence,
    bool valid
) {
    SurfaceTrackingSample sample;
    sample.frame = frame;
    sample.seconds = static_cast<double>(frame) / framesPerSecond;
    sample.confidence = confidence;
    sample.valid = valid;
    for (std::size_t index = 0; index < sample.corners.size(); index += 1) {
        const cv::Point2f point = corners.at(index);
        sample.corners[index] = {
            std::clamp(static_cast<double>(point.x) / static_cast<double>(width - 1), 0.0, 1.0),
            std::clamp(static_cast<double>(point.y) / static_cast<double>(height - 1), 0.0, 1.0)
        };
    }
    return sample;
}

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

PreviewFrame renderPreviewFrame(const std::string& mediaPath, double seconds, const std::string& outputPath, int maximumWidth) {
    if (mediaPath.empty() || outputPath.empty()) {
        throw std::invalid_argument("Le média et le fichier PNG de prévisualisation sont requis.");
    }
    if (!std::isfinite(seconds) || seconds < 0.0 || maximumWidth < 32 || maximumWidth > 1920) {
        throw std::invalid_argument("Les paramètres de prévisualisation du média sont invalides.");
    }
    // Decode the source with the same backend as tracking so preview pixels and tracking coordinates stay aligned.
    cv::VideoCapture capture(mediaPath, cv::CAP_ANY);
    if (!capture.isOpened()) {
        throw std::runtime_error("Impossible d’ouvrir le média pour la prévisualisation : " + mediaPath);
    }
    const double framesPerSecond = capture.get(cv::CAP_PROP_FPS);
    if (!std::isfinite(framesPerSecond) || framesPerSecond <= 0.0) {
        throw std::runtime_error("Le média ne fournit pas de cadence image exploitable pour la prévisualisation.");
    }
    const std::int64_t frameIndex = std::max<std::int64_t>(0, static_cast<std::int64_t>(std::llround(seconds * framesPerSecond)));
    if (!capture.set(cv::CAP_PROP_POS_FRAMES, static_cast<double>(frameIndex))) {
        throw std::runtime_error("OpenCV ne peut pas atteindre l’image de prévisualisation demandée.");
    }
    cv::Mat decodedFrame;
    if (!capture.read(decodedFrame) || decodedFrame.empty()) {
        throw std::runtime_error("OpenCV ne peut pas lire l’image de prévisualisation demandée.");
    }
    cv::Mat previewFrame = decodedFrame;
    if (decodedFrame.cols > maximumWidth) {
        const double scale = static_cast<double>(maximumWidth) / static_cast<double>(decodedFrame.cols);
        cv::resize(decodedFrame, previewFrame, cv::Size(maximumWidth, std::max(1, static_cast<int>(std::lround(decodedFrame.rows * scale)))), 0.0, 0.0, cv::INTER_AREA);
    }
    if (!cv::imwrite(outputPath, previewFrame)) {
        throw std::runtime_error("OpenCV ne peut pas écrire le PNG de prévisualisation : " + outputPath);
    }
    return { previewFrame.cols, previewFrame.rows, frameIndex, static_cast<double>(frameIndex) / framesPerSecond };
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

std::vector<SurfaceTrackingSample> trackSurface(
    const std::string& mediaPath,
    const std::array<std::array<double, 2>, 4>& normalizedCorners,
    double startSeconds,
    double endSeconds,
    const SurfaceTrackingProgressCallback& progressCallback,
    int searchRadius,
    int featureCount
) {
    if (!std::isfinite(startSeconds) || !std::isfinite(endSeconds) || startSeconds < 0.0 || endSeconds <= startSeconds) {
        throw std::invalid_argument("La plage média de surface tracking est invalide.");
    }
    if (searchRadius < 5 || searchRadius > 40) {
        throw std::invalid_argument("La zone de recherche doit être comprise entre 5 et 40 pixels.");
    }
    if (featureCount < 80 || featureCount > 400) {
        throw std::invalid_argument("Le niveau de détail de surface doit être compris entre 80 et 400 points.");
    }
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
    std::vector<cv::Point2f> surfaceCorners = makeSurfaceCorners(normalizedCorners, previousGray.cols, previousGray.rows);
    // Reseed only inside the last trusted surface so recovery does not drift to unrelated frame details.
    const auto reseedSurfaceFeatures = [&surfaceCorners, featureCount](const cv::Mat& gray) {
        cv::Mat selectionMask(gray.size(), CV_8UC1, cv::Scalar(0));
        std::vector<cv::Point> polygon;
        polygon.reserve(surfaceCorners.size());
        for (const cv::Point2f& corner : surfaceCorners) {
            polygon.emplace_back(cvRound(corner.x), cvRound(corner.y));
        }
        cv::fillConvexPoly(selectionMask, polygon, cv::Scalar(255));
        std::vector<cv::Point2f> features;
        cv::goodFeaturesToTrack(gray, features, featureCount, 0.01, 5.0, selectionMask, 3, false, 0.04);
        return features;
    };
    std::vector<cv::Point2f> trackedFeatures = reseedSurfaceFeatures(previousGray);
    if (trackedFeatures.size() < 8) {
        throw std::runtime_error("La surface ne contient pas assez de détails contrastés pour le tracking.");
    }

    std::vector<SurfaceTrackingSample> samples;
    samples.push_back(makeSurfaceSample(firstFrame, framesPerSecond, surfaceCorners, previousGray.cols, previousGray.rows, 1.0, true));
    if (progressCallback && !progressCallback(samples.back())) {
        throw std::runtime_error("Tracking cancelled.");
    }
    const cv::Size searchWindow(searchRadius * 2 + 1, searchRadius * 2 + 1);
    for (std::int64_t frame = firstFrame + 1; frame <= lastFrame && capture.read(decodedFrame); frame += 1) {
        cv::Mat currentGray = toGray(decodedFrame);
        if (trackedFeatures.size() < 8) {
            // A previous dropout left no points to flow; flag this frame and wait until texture returns.
            samples.push_back(makeSurfaceSample(frame, framesPerSecond, surfaceCorners, currentGray.cols, currentGray.rows, 0.0, false));
            if (progressCallback && !progressCallback(samples.back())) {
                throw std::runtime_error("Tracking cancelled.");
            }
            trackedFeatures = reseedSurfaceFeatures(currentGray);
            previousGray = std::move(currentGray);
            continue;
        }
        std::vector<cv::Point2f> forwardFeatures;
        std::vector<unsigned char> forwardStatus;
        std::vector<float> forwardError;
        cv::calcOpticalFlowPyrLK(previousGray, currentGray, trackedFeatures, forwardFeatures, forwardStatus, forwardError, searchWindow, 3);
        std::vector<cv::Point2f> backwardFeatures;
        std::vector<unsigned char> backwardStatus;
        std::vector<float> backwardError;
        cv::calcOpticalFlowPyrLK(currentGray, previousGray, forwardFeatures, backwardFeatures, backwardStatus, backwardError, searchWindow, 3);
        std::vector<cv::Point2f> sourceInliers;
        std::vector<cv::Point2f> destinationInliers;
        double backwardDistanceSum = 0.0;
        for (std::size_t index = 0; index < trackedFeatures.size(); index += 1) {
            if (index >= forwardFeatures.size() || index >= backwardFeatures.size() || index >= forwardStatus.size() || index >= backwardStatus.size() || !forwardStatus[index] || !backwardStatus[index]) {
                continue;
            }
            const double backwardDistance = cv::norm(backwardFeatures[index] - trackedFeatures[index]);
            if (backwardDistance > 1.5) {
                continue;
            }
            sourceInliers.push_back(trackedFeatures[index]);
            destinationInliers.push_back(forwardFeatures[index]);
            backwardDistanceSum += backwardDistance;
        }
        bool valid = sourceInliers.size() >= 8;
        double confidence = 0.0;
        if (valid) {
            cv::Mat inlierMask;
            const cv::Mat homography = cv::findHomography(sourceInliers, destinationInliers, cv::RANSAC, 3.0, inlierMask);
            const int inlierCount = inlierMask.empty() ? 0 : cv::countNonZero(inlierMask);
            valid = !homography.empty() && inlierCount >= 6;
            if (valid) {
                cv::perspectiveTransform(surfaceCorners, surfaceCorners, homography);
                std::vector<cv::Point2f> retainedFeatures;
                retainedFeatures.reserve(static_cast<std::size_t>(inlierCount));
                for (int index = 0; index < inlierMask.rows; index += 1) {
                    if (inlierMask.at<unsigned char>(index)) {
                        retainedFeatures.push_back(destinationInliers.at(static_cast<std::size_t>(index)));
                    }
                }
                trackedFeatures = std::move(retainedFeatures);
                const double featureRatio = static_cast<double>(sourceInliers.size()) / static_cast<double>(std::max<std::size_t>(1, forwardFeatures.size()));
                const double inlierRatio = static_cast<double>(inlierCount) / static_cast<double>(sourceInliers.size());
                const double backwardConfidence = std::clamp(1.0 - (backwardDistanceSum / static_cast<double>(sourceInliers.size())) / 1.5, 0.0, 1.0);
                confidence = std::clamp(featureRatio * inlierRatio * backwardConfidence, 0.0, 1.0);
            }
        }
        samples.push_back(makeSurfaceSample(frame, framesPerSecond, surfaceCorners, currentGray.cols, currentGray.rows, confidence, valid));
        if (progressCallback && !progressCallback(samples.back())) {
            throw std::runtime_error("Tracking cancelled.");
        }
        if (!valid || trackedFeatures.size() < 8) {
            // Keep the last verified surface, mark this frame uncertain, then reseed features for the next frame.
            trackedFeatures = reseedSurfaceFeatures(currentGray);
        }
        previousGray = std::move(currentGray);
    }
    return samples;
}

} // namespace pmt
