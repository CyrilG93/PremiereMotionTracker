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

  // Interpolate native media-frame tracking onto the exact displayed frames of the destination sequence.
  function resampleTrackingSamples(samples, sourceStartSeconds, sourceEndSeconds, sequenceFrameRate, sourceSpeed) {
    const validSamples = (Array.isArray(samples) ? samples : []).filter((sample) => {
      const isPoint = Number.isFinite(Number(sample && sample.x)) && Number.isFinite(Number(sample && sample.y));
      const isSurface = Array.isArray(sample && sample.corners) && sample.corners.length === 4
        && sample.corners.every((corner) => Number.isFinite(Number(corner && corner.x)) && Number.isFinite(Number(corner && corner.y)));
      return sample && sample.valid !== false && Number.isFinite(Number(sample.seconds)) && (isPoint || isSurface);
    }).sort((left, right) => Number(left.seconds) - Number(right.seconds));
    const start = Number(sourceStartSeconds);
    const end = Number(sourceEndSeconds);
    const frameRate = Number(sequenceFrameRate);
    const speed = Number(sourceSpeed);
    if (validSamples.length < 2 || !Number.isFinite(start) || !Number.isFinite(end) || end <= start
      || !Number.isFinite(frameRate) || frameRate <= 0 || !Number.isFinite(speed) || speed <= 0) {
      return validSamples;
    }
    const sequenceDuration = (end - start) / speed;
    const frameCount = Math.max(2, Math.ceil(sequenceDuration * frameRate - 0.000001));
    let upperIndex = 1;
    return Array.from({ length: frameCount }, (_, index) => {
      const seconds = Math.min(end, start + index / frameRate * speed);
      while (upperIndex < validSamples.length - 1 && Number(validSamples[upperIndex].seconds) < seconds) {
        upperIndex += 1;
      }
      const upper = validSamples[upperIndex];
      const lower = validSamples[Math.max(0, upperIndex - 1)];
      const interval = Number(upper.seconds) - Number(lower.seconds);
      const ratio = interval > 0 ? Math.max(0, Math.min(1, (seconds - Number(lower.seconds)) / interval)) : 0;
      const interpolate = (left, right) => Number(left) + (Number(right) - Number(left)) * ratio;
      const result = {
        frame: Number(lower.frame),
        seconds,
        progress: index / frameCount,
        confidence: Math.min(Number(lower.confidence), Number(upper.confidence)),
        valid: true
      };
      if (Array.isArray(lower.corners)) {
        result.corners = lower.corners.map((corner, cornerIndex) => ({
          x: interpolate(corner.x, upper.corners[cornerIndex].x),
          y: interpolate(corner.y, upper.corners[cornerIndex].y)
        }));
      } else {
        result.x = interpolate(lower.x, upper.x);
        result.y = interpolate(lower.y, upper.y);
      }
      return result;
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
      const suppliedProgress = Number(sample.progress);
      const progress = Math.max(previousProgress, Math.min(1, Number.isFinite(suppliedProgress) ? suppliedProgress : Math.max(0, timedProgress)));
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

  // Preserve each valid four-corner measurement with clip-relative timing for Premiere's Corner Pin effect.
  function buildSurfaceKeyframes(samples) {
    const validSamples = (Array.isArray(samples) ? samples : []).filter((sample) => {
      return sample && sample.valid !== false
        && Number.isFinite(Number(sample.seconds))
        && Array.isArray(sample.corners) && sample.corners.length === 4
        && sample.corners.every((corner) => Number.isFinite(Number(corner && corner.x)) && Number.isFinite(Number(corner && corner.y)));
    });
    if (validSamples.length < 2) {
      throw new Error("Le surface tracking doit contenir au moins deux images valides.");
    }
    const firstSeconds = Number(validSamples[0].seconds);
    const lastSeconds = Number(validSamples[validSamples.length - 1].seconds);
    const duration = lastSeconds - firstSeconds;
    let previousProgress = 0;
    return validSamples.map((sample, index) => {
      const indexedProgress = index / (validSamples.length - 1);
      const timedProgress = duration > 0 ? (Number(sample.seconds) - firstSeconds) / duration : indexedProgress;
      const suppliedProgress = Number(sample.progress);
      const progress = Math.max(previousProgress, Math.min(1, Number.isFinite(suppliedProgress) ? suppliedProgress : Math.max(0, timedProgress)));
      previousProgress = progress;
      return {
        frame: Number(sample.frame),
        seconds: Number(sample.seconds),
        progress,
        confidence: Number(sample.confidence),
        // Copy primitives so later preview adjustments cannot mutate the trajectory being applied.
        corners: sample.corners.map((corner) => ({ x: Number(corner.x), y: Number(corner.y) }))
      };
    });
  }

  // Reduce each tracked quadrilateral to its best-fitting translation, rotation and uniform scale.
  // This intentionally discards perspective/skew so a target can follow a surface without being warped.
  function buildSurfaceMotionKeyframes(samples, sequenceFrame) {
    const keyframes = buildSurfaceKeyframes(samples);
    const width = Number(sequenceFrame && sequenceFrame.width);
    const height = Number(sequenceFrame && sequenceFrame.height);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error("La taille de la séquence est invalide.");
    }
    const toPixels = (corners) => corners.map((corner) => ({ x: Number(corner.x) * width, y: Number(corner.y) * height }));
    const centerOf = (corners) => corners.reduce((center, corner) => ({ x: center.x + corner.x / corners.length, y: center.y + corner.y / corners.length }), { x: 0, y: 0 });
    const referenceCorners = toPixels(keyframes[0].corners);
    const referenceCenter = centerOf(referenceCorners);
    const referenceOffsets = referenceCorners.map((corner) => ({ x: corner.x - referenceCenter.x, y: corner.y - referenceCenter.y }));
    const referenceEnergy = referenceOffsets.reduce((sum, corner) => sum + corner.x * corner.x + corner.y * corner.y, 0);
    if (referenceEnergy <= Number.EPSILON) {
      throw new Error("La surface de référence est trop petite pour calculer son mouvement.");
    }
    return keyframes.map((sample) => {
      const corners = toPixels(sample.corners);
      const center = centerOf(corners);
      let cosineNumerator = 0;
      let sineNumerator = 0;
      corners.forEach((corner, index) => {
        const reference = referenceOffsets[index];
        const currentX = corner.x - center.x;
        const currentY = corner.y - center.y;
        cosineNumerator += reference.x * currentX + reference.y * currentY;
        sineNumerator += reference.x * currentY - reference.y * currentX;
      });
      const cosine = cosineNumerator / referenceEnergy;
      const sine = sineNumerator / referenceEnergy;
      return Object.assign({}, sample, {
        dx: (center.x - referenceCenter.x) / width,
        dy: (center.y - referenceCenter.y) / height,
        scale: Math.sqrt(cosine * cosine + sine * sine),
        rotation: Math.atan2(sine, cosine) * 180 / Math.PI
      });
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

  // Convert a tracked sequence corner into Corner Pin's normalized local media coordinates.
  function computeCornerPinPoint(sequenceFrame, targetFrame, motion, corner) {
    const sequenceWidth = Number(sequenceFrame && sequenceFrame.width);
    const sequenceHeight = Number(sequenceFrame && sequenceFrame.height);
    const targetWidth = Number(targetFrame && targetFrame.width);
    const targetHeight = Number(targetFrame && targetFrame.height);
    const positionX = Number(motion && motion.position && motion.position.x);
    const positionY = Number(motion && motion.position && motion.position.y);
    const anchorX = Number(motion && motion.anchor && motion.anchor.x);
    const anchorY = Number(motion && motion.anchor && motion.anchor.y);
    const scaleX = Number(motion && motion.scale && motion.scale.x);
    const scaleY = Number(motion && motion.scale && motion.scale.y);
    const cornerX = Number(corner && corner.x);
    const cornerY = Number(corner && corner.y);
    if (!Number.isFinite(sequenceWidth) || sequenceWidth <= 0 || !Number.isFinite(sequenceHeight) || sequenceHeight <= 0) {
      throw new Error("La taille de la séquence est invalide.");
    }
    if (!Number.isFinite(targetWidth) || targetWidth <= 0 || !Number.isFinite(targetHeight) || targetHeight <= 0) {
      throw new Error("La taille du média cible est invalide.");
    }
    if (!Number.isFinite(positionX) || !Number.isFinite(positionY) || !Number.isFinite(anchorX) || !Number.isFinite(anchorY)) {
      throw new Error("La géométrie Motion du clip cible est invalide.");
    }
    if (!Number.isFinite(scaleX) || scaleX <= 0 || !Number.isFinite(scaleY) || scaleY <= 0) {
      throw new Error("L’échelle Motion du clip cible est invalide.");
    }
    if (!Number.isFinite(cornerX) || !Number.isFinite(cornerY)) {
      throw new Error("Un coin de surface est invalide.");
    }
    // Undo intrinsic Motion, then normalize by the target frame because Corner Pin PointF uses local normalized units.
    return {
      x: (((cornerX * sequenceWidth - positionX) / (scaleX / 100)) + anchorX) / targetWidth,
      y: (((cornerY * sequenceHeight - positionY) / (scaleY / 100)) + anchorY) / targetHeight
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
    resampleTrackingSamples,
    buildPositionKeyframes,
    buildSurfaceKeyframes,
    buildSurfaceMotionKeyframes,
    computeTargetPositionScale,
    computeCornerPinPoint,
    selectPreviewSamples,
    replaceTrackingTail
  };
}));
