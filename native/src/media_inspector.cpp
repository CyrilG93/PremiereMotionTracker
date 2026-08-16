#include "media_inspector.h"

#include <opencv2/videoio.hpp>

#include <cmath>
#include <stdexcept>

namespace pmt {

MediaInspection inspectMedia(const std::string& mediaPath) {
    if (mediaPath.empty()) {
        throw std::invalid_argument("Le chemin du média est vide.");
    }

    // Let OpenCV choose the platform decoder; Windows resolves to Media Foundation in this build.
    cv::VideoCapture capture(mediaPath, cv::CAP_ANY);
    if (!capture.isOpened()) {
        throw std::runtime_error("Impossible d’ouvrir le média avec OpenCV : " + mediaPath);
    }

    MediaInspection result;
    result.path = mediaPath;
    result.backend = capture.getBackendName();
    result.width = static_cast<int>(std::lround(capture.get(cv::CAP_PROP_FRAME_WIDTH)));
    result.height = static_cast<int>(std::lround(capture.get(cv::CAP_PROP_FRAME_HEIGHT)));
    result.frameCount = static_cast<std::int64_t>(std::llround(capture.get(cv::CAP_PROP_FRAME_COUNT)));
    result.framesPerSecond = capture.get(cv::CAP_PROP_FPS);

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

} // namespace pmt
