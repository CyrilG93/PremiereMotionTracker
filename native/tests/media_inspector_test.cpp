#include "media_inspector.h"

#include <opencv2/core.hpp>
#include <opencv2/imgcodecs.hpp>
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
    const std::filesystem::path previewPath = std::filesystem::temp_directory_path() / "pmt-media-inspector-preview.mp4";
    const std::filesystem::path imagePath = std::filesystem::temp_directory_path() / "pmt-media-inspector-target.png";
    cv::VideoWriter writer(samplePath.string(), cv::VideoWriter::fourcc('M', 'J', 'P', 'G'), 12.0, cv::Size(96, 64));
    passed &= expect(writer.isOpened(), "OpenCV should create the temporary motion-tracking sample");
    if (writer.isOpened()) {
        for (int frameIndex = 0; frameIndex < 4; frameIndex += 1) {
            // Move a textured square by (+2, +1) pixels on each frame for the Lucas-Kanade check.
            cv::Mat frame(64, 96, CV_8UC3, cv::Scalar(15, 15, 15));
            const int originX = 30 + frameIndex * 2;
            const int originY = 25 + frameIndex;
            for (int y = 0; y < 12; y += 1) {
                for (int x = 0; x < 12; x += 1) {
                    frame.at<cv::Vec3b>(originY + y, originX + x) = cv::Vec3b(
                        static_cast<unsigned char>(30 + x * 16),
                        static_cast<unsigned char>(50 + y * 14),
                        static_cast<unsigned char>(180 - (x + y) * 5)
                    );
                }
            }
            writer.write(frame);
        }
        writer.release();
        try {
            const pmt::MediaInspection inspection = pmt::inspectMedia(samplePath.string());
            passed &= expect(inspection.width == 96 && inspection.height == 64, "decoder should recover the sample dimensions");
            passed &= expect(inspection.frameCount >= 1, "decoder should report at least one sample frame");
            passed &= expect(std::abs(inspection.framesPerSecond - 12.0) < 0.1, "decoder should recover the sample frame rate");
            passed &= expect(!inspection.backend.empty(), "decoder should report the selected video backend");
            const std::vector<pmt::MediaTrackingSample> samples = pmt::trackMedia(samplePath.string(), 36.0 / 95.0, 31.0 / 63.0, 0.0, 0.3);
            passed &= expect(samples.size() >= 4, "tracker should return each frame in the requested sample range");
            const pmt::MediaTrackingSample& finalSample = samples.back();
            passed &= expect(finalSample.valid, "forward-backward tracking should validate the textured sample point");
            passed &= expect(std::abs(finalSample.x - 42.0 / 95.0) < 0.06 && std::abs(finalSample.y - 34.0 / 63.0) < 0.06, "tracker should recover the generated square motion");
            const pmt::PreviewVideo preview = pmt::createPreviewVideo(samplePath.string(), 0.0, 0.3, previewPath.string());
            passed &= expect(preview.frameCount >= 4, "preview encoder should keep the bounded source frames");
            passed &= expect(preview.width <= 96 && preview.height <= 64, "preview encoder should avoid enlarging the source");
            const pmt::MediaInspection previewInspection = pmt::inspectMedia(previewPath.string());
            passed &= expect(previewInspection.frameCount >= 1, "decoder should reopen the generated MP4 preview");
        } catch (const std::exception& error) {
            passed &= expect(false, std::string("decoder should open the generated sample: ") + error.what());
        }
    }
    // Create a small image target to validate the dimension path used for graphics and logos.
    cv::Mat targetImage(192, 192, CV_8UC4, cv::Scalar(20, 180, 80, 255));
    passed &= expect(cv::imwrite(imagePath.string(), targetImage), "OpenCV should create the temporary target image");
    try {
        const pmt::MediaInspection targetInspection = pmt::inspectMedia(imagePath.string());
        passed &= expect(targetInspection.width == 192 && targetInspection.height == 192, "inspector should recover still-image target dimensions");
    } catch (const std::exception& error) {
        passed &= expect(false, std::string("inspector should open the generated target image: ") + error.what());
    }
    // Remove the temporary media even when a preceding assertion failed.
    std::error_code removeError;
    std::filesystem::remove(samplePath, removeError);
    passed &= expect(!removeError, "temporary sample media should be removable");
    std::filesystem::remove(previewPath, removeError);
    passed &= expect(!removeError, "temporary preview media should be removable");
    std::filesystem::remove(imagePath, removeError);
    passed &= expect(!removeError, "temporary target image should be removable");

    if (!passed) {
        return 1;
    }
    std::cout << "Media inspector tests passed.\n";
    return 0;
}
