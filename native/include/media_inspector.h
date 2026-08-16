#pragma once

#include <cstdint>
#include <string>

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

// Open a local video through OpenCV and return durable metadata for the tracking session.
MediaInspection inspectMedia(const std::string& mediaPath);

} // namespace pmt
