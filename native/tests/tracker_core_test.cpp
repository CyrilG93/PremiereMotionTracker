#include "tracker_core.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <iostream>
#include <string>

namespace {

// Build a deterministic textured image and optionally translate or brighten it.
pmt::GrayFrame makeFrame(int width, int height, int shiftX, int shiftY, int brightnessOffset) {
    pmt::GrayFrame frame;
    frame.width = width;
    frame.height = height;
    frame.pixels.resize(static_cast<std::size_t>(width * height), 0);
    for (int y = 0; y < height; y += 1) {
        for (int x = 0; x < width; x += 1) {
            const int sourceX = x - shiftX;
            const int sourceY = y - shiftY;
            if (sourceX < 0 || sourceY < 0 || sourceX >= width || sourceY >= height) {
                continue;
            }
            const std::uint32_t hash = (static_cast<std::uint32_t>(sourceX) * 73856093u)
                ^ (static_cast<std::uint32_t>(sourceY) * 19349663u);
            const int texturedValue = static_cast<int>(hash % 180u) + 35 + brightnessOffset;
            frame.pixels[static_cast<std::size_t>(y * width + x)] = static_cast<std::uint8_t>(std::clamp(texturedValue, 0, 255));
        }
    }
    return frame;
}

// Report a readable native-test failure without adding a third-party framework.
bool expect(bool condition, const std::string& message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << '\n';
    }
    return condition;
}

} // namespace

int main() {
    bool passed = true;
    const pmt::GrayFrame reference = makeFrame(72, 64, 0, 0, 0);
    const pmt::TrackingSettings settings { 5, 10, 0.8 };

    const pmt::GrayFrame translated = makeFrame(72, 64, 4, -3, 0);
    const pmt::TrackingResult translation = pmt::trackPoint(reference, translated, { 35.0, 31.0 }, settings);
    passed &= expect(translation.valid, "translated texture should remain trackable");
    passed &= expect(std::abs(translation.point.x - 39.0) < 0.01, "horizontal translation should be recovered");
    passed &= expect(std::abs(translation.point.y - 28.0) < 0.01, "vertical translation should be recovered");

    const pmt::GrayFrame brighter = makeFrame(72, 64, 2, 3, 20);
    const pmt::TrackingResult brightness = pmt::trackPoint(reference, brighter, { 35.0, 31.0 }, settings);
    passed &= expect(brightness.valid, "normalized correlation should tolerate brightness shifts");
    passed &= expect(std::abs(brightness.point.x - 37.0) < 0.01 && std::abs(brightness.point.y - 34.0) < 0.01, "bright translated point should be recovered");

    const pmt::TrackingResult boundary = pmt::trackPoint(reference, translated, { 2.0, 2.0 }, settings);
    passed &= expect(!boundary.valid, "a patch crossing the frame boundary should be rejected");

    pmt::GrayFrame flat;
    flat.width = 32;
    flat.height = 32;
    flat.pixels.resize(32u * 32u, 128u);
    const pmt::TrackingResult flatResult = pmt::trackPoint(flat, flat, { 16.0, 16.0 }, settings);
    passed &= expect(!flatResult.valid, "a textureless patch should not produce false confidence");

    if (!passed) {
        return 1;
    }
    std::cout << "Native tracking core tests passed.\n";
    return 0;
}
