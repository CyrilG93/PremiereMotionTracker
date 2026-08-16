#include "UxpAddon.h"

// Register the native bootstrap module; OpenCV exports will be added after the SDK build is validated.
addon_value init(addon_env env, addon_value exports) {
    return exports;
}

// Release future decoder and tracker resources when Premiere unloads the addon.
void terminate() {
}

UXP_ADDON_INIT(init);
UXP_ADDON_TERMINATE(terminate);

