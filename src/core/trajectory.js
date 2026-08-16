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

  // Convert valid native frame samples into relative Position offsets and clip-relative timing.
  function buildPositionKeyframes(samples, referencePoint) {
    const referenceX = Number(referencePoint && referencePoint.x);
    const referenceY = Number(referencePoint && referencePoint.y);
    if (!Number.isFinite(referenceX) || !Number.isFinite(referenceY)) {
      throw new Error("Le point de référence du tracking est invalide.");
    }
    const validSamples = (Array.isArray(samples) ? samples : []).filter((sample) => {
      return sample && sample.valid !== false
        && Number.isFinite(Number(sample.seconds))
        && Number.isFinite(Number(sample.x))
        && Number.isFinite(Number(sample.y));
    });
    if (validSamples.length < 2) {
      throw new Error("Le tracking doit contenir au moins deux images valides.");
    }
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

  // Interpolate the verified point at a media timestamp so the video overlay follows native playback.
  function interpolateTrackingPoint(samples, seconds) {
    const requestedSeconds = Number(seconds);
    if (!Number.isFinite(requestedSeconds)) {
      return null;
    }
    const validSamples = (Array.isArray(samples) ? samples : []).filter((sample) => {
      return sample && sample.valid !== false
        && Number.isFinite(Number(sample.seconds))
        && Number.isFinite(Number(sample.x))
        && Number.isFinite(Number(sample.y));
    });
    if (!validSamples.length) {
      return null;
    }
    let previous = validSamples[0];
    let next = validSamples[validSamples.length - 1];
    for (let index = 0; index < validSamples.length; index += 1) {
      const sample = validSamples[index];
      if (Number(sample.seconds) <= requestedSeconds) {
        previous = sample;
      }
      if (Number(sample.seconds) >= requestedSeconds) {
        next = sample;
        break;
      }
    }
    const previousSeconds = Number(previous.seconds);
    const nextSeconds = Number(next.seconds);
    const ratio = nextSeconds > previousSeconds
      ? Math.min(1, Math.max(0, (requestedSeconds - previousSeconds) / (nextSeconds - previousSeconds)))
      : 0;
    return {
      x: Number(previous.x) + (Number(next.x) - Number(previous.x)) * ratio,
      y: Number(previous.y) + (Number(next.y) - Number(previous.y)) * ratio,
      seconds: requestedSeconds
    };
  }

  return {
    computeRelativeOffsets,
    findUncertainSamples,
    buildPositionKeyframes,
    computeTargetPositionScale,
    interpolateTrackingPoint
  };
}));
