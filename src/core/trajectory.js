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

  // Move the source in the opposite direction so the tracked point remains at the sequence centre.
  function buildReversePositionKeyframes(samples) {
    return buildPositionKeyframes(samples, { x: 0.5, y: 0.5 }).map((sample) => Object.assign({}, sample, {
      dx: -Number(sample.dx),
      dy: -Number(sample.dy)
    }));
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
      const progress = Math.max(previousProgress, Math.min(1, Math.max(0, timedProgress)));
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

  // Keep the approved tail and replace only the samples leading up to a manually corrected reference frame.
  function replaceTrackingHead(samples, replacement) {
    const original = Array.isArray(samples) ? samples : [];
    const corrected = (Array.isArray(replacement) ? replacement : []).filter((sample) => sample && Number.isFinite(Number(sample.seconds)));
    if (!corrected.length) throw new Error("La reprise inverse du tracking n’a renvoyé aucune image exploitable.");
    const restartSeconds = Number(corrected[corrected.length - 1].seconds);
    return corrected.concat(original.filter((sample) => Number(sample && sample.seconds) > restartSeconds + 0.000001));
  }

  // Copy four corrected corners so a review edit never mutates the samples already approved by the user.
  function cloneSurfaceCorners(corners) {
    if (!Array.isArray(corners) || corners.length !== 4) {
      throw new Error("La correction de surface doit contenir quatre coins.");
    }
    return corners.map((corner) => {
      const x = Number(corner && corner.x);
      const y = Number(corner && corner.y);
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        throw new Error("Un coin de correction de surface est invalide.");
      }
      return { x, y };
    });
  }

  return {
    computeRelativeOffsets,
    findUncertainSamples,
    smoothTrackingSamples,
    buildPositionKeyframes,
    buildReversePositionKeyframes,
    buildSurfaceKeyframes,
    buildSurfaceMotionKeyframes,
    computeTargetPositionScale,
    computeCornerPinPoint,
    replaceTrackingTail,
    replaceTrackingHead,
    cloneSurfaceCorners
  };
}));
