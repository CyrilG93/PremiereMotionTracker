#include "UxpAddon.h"
#include "media_inspector.h"
#include "tracker_core.h"

#include <algorithm>
#include <cstdint>
#include <atomic>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

namespace {

// Convert one native string into a JavaScript string owned by the current UXP environment.
addon_value createString(addon_env env, const std::string& value) {
    addon_value result = nullptr;
    Check(UxpAddonApis.uxp_addon_create_string_utf8(env, value.c_str(), value.size(), &result));
    return result;
}

// Convert the first JavaScript argument into a UTF-8 string while it is valid on the callback stack.
std::string readFirstStringArgument(addon_env env, addon_callback_info info) {
    addon_value argument = nullptr;
    std::size_t argumentCount = 1;
    Check(UxpAddonApis.uxp_addon_get_cb_info(env, info, &argumentCount, &argument, nullptr, nullptr));
    if (argumentCount != 1) {
        throw std::invalid_argument("Un chemin média est requis.");
    }
    std::size_t byteCount = 0;
    Check(UxpAddonApis.uxp_addon_get_value_string_utf8(env, argument, nullptr, 0, &byteCount));
    // Reserve a trailing byte because the UXP API writes a null terminator with the UTF-8 text.
    std::vector<char> buffer(byteCount + 1, '\0');
    if (byteCount > 0) {
        std::size_t copiedByteCount = 0;
        Check(UxpAddonApis.uxp_addon_get_value_string_utf8(env, argument, buffer.data(), buffer.size(), &copiedByteCount));
        return std::string(buffer.data(), copiedByteCount);
    }
    return {};
}

// Read five tracking arguments from JavaScript: path, point X/Y, and media start/end seconds.
void readTrackingArguments(
    addon_env env,
    addon_callback_info info,
    std::string& mediaPath,
    double& normalizedX,
    double& normalizedY,
    double& startSeconds,
    double& endSeconds
) {
    addon_value arguments[5] = { nullptr, nullptr, nullptr, nullptr, nullptr };
    std::size_t argumentCount = 5;
    Check(UxpAddonApis.uxp_addon_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr));
    if (argumentCount != 5) {
        throw std::invalid_argument("Le tracking requiert un média, un point et une plage.");
    }
    std::size_t byteCount = 0;
    Check(UxpAddonApis.uxp_addon_get_value_string_utf8(env, arguments[0], nullptr, 0, &byteCount));
    std::vector<char> pathBuffer(byteCount + 1, '\0');
    if (byteCount > 0) {
        std::size_t copiedByteCount = 0;
        Check(UxpAddonApis.uxp_addon_get_value_string_utf8(env, arguments[0], pathBuffer.data(), pathBuffer.size(), &copiedByteCount));
        mediaPath.assign(pathBuffer.data(), copiedByteCount);
    }
    Check(UxpAddonApis.uxp_addon_get_value_double(env, arguments[1], &normalizedX));
    Check(UxpAddonApis.uxp_addon_get_value_double(env, arguments[2], &normalizedY));
    Check(UxpAddonApis.uxp_addon_get_value_double(env, arguments[3], &startSeconds));
    Check(UxpAddonApis.uxp_addon_get_value_double(env, arguments[4], &endSeconds));
}

// Store a native number as one property of the object returned to JavaScript.
void setNumberProperty(addon_env env, addon_value object, const char* name, double value) {
    addon_value number = nullptr;
    Check(UxpAddonApis.uxp_addon_create_double(env, value, &number));
    Check(UxpAddonApis.uxp_addon_set_named_property(env, object, name, number));
}

// Store a native string as one property of the object returned to JavaScript.
void setStringProperty(addon_env env, addon_value object, const char* name, const std::string& value) {
    Check(UxpAddonApis.uxp_addon_set_named_property(env, object, name, createString(env, value)));
}

// Store one boolean property on an object returned to the UXP panel.
void setBooleanProperty(addon_env env, addon_value object, const char* name, bool value) {
    addon_value booleanValue = nullptr;
    Check(UxpAddonApis.uxp_addon_get_boolean(env, value, &booleanValue));
    Check(UxpAddonApis.uxp_addon_set_named_property(env, object, name, booleanValue));
}

// Convert a durable tracking sample into a plain JavaScript object without passing native frame buffers to UXP.
addon_value createTrackingSample(addon_env env, const pmt::MediaTrackingSample& sample) {
    addon_value item = nullptr;
    Check(UxpAddonApis.uxp_addon_create_object(env, &item));
    setNumberProperty(env, item, "frame", static_cast<double>(sample.frame));
    setNumberProperty(env, item, "seconds", sample.seconds);
    setNumberProperty(env, item, "x", sample.x);
    setNumberProperty(env, item, "y", sample.y);
    setNumberProperty(env, item, "confidence", sample.confidence);
    setBooleanProperty(env, item, "valid", sample.valid);
    return item;
}

