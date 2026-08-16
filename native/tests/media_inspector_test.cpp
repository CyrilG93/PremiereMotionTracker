#include "media_inspector.h"

#include <opencv2/core.hpp>
#include <opencv2/videoio.hpp>

#include <cmath>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {

// Report a readable native-test failure without introducing a testing framework.
bool expect(bool condition, const std::string& message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << '\n';
    }
    return condition;
}

} // namespace

int main() {
    bool passed = true;
    try {
        (void)pmt::inspectMedia("");
        passed &= expect(false, "an empty media path should be rejected");
    } catch (const std::invalid_argument&) {
        // The public boundary must explain that a Premiere source path is required.
    } catch (...) {
        passed &= expect(false, "an empty media path should throw invalid_argument");
    }

    try {
        (void)pmt::inspectMedia("C:/pmt/does-not-exist.mp4");
        passed &= expect(false, "a missing media path should be rejected");
    } catch (const std::runtime_error&) {
        // The decoder should fail explicitly instead of creating a silent empty session.
    } catch (...) {
        passed &= expect(false, "a missing media path should throw runtime_error");
    }

    // Create a small deterministic clip so the decoder is tested without depending on user media.
    const std::filesystem::path samplePath = std::filesystem::temp_directory_path() / "pmt-media-inspector-sample.avi";
    cv::VideoWriter writer(samplePath.string(), cv::VideoWriter::fourcc('M', 'J', 'P', 'G'), 12.0, cv::Size(24, 16));
    passed &= expect(writer.isOpened(), "OpenCV should create the temporary motion-tracking sample");
    if (writer.isOpened()) {
        for (int frameIndex = 0; frameIndex < 4; frameIndex += 1) {
            // Change each frame so the produced file is a valid short motion sequence.
            writer.write(cv::Mat(16, 24, CV_8UC3, cv::Scalar(frameIndex * 40, 20, 200)));
        }
        writer.release();
        try {
            const pmt::MediaInspection inspection = pmt::inspectMedia(samplePath.string());
            passed &= expect(inspection.width == 24 && inspection.height == 16, "decoder should recover the sample dimensions");
            passed &= expect(inspection.frameCount >= 1, "decoder should report at least one sample frame");
            passed &= expect(std::abs(inspection.framesPerSecond - 12.0) < 0.1, "decoder should recover the sample frame rate");
            passed &= expect(!inspection.backend.empty(), "decoder should report the selected video backend");
        } catch (const std::exception& error) {
            passed &= expect(false, std::string("decoder should open the generated sample: ") + error.what());
        }
    }
    // Remove the temporary media even when a preceding assertion failed.
    std::error_code removeError;
    std::filesystem::remove(samplePath, removeError);
    passed &= expect(!removeError, "temporary sample media should be removable");

    if (!passed) {
        return 1;
    }
    std::cout << "Media inspector tests passed.\n";
    return 0;
}
