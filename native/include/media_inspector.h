#pragma once

#include <array>
#include <cstdint>
#include <functional>
#include <string>
#include <vector>

namespace pmt {

// Keep media metadata independent from UXP so it can be tested with a normal executable.
struct MediaInspection {
    std::string path;
    std::string backend;
    int width = 0;
    int height = 0;
    std::int64_t frameCount = 0;
    double framesPerSecond = 0.0;
    double durationSeconds = 0.0;
};

// Preserve one image-to-image result before it is converted into Premiere timeline keyframes.
struct MediaTrackingSample {
    std::int64_t frame = 0;
    double seconds = 0.0;
    double x = 0.0;
    double y = 0.0;
    double confidence = 0.0;
    bool valid = false;
};

// Preserve four normalized corners of a planar surface for one decoded frame.
struct SurfaceTrackingSample {
    std::int64_t frame = 0;
    double seconds = 0.0;
    std::array<std::array<double, 2>, 4> corners {};
    double confidence = 0.0;
    bool valid = false;
};

// Allow the native worker to publish a durable sample without exposing OpenCV frame objects to UXP.
using TrackingProgressCallback = std::function<bool(const MediaTrackingSample&)>;

// Publish only serializable four-corner samples while OpenCV owns the source frames.
using SurfaceTrackingProgressCallback = std::function<bool(const SurfaceTrackingSample&)>;

// Open a local video through OpenCV and return durable metadata for the tracking session.
MediaInspection inspectMedia(const std::string& mediaPath);

// Track a normalized point across a bounded media interval with Lucas-Kanade and a forward-backward check.
std::vector<MediaTrackingSample> trackMedia(
    const std::string& mediaPath,
    double normalizedX,
    double normalizedY,
    double startSeconds,
    double endSeconds,
    const TrackingProgressCallback& progressCallback = {},
    int searchRadius = 10
);

// Track textured features inside a four-corner planar selection and estimate its homography per frame.
std::vector<SurfaceTrackingSample> trackSurface(
    const std::string& mediaPath,
    const std::array<std::array<double, 2>, 4>& normalizedCorners,
    double startSeconds,
    double endSeconds,
    const SurfaceTrackingProgressCallback& progressCallback = {},
    int searchRadius = 10,
    int featureCount = 240
);

} // namespace pmt