// Retain one asynchronous native tracking operation while the JavaScript panel polls lightweight progress batches.
struct TrackingTask {
    std::mutex mutex;
    std::vector<pmt::MediaTrackingSample> samples;
    std::string error;
    std::atomic<bool> cancelRequested { false };
    std::atomic<bool> cancelled { false };
    std::atomic<bool> done { false };
    std::thread worker;
};

std::mutex trackingTasksMutex;
std::unordered_map<std::string, std::shared_ptr<TrackingTask>> trackingTasks;
std::atomic<std::uint64_t> nextTrackingTaskId { 1 };

// Read one task identifier and the number of samples already consumed by the panel.
void readTrackingPollArguments(addon_env env, addon_callback_info info, std::string& taskId, std::size_t& afterIndex) {
    addon_value arguments[2] = { nullptr, nullptr };
    std::size_t argumentCount = 2;
    Check(UxpAddonApis.uxp_addon_get_cb_info(env, info, &argumentCount, arguments, nullptr, nullptr));
    if (argumentCount != 2) {
        throw std::invalid_argument("Le suivi en direct requiert un identifiant et un index.");
    }
    std::size_t byteCount = 0;
    Check(UxpAddonApis.uxp_addon_get_value_string_utf8(env, arguments[0], nullptr, 0, &byteCount));
    std::vector<char> idBuffer(byteCount + 1, '\0');
    if (byteCount > 0) {
        std::size_t copiedByteCount = 0;
        Check(UxpAddonApis.uxp_addon_get_value_string_utf8(env, arguments[0], idBuffer.data(), idBuffer.size(), &copiedByteCount));
        taskId.assign(idBuffer.data(), copiedByteCount);
    }
    double rawAfterIndex = 0.0;
    Check(UxpAddonApis.uxp_addon_get_value_double(env, arguments[1], &rawAfterIndex));
    afterIndex = rawAfterIndex > 0.0 ? static_cast<std::size_t>(rawAfterIndex) : 0;
}

// Read one task identifier from a UXP callback without retaining the temporary JavaScript value.
std::string readTrackingTaskId(addon_env env, addon_callback_info info) {
    return readFirstStringArgument(env, info);
}

// Expose the native module version so diagnostics can prove which binary Premiere loaded.
addon_value getVersion(addon_env env, addon_callback_info info) {
    try {
        (void)info;
        return createString(env, PMT_ADDON_VERSION);
    } catch (...) {
        return CreateErrorFromException(env);
    }
}

// Exercise the linked tracking core without requiring OpenCV or access to a user video.
addon_value runSelfTest(addon_env env, addon_callback_info info) {
    try {
        (void)info;
        constexpr int width = 21;
        constexpr int height = 21;
        pmt::GrayFrame previous { width, height, std::vector<std::uint8_t>(width * height, 0) };
        pmt::GrayFrame current { width, height, std::vector<std::uint8_t>(width * height, 0) };

        // Copy an asymmetric textured patch with a known translation of (+2, +1).
        for (int offsetY = -2; offsetY <= 2; offsetY += 1) {
            for (int offsetX = -2; offsetX <= 2; offsetX += 1) {
                const auto value = static_cast<std::uint8_t>(40 + (offsetX + 2) * 19 + (offsetY + 2) * 7 + (offsetX * offsetY + 4) * 3);
                previous.pixels[static_cast<std::size_t>((8 + offsetY) * width + 8 + offsetX)] = value;
                current.pixels[static_cast<std::size_t>((9 + offsetY) * width + 10 + offsetX)] = value;
            }
        }

        const pmt::TrackingSettings settings { 2, 4, 0.9 };
        const pmt::TrackingResult result = pmt::trackPoint(previous, current, { 8.0, 8.0 }, settings);
        if (!result.valid || result.point.x != 10.0 || result.point.y != 9.0) {
            throw std::runtime_error("native tracking self-test failed");
        }
        return createString(env, "ok");
    } catch (...) {
        return CreateErrorFromException(env);
    }
}

