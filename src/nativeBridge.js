(function (root) {
  "use strict";

  let addon = null;
  let loadError = "";
  let selfTest = "not run";
  let loadPromise = null;
  let exportNames = [];

  // Collect both enumerable keys and known functions because UXP proxies may hide native properties.
  function collectExportNames(candidate) {
    const names = [];
    if (!candidate) {
      return names;
    }
    ["getVersion", "runSelfTest", "inspectMedia", "renderPreviewFrame", "trackMedia", "trackSurface", "startPreviewCache", "startTracking", "startTrackingReverse", "startSurfaceTracking", "startSurfaceTrackingReverse", "pollTracking", "cancelTracking"].forEach((name) => {
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
    return names.length ? "received exports: " + names.join(", ") : "object without detectable exports";
  }

  // Await Hybrid require because Premiere resolves native modules asynchronously.
  function initialize() {
    if (!loadPromise) {
      loadPromise = (async () => {
        try {
      const loadedAddon = await require("premiere-motion-tracker-0.5.19.uxpaddon");
          exportNames = collectExportNames(loadedAddon);
          if (!loadedAddon || typeof loadedAddon.getVersion !== "function") {
            throw new Error("The addon does not provide getVersion() (" + describeExports(loadedAddon) + ").");
          }
          if (typeof loadedAddon.runSelfTest !== "function") {
            throw new Error("The addon does not provide runSelfTest() (" + describeExports(loadedAddon) + ").");
          }
          selfTest = String(loadedAddon.runSelfTest());
          if (selfTest !== "ok") {
            throw new Error("Unexpected native self-test result: " + selfTest);
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
      throw new Error(loadError || "The native addon does not provide inspectMedia().");
    }
    return addon.inspectMedia(String(mediaPath || ""));
  }

  // Ask OpenCV to decode a compact PNG from the original file, bypassing Premiere and HTML video painting.
  async function renderPreviewFrame(mediaPath, seconds, outputPath, maximumWidth) {
    if (!addon || typeof addon.renderPreviewFrame !== "function") {
      throw new Error(loadError || "The native addon does not provide renderPreviewFrame().");
    }
    return addon.renderPreviewFrame(String(mediaPath || ""), Number(seconds), String(outputPath || ""), Number(maximumWidth) || 960);
  }

  // Delegate bounded Lucas-Kanade tracking to the addon without retaining native frame objects in UXP.
  async function trackMedia(mediaPath, normalizedPoint, startSeconds, endSeconds, searchRadius) {
    if (!addon || typeof addon.trackMedia !== "function") {
      throw new Error(loadError || "The native addon does not provide trackMedia().");
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
  async function trackSurface(mediaPath, normalizedCorners, startSeconds, endSeconds, searchRadius, featureCount) {
    if (!addon || typeof addon.trackSurface !== "function") {
      throw new Error(loadError || "The native addon does not provide trackSurface().");
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
      Number(searchRadius) || 10,
      Number(featureCount) || 240
    );
  }

  // Start a native worker and return immediately so UXP can keep the video preview responsive.
  async function startTracking(mediaPath, normalizedPoint, startSeconds, endSeconds, searchRadius, previewFolder) {
    if (!addon || typeof addon.startTracking !== "function") {
      throw new Error(loadError || "The native addon does not provide startTracking().");
    }
    const point = normalizedPoint || {};
    return String(addon.startTracking(
      String(mediaPath || ""),
      Number(point.x),
      Number(point.y),
      Number(startSeconds),
      Number(endSeconds),
      Number(searchRadius) || 10,
      String(previewFolder || "")
    ));
  }

  // Populate every selection frame once so the pre-analysis slider never triggers a fresh source seek.
  async function startPreviewCache(mediaPath, startSeconds, endSeconds, previewFolder) {
    if (!addon || typeof addon.startPreviewCache !== "function") {
      throw new Error(loadError || "The native addon does not provide startPreviewCache().");
    }
    return String(addon.startPreviewCache(String(mediaPath || ""), Number(startSeconds), Number(endSeconds), String(previewFolder || "")));
  }

  // Follow a point back from the selected reference frame through the native sequential preview cache.
  async function startTrackingReverse(mediaPath, normalizedPoint, startSeconds, endSeconds, searchRadius, previewFolder) {
    if (!addon || typeof addon.startTrackingReverse !== "function") {
      throw new Error(loadError || "The native addon does not provide startTrackingReverse().");
    }
    const point = normalizedPoint || {};
    return String(addon.startTrackingReverse(String(mediaPath || ""), Number(point.x), Number(point.y), Number(startSeconds), Number(endSeconds), Number(searchRadius) || 10, String(previewFolder || "")));
  }

  // Start planar tracking asynchronously so Surface mode can publish progress and honour cancellation.
  async function startSurfaceTracking(mediaPath, normalizedCorners, startSeconds, endSeconds, searchRadius, featureCount, previewFolder) {
    if (!addon || typeof addon.startSurfaceTracking !== "function") {
      throw new Error(loadError || "The native addon does not provide startSurfaceTracking().");
    }
    const corners = Array.isArray(normalizedCorners) ? normalizedCorners.map((corner) => ({
      x: Number(corner && corner.x),
      y: Number(corner && corner.y)
    })) : [];
    return String(addon.startSurfaceTracking(
      String(mediaPath || ""),
      corners,
      Number(startSeconds),
      Number(endSeconds),
      Number(searchRadius) || 10,
      Number(featureCount) || 240,
      String(previewFolder || "")
    ));
  }

  // Follow a four-corner reference backwards through the prepared cache before tracking the remaining forward range.
  async function startSurfaceTrackingReverse(mediaPath, normalizedCorners, startSeconds, endSeconds, searchRadius, featureCount, previewFolder) {
    if (!addon || typeof addon.startSurfaceTrackingReverse !== "function") {
      throw new Error(loadError || "The native addon does not provide startSurfaceTrackingReverse().");
    }
    const corners = Array.isArray(normalizedCorners) ? normalizedCorners.map((corner) => ({ x: Number(corner && corner.x), y: Number(corner && corner.y) })) : [];
    return String(addon.startSurfaceTrackingReverse(String(mediaPath || ""), corners, Number(startSeconds), Number(endSeconds), Number(searchRadius) || 10, Number(featureCount) || 240, String(previewFolder || "")));
  }

  // Fetch only new primitive samples from the worker to avoid copying a whole long trajectory on every refresh.
  async function pollTracking(taskId, afterIndex) {
    if (!addon || typeof addon.pollTracking !== "function") {
      throw new Error(loadError || "The native addon does not provide pollTracking().");
    }
    return addon.pollTracking(String(taskId || ""), Number(afterIndex) || 0);
  }

  // Request cancellation between decoded frames when the panel is closed or the user starts a new source.
  async function cancelTracking(taskId) {
    if (!addon || typeof addon.cancelTracking !== "function") {
      throw new Error(loadError || "The native addon does not provide cancelTracking().");
    }
    return Boolean(addon.cancelTracking(String(taskId || "")));
  }

  root.PMT_NATIVE = {
    initialize,
    probe,
    inspectMedia,
    renderPreviewFrame,
    trackMedia,
    trackSurface,
    startPreviewCache,
    startTracking,
    startTrackingReverse,
    startSurfaceTracking,
    startSurfaceTrackingReverse,
    pollTracking,
    cancelTracking
  };
}(window));
