#pragma once

#include <cstdint>
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

// Describe the short plugin-local video generated to review one finished tracking pass.
struct PreviewVideo {
    std::string path;
    std::string codec;
    int width = 0;
    int height = 0;
    std::int64_t frameCount = 0;
    double framesPerSecond = 0.0;
    double durationSeconds = 0.0;
};

// Open a local video through OpenCV and return durable metadata for the tracking session.
MediaInspection inspectMedia(const std::string& mediaPath);

// Track a normalized point across a bounded media interval with Lucas-Kanade and a forward-backward check.
std::vector<MediaTrackingSample> trackMedia(
    const std::string& mediaPath,
    double normalizedX,
    double normalizedY,
    double startSeconds,
    double endSeconds
);

// Encode the bounded source range as a small MP4 inside plugin-temp so UXP can play it without file-system access.
PreviewVideo createPreviewVideo(
    const std::string& mediaPath,
    double startSeconds,
    double endSeconds,
    const std::string& outputPath
);

} // namespace pmt