// Inspect one Premiere source path through OpenCV before the full frame-by-frame tracker is enabled.
addon_value inspectMedia(addon_env env, addon_callback_info info) {
    try {
#if defined(PMT_WITH_OPENCV)
        const pmt::MediaInspection inspection = pmt::inspectMedia(readFirstStringArgument(env, info));
        addon_value result = nullptr;
        Check(UxpAddonApis.uxp_addon_create_object(env, &result));
        setStringProperty(env, result, "path", inspection.path);
        setStringProperty(env, result, "backend", inspection.backend);
        setNumberProperty(env, result, "width", inspection.width);
        setNumberProperty(env, result, "height", inspection.height);
        setNumberProperty(env, result, "frameCount", static_cast<double>(inspection.frameCount));
        setNumberProperty(env, result, "framesPerSecond", inspection.framesPerSecond);
        setNumberProperty(env, result, "durationSeconds", inspection.durationSeconds);
        return result;
#else
        (void)info;
        throw std::runtime_error("L’addon a été construit sans OpenCV.");
#endif
    } catch (...) {
        return CreateErrorFromException(env);
    }
}

// Return native Lucas-Kanade samples as plain JavaScript values for the durable panel session.
addon_value trackMedia(addon_env env, addon_callback_info info) {
    try {
#if defined(PMT_WITH_OPENCV)
        std::string mediaPath;
        double normalizedX = 0.0;
        double normalizedY = 0.0;
        double startSeconds = 0.0;
        double endSeconds = 0.0;
        readTrackingArguments(env, info, mediaPath, normalizedX, normalizedY, startSeconds, endSeconds);
        const std::vector<pmt::MediaTrackingSample> samples = pmt::trackMedia(mediaPath, normalizedX, normalizedY, startSeconds, endSeconds);
        addon_value result = nullptr;
        Check(UxpAddonApis.uxp_addon_create_array_with_length(env, samples.size(), &result));
        for (std::size_t index = 0; index < samples.size(); index += 1) {
            const pmt::MediaTrackingSample& sample = samples[index];
            Check(UxpAddonApis.uxp_addon_set_element(env, result, static_cast<std::uint32_t>(index), createTrackingSample(env, sample)));
        }
        return result;
#else
        (void)info;
        throw std::runtime_error("L’addon a été construit sans OpenCV.");
#endif
    } catch (...) {
        return CreateErrorFromException(env);
    }
}

// Start tracking on a native worker so Premiere's UXP panel remains responsive and can paint live progress.
addon_value startTracking(addon_env env, addon_callback_info info) {
    try {
#if defined(PMT_WITH_OPENCV)
        std::string mediaPath;
        double normalizedX = 0.0;
        double normalizedY = 0.0;
        double startSeconds = 0.0;
        double endSeconds = 0.0;
        readTrackingArguments(env, info, mediaPath, normalizedX, normalizedY, startSeconds, endSeconds);
        const std::string taskId = "tracking-" + std::to_string(nextTrackingTaskId.fetch_add(1));
        const auto task = std::make_shared<TrackingTask>();
        {
            std::lock_guard<std::mutex> lock(trackingTasksMutex);
            trackingTasks.emplace(taskId, task);
        }
        task->worker = std::thread([task, mediaPath, normalizedX, normalizedY, startSeconds, endSeconds]() {
            try {
                pmt::trackMedia(mediaPath, normalizedX, normalizedY, startSeconds, endSeconds, [task](const pmt::MediaTrackingSample& sample) {
                    if (task->cancelRequested.load()) {
                        return false;
                    }
                    // Copy only durable coordinates and confidence values while OpenCV owns its decoded frame memory.
                    std::lock_guard<std::mutex> lock(task->mutex);
                    task->samples.push_back(sample);
                    return true;
                });
            } catch (const std::exception& error) {
                std::lock_guard<std::mutex> lock(task->mutex);
                if (task->cancelRequested.load()) {
                    task->cancelled.store(true);
                } else {
                    task->error = error.what();
                }
            }
            task->done.store(true);
        });
        return createString(env, taskId);
#else
        (void)info;
        throw std::runtime_error("L’addon a été construit sans OpenCV.");
#endif
    } catch (...) {
        return CreateErrorFromException(env);
    }
}

