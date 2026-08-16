(function (root) {
  "use strict";

  let addon = null;
  let loadError = "";
  let selfTest = "non exécuté";

  // Load the platform-specific Hybrid binary declared by manifest v6.
  try {
    addon = require("premiere-motion-tracker.uxpaddon");
    if (!addon || typeof addon.getVersion !== "function") {
      throw new Error("L’addon ne fournit pas getVersion().");
    }
    if (typeof addon.runSelfTest !== "function") {
      throw new Error("L’addon ne fournit pas runSelfTest().");
    }
    selfTest = String(addon.runSelfTest());
    if (selfTest !== "ok") {
      throw new Error("Autotest natif inattendu : " + selfTest);
    }
  } catch (error) {
    addon = null;
    loadError = error && error.message ? error.message : String(error);
  }

  // Probe the native addon without preventing the panel from exposing a useful diagnostic.
  function probe() {
    if (addon) {
      return { available: true, version: String(addon.getVersion()), selfTest, error: "" };
    }
    return { available: false, version: "", selfTest, error: loadError };
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
