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

// Describe one original-media frame rendered to a panel-sized PNG by the native decoder.
struct PreviewFrame {
    int width = 0;
    int height = 0;
    std::int64_t frame = 0;
    double seconds = 0.0;
};

// Preserve one image-to-image result before it is converted into Premiere timeline keyframes.
struct MediaTrackingSample {
    std::int64_t frame = 0;
    double seconds = 0.0;
    double x = 0.0;
    double y = 0.0;
    double confidence = 0.0;
    bool valid = false;
    std::string previewFileName;
};

// Preserve four normalized corners of a planar surface for one decoded frame.
struct SurfaceTrackingSample {
    std::int64_t frame = 0;
    double seconds = 0.0;
    std::array<std::array<double, 2>, 4> corners {};
    double confidence = 0.0;
    bool valid = false;
    std::string previewFileName;
};

// Allow the native worker to publish a durable sample without exposing OpenCV frame objects to UXP.
using TrackingProgressCallback = std::function<bool(const MediaTrackingSample&)>;

// Publish only serializable four-corner samples while OpenCV owns the source frames.
using SurfaceTrackingProgressCallback = std::function<bool(const SurfaceTrackingSample&)>;

// Open a local video through OpenCV and return durable metadata for the tracking session.
MediaInspection inspectMedia(const std::string& mediaPath);

// Decode one original-media frame and write a compact PNG without asking Premiere to export it.
PreviewFrame renderPreviewFrame(
    const std::string& mediaPath,
    double seconds,
    const std::string& outputPath,
    int maximumWidth = 960
);

// Decode a bounded range once into compact panel PNGs so selection and reverse tracking avoid repeated media seeks.
std::vector<MediaTrackingSample> cacheMediaPreview(
    const std::string& mediaPath,
    double startSeconds,
    double endSeconds,
    const TrackingProgressCallback& progressCallback = {},
    const std::string& previewFolder = {}
);

// Track a normalized point across a bounded media interval with Lucas-Kanade and a forward-backward check.
std::vector<MediaTrackingSample> trackMedia(
    const std::string& mediaPath,
    double normalizedX,
    double normalizedY,
    double startSeconds,
    double endSeconds,
    const TrackingProgressCallback& progressCallback = {},
    int searchRadius = 10,
    const std::string& previewFolder = {}
);

// Follow a point backwards through the previously decoded panel cache, returning samples in chronological order.
std::vector<MediaTrackingSample> trackMediaReverseFromPreview(
    const std::string& mediaPath,
    double normalizedX,
    double normalizedY,
    double startSeconds,
    double endSeconds,
    const TrackingProgressCallback& progressCallback = {},
    int searchRadius = 10,
    const std::string& previewFolder = {}
);

// Track textured features inside a four-corner planar selection and estimate its homography per frame.
std::vector<SurfaceTrackingSample> trackSurface(
    const std::string& mediaPath,
    const std::array<std::array<double, 2>, 4>& normalizedCorners,
    double startSeconds,
    double endSeconds,
    const SurfaceTrackingProgressCallback& progressCallback = {},
    int searchRadius = 10,
    int featureCount = 240,
    const std::string& previewFolder = {}
);

// Follow a four-corner surface backwards through the prepared PNG cache, returning chronological samples.
std::vector<SurfaceTrackingSample> trackSurfaceReverseFromPreview(
    const std::string& mediaPath,
    const std::array<std::array<double, 2>, 4>& normalizedCorners,
    double startSeconds,
    double endSeconds,
    const SurfaceTrackingProgressCallback& progressCallback = {},
    int searchRadius = 10,
    int featureCount = 240,
    const std::string& previewFolder = {}
);

} // namespace pmt
