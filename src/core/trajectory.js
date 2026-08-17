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
    return (Array.isArray(samples) ? samples : []).filter((sample) => sample && (sample.valid === false || Number(sample.confidence) < minimum));
  }

  // Apply one small centred filter while preserving endpoints and every sample's timing and confidence.
  function smoothTrackingSamples(samples) {
    const source = Array.isArray(samples) ? samples : [];
    return source.map((sample, index) => {
      const previous = source[index - 1];
      const next = source[index + 1];
      const canSmooth = index > 0 && index < source.length - 1
        && sample && sample.valid !== false
        && previous && previous.valid !== false
        && next && next.valid !== false
        && Number.isFinite(Number(previous.x)) && Number.isFinite(Number(previous.y))
        && Number.isFinite(Number(sample.x)) && Number.isFinite(Number(sample.y))
        && Number.isFinite(Number(next.x)) && Number.isFinite(Number(next.y));
      if (!canSmooth) {
        return Object.assign({}, sample);
      }
      // Weight the current measurement twice as much to reduce jitter without hiding a genuine change of direction.
      return Object.assign({}, sample, {
        x: (Number(previous.x) + Number(sample.x) * 2 + Number(next.x)) / 4,
        y: (Number(previous.y) + Number(sample.y) * 2 + Number(next.y)) / 4
      });
    });
  }

  // Convert valid native frame samples into relative Position offsets and clip-relative timing.
  function buildPositionKeyframes(samples, referencePoint) {
    const validSamples = (Array.isArray(samples) ? samples : []).filter((sample) => {
      return sample && sample.valid !== false
        && Number.isFinite(Number(sample.seconds))
        && Number.isFinite(Number(sample.x))
        && Number.isFinite(Number(sample.y));
    });
    if (validSamples.length < 2) {
      throw new Error("Le tracking doit contenir au moins deux images valides.");
    }
    const requestedReferenceX = Number(referencePoint && referencePoint.x);
    const requestedReferenceY = Number(referencePoint && referencePoint.y);
    // Default to the real first tracked sample so the destination stays at its original position on image one.
    const referenceX = Number.isFinite(requestedReferenceX) ? requestedReferenceX : Number(validSamples[0].x);
    const referenceY = Number.isFinite(requestedReferenceY) ? requestedReferenceY : Number(validSamples[0].y);
    const firstSeconds = Number(validSamples[0].seconds);
    const lastSeconds = Number(validSamples[validSamples.length - 1].seconds);
    const duration = lastSeconds - firstSeconds;
    let previousProgress = 0;
    return validSamples.map((sample, index) => {
      const indexedProgress = index / (validSamples.length - 1);
      const timedProgress = duration > 0 ? (Number(sample.seconds) - firstSeconds) / duration : indexedProgress;
      // Keep time monotonically increasing when a decoder reports duplicate frame timestamps.
      const progress = Math.max(previousProgress, Math.min(1, Math.max(0, timedProgress)));
      previousProgress = progress;
      return {
        frame: Number(sample.frame),
        seconds: Number(sample.seconds),
        progress,
        dx: Number(sample.x) - referenceX,
        dy: Number(sample.y) - referenceY,
        confidence: Number(sample.confidence)
      };
    });
  }

  // Convert sequence-normalized motion into a target clip's normalized Transform coordinate space.
  function computeTargetPositionScale(sequenceFrame, targetFrame, motionScale) {
    const sequenceWidth = Number(sequenceFrame && sequenceFrame.width);
    const sequenceHeight = Number(sequenceFrame && sequenceFrame.height);
    const targetWidth = Number(targetFrame && targetFrame.width);
    const targetHeight = Number(targetFrame && targetFrame.height);
    const scaleX = Number(motionScale && motionScale.x);
    const scaleY = Number(motionScale && motionScale.y);
    if (!Number.isFinite(sequenceWidth) || sequenceWidth <= 0 || !Number.isFinite(sequenceHeight) || sequenceHeight <= 0) {
      throw new Error("La taille de la séquence est invalide.");
    }
    if (!Number.isFinite(targetWidth) || targetWidth <= 0 || !Number.isFinite(targetHeight) || targetHeight <= 0) {
      throw new Error("La taille du média cible est invalide.");
    }
    if (!Number.isFinite(scaleX) || scaleX <= 0 || !Number.isFinite(scaleY) || scaleY <= 0) {
      throw new Error("L’échelle Motion du clip cible est invalide.");
    }
    // Divide by the rendered target size so a 192 px image covers the same sequence distance as a full frame.
    return {
      x: sequenceWidth / (targetWidth * scaleX / 100),
      y: sequenceHeight / (targetHeight * scaleY / 100)
    };
  }

  // Keep the review bounded on unusually long ranges while retaining its first and last tracked frames.
  function selectPreviewSamples(samples, maximumFrames) {
    const source = Array.isArray(samples) ? samples.slice() : [];
    const limit = Math.max(2, Math.floor(Number(maximumFrames) || 180));
    if (source.length <= limit) {
      return source;
    }
    const selected = [];
    for (let index = 0; index < limit; index += 1) {
      const sourceIndex = Math.round(index * (source.length - 1) / (limit - 1));
      selected.push(source[sourceIndex]);
    }
    return selected;
  }

  // Keep the approved prefix and replace every later sample after a manual correction.
  function replaceTrackingTail(samples, replacement) {
    const original = Array.isArray(samples) ? samples : [];
    const corrected = (Array.isArray(replacement) ? replacement : []).filter((sample) => {
      return sample && Number.isFinite(Number(sample.seconds));
    });
    if (!corrected.length) {
      throw new Error("La reprise du tracking n’a renvoyé aucune image exploitable.");
    }
    const restartSeconds = Number(corrected[0].seconds);
    // The native tracker returns its correction frame first, so it must replace—not duplicate—the prior sample.
    const prefix = original.filter((sample) => Number(sample && sample.seconds) < restartSeconds - 0.000001);
    return prefix.concat(corrected);
  }

  return {
    computeRelativeOffsets,
    findUncertainSamples,
    smoothTrackingSamples,
    buildPositionKeyframes,
    computeTargetPositionScale,
    selectPreviewSamples,
    replaceTrackingTail
  };
}));
