#include "media_inspector.h"

#include <opencv2/core.hpp>
#include <opencv2/imgcodecs.hpp>
#include <opencv2/imgproc.hpp>
#include <opencv2/videoio.hpp>

#include <cmath>
#include <cstdlib>
#include <cstdio>
#include <array>
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
    const std::filesystem::path recoveryPath = std::filesystem::temp_directory_path() / "pmt-surface-recovery-sample.avi";
    const std::filesystem::path imagePath = std::filesystem::temp_directory_path() / "pmt-media-inspector-target.png";
    const std::filesystem::path previewPath = std::filesystem::temp_directory_path() / "pmt-media-inspector-preview.png";
    const std::filesystem::path cachePath = std::filesystem::temp_directory_path() / "pmt-media-inspector-cache";
    const std::filesystem::path offsetCachePath = std::filesystem::temp_directory_path() / "pmt-media-inspector-offset-cache";
    std::error_code directoryError;
    std::filesystem::remove_all(cachePath, directoryError);
    std::filesystem::remove_all(offsetCachePath, directoryError);
    std::filesystem::create_directories(cachePath, directoryError);
    std::filesystem::create_directories(offsetCachePath, directoryError);
    passed &= expect(!directoryError, "native preview cache directory should be created");
    // Generate an opaque, textured object with a known translation inside transparent PNG frames.
    {
        cv::Mat reference(128, 160, CV_8UC4, cv::Scalar(0, 0, 0, 0));
        cv::RNG random(12345);
        for (int y = 30; y < 100; ++y) for (int x = 30; x < 100; ++x) {
            const unsigned char value = static_cast<unsigned char>(random.uniform(20, 255));
            reference.at<cv::Vec4b>(y, x) = cv::Vec4b(value, value, value, 255);
        }
        std::vector<std::string> paths;
        for (int i = 0; i < 3; ++i) {
            cv::Mat shifted;
            const cv::Matx23d affine(1, 0, i * 3, 0, 1, i * 2);
            cv::warpAffine(reference, shifted, affine, reference.size(), cv::INTER_NEAREST, cv::BORDER_CONSTANT, cv::Scalar(0, 0, 0, 0));
            const std::filesystem::path path = cachePath / ("masked-" + std::to_string(i) + ".png");
            cv::imwrite(path.string(), shifted);
            paths.push_back(path.string());
        }
        try {
            const auto samples = pmt::trackMaskedFrames(paths, 1.0, 1.0 / 30.0);
            passed &= expect(samples.size() == 3, "mask tracking should return every image");
            passed &= expect(std::abs((samples.back().x - samples.front().x) * 160.0 - 6.0) < 1.0, "mask tracking should recover horizontal translation");
            passed &= expect(std::abs((samples.back().y - samples.front().y) * 128.0 - 4.0) < 1.0, "mask tracking should recover vertical translation");
            passed &= expect(std::abs(samples.back().rotation) < 2.0, "translation should not introduce rotation");
        } catch (const std::exception& error) {
            std::cerr << "Mask tracking error: " << error.what() << '\n';
            passed = false;
        }
    }
    // Allow an explicitly supplied real Premiere export to supplement the portable synthetic test.
    if (const char* realMaskFolder = std::getenv("PMT_MASK_TEST_FOLDER")) {
        std::vector<std::string> paths;
        for (int i = 0; i < 60; ++i) {
            char filename[32];
            std::snprintf(filename, sizeof(filename), "frame-%04d.png", i);
            paths.push_back((std::filesystem::path(realMaskFolder) / filename).string());
        }
        try {
            const auto samples = pmt::trackMaskedFrames(paths, 0, 1.0 / 30.0);
            passed &= expect(samples.size() == 60, "real mask sample should retain all frames");
            passed &= expect(std::abs(samples.back().rotation + 13.7) < 2.0, "real mask rotation should match the reference experiment");
        } catch (const std::exception& error) {
            std::cerr << "Real mask tracking error: " << error.what() << '\n';
            passed = false;
        }
    }
    cv::VideoWriter writer(samplePath.string(), cv::VideoWriter::fourcc('M', 'J', 'P', 'G'), 12.0, cv::Size(96, 64));
    passed &= expect(writer.isOpened(), "OpenCV should create the temporary motion-tracking sample");
    if (writer.isOpened()) {
        for (int frameIndex = 0; frameIndex < 4; frameIndex += 1) {
            // Move a textured square by (+2, +1) pixels on each frame for the Lucas-Kanade check.
            cv::Mat frame(64, 96, CV_8UC3, cv::Scalar(15, 15, 15));
            const int originX = 30 + frameIndex * 2;
            const int originY = 25 + frameIndex;
            for (int y = 0; y < 24; y += 1) {
                for (int x = 0; x < 24; x += 1) {
                    const unsigned char checker = static_cast<unsigned char>(((x / 2 + y / 2) % 2) * 90);
                    frame.at<cv::Vec3b>(originY + y, originX + x) = cv::Vec3b(
                        static_cast<unsigned char>(30 + x * 12 + checker),
                        static_cast<unsigned char>(50 + y * 10 + checker),
                        static_cast<unsigned char>(180 - (x + y) * 5 - checker / 3)
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
            const pmt::PreviewFrame preview = pmt::renderPreviewFrame(samplePath.string(), 0.2, previewPath.string(), 48);
            passed &= expect(preview.width == 48 && preview.height == 32, "native preview should resize the original decoded frame");
            passed &= expect(std::filesystem::exists(previewPath), "native preview should write its PNG output");
            const std::vector<pmt::MediaTrackingSample> samples = pmt::trackMedia(samplePath.string(), 36.0 / 95.0, 31.0 / 63.0, 0.0, 0.3);
            passed &= expect(samples.size() >= 4, "tracker should return each frame in the requested sample range");
            const pmt::MediaTrackingSample& finalSample = samples.back();
            passed &= expect(finalSample.valid, "forward-backward tracking should validate the textured sample point");
            passed &= expect(std::abs(finalSample.x - 42.0 / 95.0) < 0.06 && std::abs(finalSample.y - 34.0 / 63.0) < 0.06, "tracker should recover the generated square motion");
            std::size_t publishedSamples = 0;
            // Verify that the worker-facing callback receives every durable sample without changing the final trajectory.
            const std::vector<pmt::MediaTrackingSample> streamedSamples = pmt::trackMedia(
                samplePath.string(),
                36.0 / 95.0,
                31.0 / 63.0,
                0.0,
                0.3,
                [&publishedSamples](const pmt::MediaTrackingSample&) {
                    publishedSamples += 1;
                    return true;
                }
            );
            passed &= expect(publishedSamples == streamedSamples.size(), "progress callback should publish every tracked sample");
            // Track the whole textured patch as a plane and verify its four corners receive the generated translation.
            const std::array<std::array<double, 2>, 4> surfaceCorners {{
                {{ 29.0 / 95.0, 24.0 / 63.0 }},
                {{ 55.0 / 95.0, 24.0 / 63.0 }},
                {{ 55.0 / 95.0, 50.0 / 63.0 }},
                {{ 29.0 / 95.0, 50.0 / 63.0 }}
            }};
            const std::vector<pmt::SurfaceTrackingSample> surfaceSamples = pmt::trackSurface(samplePath.string(), surfaceCorners, 0.0, 0.3);
            passed &= expect(surfaceSamples.size() >= 4, "surface tracker should return each frame in the requested range");
            const pmt::SurfaceTrackingSample& finalSurfaceSample = surfaceSamples.back();
            passed &= expect(finalSurfaceSample.valid, "surface tracker should validate the generated textured plane");
            passed &= expect(std::abs(finalSurfaceSample.corners[0][0] - 35.0 / 95.0) < 0.08 && std::abs(finalSurfaceSample.corners[0][1] - 27.0 / 63.0) < 0.08, "surface tracker should recover the generated plane motion");

            const std::vector<pmt::MediaTrackingSample> cachedPreview = pmt::cacheMediaPreview(samplePath.string(), 0.0, 0.3, {}, cachePath.string());
            passed &= expect(cachedPreview.size() >= 4, "preview preparation should write a local frame cache");
            // Start after frame zero to prove cached source frame numbers never become image-sequence offsets.
            const std::vector<pmt::MediaTrackingSample> offsetCachedPreview = pmt::cacheMediaPreview(samplePath.string(), 1.0 / 12.0, 0.25, {}, offsetCachePath.string());
            passed &= expect(offsetCachedPreview.size() >= 3, "offset preview preparation should retain every requested cache frame");
            // Replace the source with blank frames: successful motion proves tracking prefers the completed local cache.
            cv::VideoWriter replacementWriter(samplePath.string(), cv::VideoWriter::fourcc('M', 'J', 'P', 'G'), 12.0, cv::Size(96, 64));
            passed &= expect(replacementWriter.isOpened(), "test should replace the source after caching it");
            if (replacementWriter.isOpened()) {
                for (int frameIndex = 0; frameIndex < 4; frameIndex += 1) replacementWriter.write(cv::Mat(64, 96, CV_8UC3, cv::Scalar(15, 15, 15)));
                replacementWriter.release();
                const std::vector<pmt::MediaTrackingSample> cachedTracking = pmt::trackMedia(samplePath.string(), 36.0 / 95.0, 31.0 / 63.0, 0.0, 0.3, {}, 10, cachePath.string());
                passed &= expect(cachedTracking.back().valid, "tracking should keep using local cached frames after the source changes");
                passed &= expect(std::abs(cachedTracking.back().x - 42.0 / 95.0) < 0.06 && std::abs(cachedTracking.back().y - 34.0 / 63.0) < 0.06, "local cached tracking should retain the original motion");
                const std::vector<pmt::MediaTrackingSample> offsetCachedTracking = pmt::trackMedia(samplePath.string(), 36.0 / 95.0, 31.0 / 63.0, 1.0 / 12.0, 0.25, {}, 10, offsetCachePath.string());
                passed &= expect(offsetCachedTracking.size() >= 3, "tracking should read every cached frame after a nonzero source offset");
            }
        } catch (const std::exception& error) {
            passed &= expect(false, std::string("decoder should open the generated sample: ") + error.what());
        }
    }
    // Insert one detail-free frame to prove Surface tracking publishes the full range and recovers afterward.
    cv::VideoWriter recoveryWriter(recoveryPath.string(), cv::VideoWriter::fourcc('M', 'J', 'P', 'G'), 12.0, cv::Size(96, 64));
    passed &= expect(recoveryWriter.isOpened(), "OpenCV should create the temporary Surface recovery sample");
    if (recoveryWriter.isOpened()) {
        for (int frameIndex = 0; frameIndex < 6; frameIndex += 1) {
            cv::Mat frame(64, 96, CV_8UC3, cv::Scalar(15, 15, 15));
            if (frameIndex != 2) {
                // Keep a textured plane before and after the dropout so a later frame can reseed features.
                const int originX = 28 + frameIndex * 2;
                const int originY = 22 + frameIndex;
                for (int y = 0; y < 28; y += 1) {
                    for (int x = 0; x < 28; x += 1) {
                        const unsigned char checker = static_cast<unsigned char>(((x / 2 + y / 2) % 2) * 90);
                        frame.at<cv::Vec3b>(originY + y, originX + x) = cv::Vec3b(
                            static_cast<unsigned char>(30 + x * 7 + checker),
                            static_cast<unsigned char>(50 + y * 6 + checker),
                            static_cast<unsigned char>(180 - (x + y) * 3 - checker / 3)
                        );
                    }
                }
            }
            recoveryWriter.write(frame);
        }
        recoveryWriter.release();
        try {
            const std::array<std::array<double, 2>, 4> recoveryCorners {{
                {{ 27.0 / 95.0, 21.0 / 63.0 }},
                {{ 57.0 / 95.0, 21.0 / 63.0 }},
                {{ 57.0 / 95.0, 51.0 / 63.0 }},
                {{ 27.0 / 95.0, 51.0 / 63.0 }}
            }};
            const std::vector<pmt::SurfaceTrackingSample> recoverySamples = pmt::trackSurface(recoveryPath.string(), recoveryCorners, 0.0, 0.42);
            passed &= expect(recoverySamples.size() >= 6, "surface tracker should continue after one detail-free frame");
            passed &= expect(!recoverySamples[2].valid, "the detail-free frame should be reported as uncertain");
            passed &= expect(recoverySamples.back().valid, "surface tracker should reseed features and recover on later frames");
        } catch (const std::exception& error) {
            passed &= expect(false, std::string("surface tracker should recover after a dropout: ") + error.what());
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
    std::filesystem::remove(recoveryPath, removeError);
    passed &= expect(!removeError, "temporary Surface recovery media should be removable");
    std::filesystem::remove(imagePath, removeError);
    passed &= expect(!removeError, "temporary target image should be removable");
    std::filesystem::remove(previewPath, removeError);
    passed &= expect(!removeError, "temporary preview image should be removable");
    std::filesystem::remove_all(cachePath, removeError);
    passed &= expect(!removeError, "temporary preview cache should be removable");
    std::filesystem::remove_all(offsetCachePath, removeError);
    passed &= expect(!removeError, "temporary offset preview cache should be removable");

    if (!passed) {
        return 1;
    }
    std::cout << "Media inspector tests passed.\n";
    return 0;
}
