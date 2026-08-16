#include "UxpAddon.h"
#include "tracker_core.h"

#include <cstdint>
#include <stdexcept>
#include <string>

namespace {

// Convert one native string into a JavaScript string owned by the current UXP environment.
addon_value createString(addon_env env, const std::string& value) {
    addon_value result = nullptr;
    Check(UxpAddonApis.uxp_addon_create_string_utf8(env, value.c_str(), value.size(), &result));
    return result;
}

// Expose the native module version so diagnostics can prove which binary Premiere loaded.
addon_value getVersion(addon_env env, addon_callback_info info) {
    try {
        (void)info;
        return createString(env, "0.1.8-native");
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
    return exports;
}

// Release future decoder and tracker resources when Premiere unloads the addon.
void terminate(addon_env env) {
    (void)env;
}

} // namespace

UXP_ADDON_INIT(init)
UXP_ADDON_TERMINATE(terminate)