// Return only new samples so frequent UXP progress polls remain compact on long source ranges.
addon_value pollTracking(addon_env env, addon_callback_info info) {
    try {
#if defined(PMT_WITH_OPENCV)
        std::string taskId;
        std::size_t afterIndex = 0;
        readTrackingPollArguments(env, info, taskId, afterIndex);
        std::shared_ptr<TrackingTask> task;
        {
            std::lock_guard<std::mutex> lock(trackingTasksMutex);
            const auto iterator = trackingTasks.find(taskId);
            if (iterator == trackingTasks.end()) {
                throw std::runtime_error("La tâche de tracking est introuvable ou déjà libérée.");
            }
            task = iterator->second;
        }
        std::vector<pmt::MediaTrackingSample> newSamples;
        std::string error;
        std::size_t nextIndex = 0;
        {
            std::lock_guard<std::mutex> lock(task->mutex);
            const std::size_t safeAfterIndex = std::min(afterIndex, task->samples.size());
            newSamples.assign(task->samples.begin() + static_cast<std::ptrdiff_t>(safeAfterIndex), task->samples.end());
            nextIndex = task->samples.size();
            error = task->error;
        }
        const bool done = task->done.load();
        const bool cancelled = task->cancelled.load();
        if (done && task->worker.joinable()) {
            task->worker.join();
        }
        addon_value result = nullptr;
        Check(UxpAddonApis.uxp_addon_create_object(env, &result));
        addon_value samples = nullptr;
        Check(UxpAddonApis.uxp_addon_create_array_with_length(env, newSamples.size(), &samples));
        for (std::size_t index = 0; index < newSamples.size(); index += 1) {
            Check(UxpAddonApis.uxp_addon_set_element(env, samples, static_cast<std::uint32_t>(index), createTrackingSample(env, newSamples[index])));
        }
        Check(UxpAddonApis.uxp_addon_set_named_property(env, result, "samples", samples));
        setNumberProperty(env, result, "nextIndex", static_cast<double>(nextIndex));
        setBooleanProperty(env, result, "done", done);
        setBooleanProperty(env, result, "cancelled", cancelled);
        setStringProperty(env, result, "error", error);
        if (done) {
            // A completed task is no longer needed once its final batch has been returned to JavaScript.
            std::lock_guard<std::mutex> lock(trackingTasksMutex);
            trackingTasks.erase(taskId);
        }
        return result;
#else
        (void)info;
        throw std::runtime_error("L’addon a été construit sans OpenCV.");
#endif
    } catch (...) {
        return CreateErrorFromException(env);
    }
}

// Ask the worker to stop between decoded frames and retain its partial result for one final poll.
addon_value cancelTracking(addon_env env, addon_callback_info info) {
    try {
#if defined(PMT_WITH_OPENCV)
        const std::string taskId = readTrackingTaskId(env, info);
        std::lock_guard<std::mutex> lock(trackingTasksMutex);
        const auto iterator = trackingTasks.find(taskId);
        if (iterator == trackingTasks.end()) {
            throw std::runtime_error("La tâche de tracking est introuvable.");
        }
        iterator->second->cancelRequested.store(true);
        addon_value result = nullptr;
        Check(UxpAddonApis.uxp_addon_get_boolean(env, true, &result));
        return result;
#else
        (void)info;
        throw std::runtime_error("L’addon a été construit sans OpenCV.");
#endif
    } catch (...) {
        return CreateErrorFromException(env);
    }
}

// Register one synchronous native function on the JavaScript exports object.
void registerFunction(
    addon_env env,
    addon_value exports,
    const char* name,
    addon_callback callback,
    const addon_apis& addonAPIs
) {
    addon_value function = nullptr;
    if (addonAPIs.uxp_addon_create_function(env, nullptr, 0, callback, nullptr, &function) != addon_ok) {
        throw std::runtime_error(std::string("Unable to create native function: ") + name);
    }
    if (addonAPIs.uxp_addon_set_named_property(env, exports, name, function) != addon_ok) {
        throw std::runtime_error(std::string("Unable to export native function: ") + name);
    }
}

// Register the native bootstrap module; media decoding exports come in the OpenCV milestone.
addon_value init(addon_env env, addon_value exports, const addon_apis& addonAPIs) {
    registerFunction(env, exports, "getVersion", getVersion, addonAPIs);
    registerFunction(env, exports, "runSelfTest", runSelfTest, addonAPIs);
    registerFunction(env, exports, "inspectMedia", inspectMedia, addonAPIs);
    registerFunction(env, exports, "trackMedia", trackMedia, addonAPIs);
    registerFunction(env, exports, "startTracking", startTracking, addonAPIs);
    registerFunction(env, exports, "pollTracking", pollTracking, addonAPIs);
    registerFunction(env, exports, "cancelTracking", cancelTracking, addonAPIs);
    return exports;
}

// Stop and join every worker before Premiere unloads the addon to avoid accessing released native code.
void terminate(addon_env env) {
    (void)env;
    std::vector<std::shared_ptr<TrackingTask>> tasks;
    {
        std::lock_guard<std::mutex> lock(trackingTasksMutex);
        for (const auto& entry : trackingTasks) {
            entry.second->cancelRequested.store(true);
            tasks.push_back(entry.second);
        }
        trackingTasks.clear();
    }
    for (const auto& task : tasks) {
        if (task->worker.joinable()) {
            task->worker.join();
        }
    }
}

} // namespace

UXP_ADDON_INIT(init)
UXP_ADDON_TERMINATE(terminate)
