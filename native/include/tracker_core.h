#pragma once

#include <cstdint>
#include <vector>

namespace pmt {

// Store one compact grayscale frame independently from OpenCV and the Adobe SDK.
struct GrayFrame {
    int width = 0;
    int height = 0;
    std::vector<std::uint8_t> pixels;

    // Validate dimensions before native tracking touches the pixel buffer.
    bool isValid() const;
};

// Represent a point in pixel coordinates; normalized conversion remains an UI concern.
struct TrackingPoint {
    double x = 0.0;
    double y = 0.0;
};

// Keep V1 accuracy controls small enough to map later to simple panel presets.
struct TrackingSettings {
    int patchRadius = 8;
    int searchRadius = 24;
    double minimumCorrelation = 0.55;
};

// Return the best next-frame location and a normalized reliability score.
struct TrackingResult {
    TrackingPoint point;
    double confidence = 0.0;
    bool valid = false;
};

// Track one point between consecutive grayscale frames using normalized correlation.
TrackingResult trackPoint(
    const GrayFrame& previousFrame,
    const GrayFrame& currentFrame,
    TrackingPoint previousPoint,
    const TrackingSettings& settings
);

} // namespace pmt
