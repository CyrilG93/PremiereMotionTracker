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
    ["getVersion", "runSelfTest", "inspectMedia", "trackMedia", "trackSurface", "startTracking", "pollTracking", "cancelTracking"].forEach((name) => {
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
      const loadedAddon = await require("premiere-motion-tracker-0.4.9.uxpaddon");
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
  async function trackMedia(mediaPath, normalizedPoint, startSeconds, endSeconds, searchRadius) {
    if (!addon || typeof addon.trackMedia !== "function") {
      throw new Error(loadError || "L’addon natif ne fournit pas trackMedia().");
    }
    const point = normalizedPoint || {};
    return addon.trackMedia(
      String(mediaPath || ""),
      Number(point.x),
      Number(point.y),
      Number(startSeconds),
      Number(endSeconds),
      Number(searchRadius) || 10
    );
  }

  // Delegate the four selected corners to the homography tracker without exposing OpenCV matrices to UXP.
  async function trackSurface(mediaPath, normalizedCorners, startSeconds, endSeconds, searchRadius) {
    if (!addon || typeof addon.trackSurface !== "function") {
      throw new Error(loadError || "L’addon natif ne fournit pas trackSurface().");
    }
    const corners = Array.isArray(normalizedCorners) ? normalizedCorners.map((corner) => ({
      x: Number(corner && corner.x),
      y: Number(corner && corner.y)
    })) : [];
    return addon.trackSurface(
      String(mediaPath || ""),
      corners,
      Number(startSeconds),
      Number(endSeconds),
      Number(searchRadius) || 10
    );
  }

  // Start a native worker and return immediately so UXP can keep the video preview responsive.
  async function startTracking(mediaPath, normalizedPoint, startSeconds, endSeconds, searchRadius) {
    if (!addon || typeof addon.startTracking !== "function") {
      throw new Error(loadError || "L’addon natif ne fournit pas startTracking().");
    }
    const point = normalizedPoint || {};
    return String(addon.startTracking(
      String(mediaPath || ""),
      Number(point.x),
      Number(point.y),
      Number(startSeconds),
      Number(endSeconds),
      Number(searchRadius) || 10
    ));
  }

  // Fetch only new primitive samples from the worker to avoid copying a whole long trajectory on every refresh.
  async function pollTracking(taskId, afterIndex) {
    if (!addon || typeof addon.pollTracking !== "function") {
      throw new Error(loadError || "L’addon natif ne fournit pas pollTracking().");
    }
    return addon.pollTracking(String(taskId || ""), Number(afterIndex) || 0);
  }

  // Request cancellation between decoded frames when the panel is closed or the user starts a new source.
  async function cancelTracking(taskId) {
    if (!addon || typeof addon.cancelTracking !== "function") {
      throw new Error(loadError || "L’addon natif ne fournit pas cancelTracking().");
    }
    return Boolean(addon.cancelTracking(String(taskId || "")));
  }

  root.PMT_NATIVE = {
    initialize,
    probe,
    inspectMedia,
    trackMedia,
    trackSurface,
    startTracking,
    pollTracking,
    cancelTracking
  };
}(window));
