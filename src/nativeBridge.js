(function (root) {
  "use strict";

  let addon = null;
  let loadError = "Le module natif sera activé après intégration du SDK UXP Hybrid Adobe.";

  // Probe the future native addon without preventing the standard UXP prototype from loading.
  function probe() {
    if (addon) {
      return { available: true, version: addon.getVersion ? addon.getVersion() : "unknown", error: "" };
    }
    return { available: false, version: "", error: loadError };
  }

  // Keep one stable API for the UI while OpenCV decoding is implemented in the native milestone.
  async function inspectMedia(mediaPath) {
    if (!addon || typeof addon.inspectMedia !== "function") {
      throw new Error(loadError);
    }
    return addon.inspectMedia(String(mediaPath || ""));
  }

  root.PMT_NATIVE = {
    probe,
    inspectMedia
  };
}(window));

