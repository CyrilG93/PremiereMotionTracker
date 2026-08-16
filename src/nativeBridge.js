(function (root) {
  "use strict";

  let addon = null;
  let loadError = "";
  let selfTest = "non exécuté";
  let loadPromise = null;
  let exportNames = [];

  // Collect both enumerable keys and known functions because UXP proxies may hide native properties.
  function collectExportNames(candidate) {
    const names = [];
    if (!candidate) {
      return names;
    }
    ["getVersion", "runSelfTest", "inspectMedia", "trackMedia"].forEach((name) => {
      if (typeof candidate[name] === "function") {
        names.push(name);
      }
    });
    try {
      Object.keys(candidate).forEach((name) => {
        if (names.indexOf(name) === -1) {
          names.push(name);
        }
      });
    } catch (error) {
      // Known function probes above remain usable when the proxy refuses Object.keys().
    }
    return names.sort();
  }

  // Describe the received object so Hybrid loading failures remain actionable in diagnostics.
  function describeExports(candidate) {
    const names = collectExportNames(candidate);
    return names.length ? "exports reçus : " + names.join(", ") : "objet sans export détectable";
  }

  // Await Hybrid require because Premiere resolves native modules asynchronously.
  function initialize() {
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
      const loadedAddon = await require("premiere-motion-tracker-0.2.11.uxpaddon");
          exportNames = collectExportNames(loadedAddon);
          if (!loadedAddon || typeof loadedAddon.getVersion !== "function") {
            throw new Error("L’addon ne fournit pas getVersion() (" + describeExports(loadedAddon) + ").");
          }
          if (typeof loadedAddon.runSelfTest !== "function") {
            throw new Error("L’addon ne fournit pas runSelfTest() (" + describeExports(loadedAddon) + ").");
          }
          selfTest = String(loadedAddon.runSelfTest());
          if (selfTest !== "ok") {
            throw new Error("Autotest natif inattendu : " + selfTest);
          }
          addon = loadedAddon;
          loadError = "";
        } catch (error) {
          addon = null;
          loadError = error && error.message ? error.message : String(error);
        }
        return probe();
      })();
    }
    return loadPromise;
  }

  // Probe the native addon without preventing the panel from exposing a useful diagnostic.
  function probe() {
    if (addon) {
      return { available: true, loading: false, version: String(addon.getVersion()), selfTest, exportNames, error: "" };
    }
    return { available: false, loading: Boolean(loadPromise && !loadError), version: "", selfTest, exportNames, error: loadError };
  }

  // Keep one stable API for the UI while OpenCV decoding is implemented in the native milestone.
  async function inspectMedia(mediaPath) {
    if (!addon || typeof addon.inspectMedia !== "function") {
      throw new Error(loadError || "L’addon natif ne fournit pas inspectMedia().");
    }
    return addon.inspectMedia(String(mediaPath || ""));
  }

  // Delegate bounded Lucas-Kanade tracking to the addon without retaining native frame objects in UXP.
  async function trackMedia(mediaPath, normalizedPoint, startSeconds, endSeconds) {
    if (!addon || typeof addon.trackMedia !== "function") {
      throw new Error(loadError || "L’addon natif ne fournit pas trackMedia().");
    }
    const point = normalizedPoint || {};
    return addon.trackMedia(
      String(mediaPath || ""),
      Number(point.x),
      Number(point.y),
      Number(startSeconds),
      Number(endSeconds)
    );
  }

  root.PMT_NATIVE = {
    initialize,
    probe,
    inspectMedia,
    trackMedia
  };
}(window));
