(function (root, factory) {
  "use strict";

  // Share trajectory math between the Premiere panel and deterministic unit tests.
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PMT_TRAJECTORY = api;
  }
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  // Convert tracked coordinates to motion offsets relative to the reference sample.
  function computeRelativeOffsets(samples, referenceIndex) {
    if (!Array.isArray(samples) || samples.length === 0) {
      return [];
    }
    const safeIndex = Math.min(samples.length - 1, Math.max(0, Number(referenceIndex) || 0));
    const reference = samples[safeIndex].point;
    return samples.map((sample) => ({
      ticks: String(sample.ticks),
      dx: Number(sample.point.x) - Number(reference.x),
      dy: Number(sample.point.y) - Number(reference.y),
      confidence: Number(sample.confidence)
    }));
  }

  // Identify frames whose confidence is below the user-selected validation threshold.
  function findUncertainSamples(samples, threshold) {
    const minimum = Number.isFinite(Number(threshold)) ? Number(threshold) : 0.65;
    return (Array.isArray(samples) ? samples : []).filter((sample) => Number(sample.confidence) < minimum);
  }

  return {
    computeRelativeOffsets,
    findUncertainSamples
  };
}));

