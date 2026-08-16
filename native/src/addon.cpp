#include "UxpAddon.h"
#include "tracker_core.h"

#if defined(PMT_WITH_OPENCV)
#include "media_inspector.h"
#endif

#include <cstdint>
#include <stdexcept>
#include <string>
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
            addon_value item = nullptr;
            Check(UxpAddonApis.uxp_addon_create_object(env, &item));
            setNumberProperty(env, item, "frame", static_cast<double>(sample.frame));
            setNumberProperty(env, item, "seconds", sample.seconds);
            setNumberProperty(env, item, "x", sample.x);
            setNumberProperty(env, item, "y", sample.y);
            setNumberProperty(env, item, "confidence", sample.confidence);
            addon_value valid = nullptr;
            Check(UxpAddonApis.uxp_addon_get_boolean(env, sample.valid, &valid));
            Check(UxpAddonApis.uxp_addon_set_named_property(env, item, "valid", valid));
            Check(UxpAddonApis.uxp_addon_set_element(env, result, static_cast<std::uint32_t>(index), item));
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
    return exports;
}

// Release future decoder and tracker resources when Premiere unloads the addon.
void terminate(addon_env env) {
    (void)env;
}

} // namespace

UXP_ADDON_INIT(init)
UXP_ADDON_TERMINATE(terminate)
