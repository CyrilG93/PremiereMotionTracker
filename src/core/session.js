(function (root, factory) {
  "use strict";

  // Export the same session helpers to UXP and to Node's test runner.
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.PMT_SESSION = api;
  }
}(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SESSION_SCHEMA_VERSION = 2;

  // Normalize a user-selected point to sequence-relative coordinates between zero and one.
  function normalizePoint(point) {
    const x = Number(point && point.x);
    const y = Number(point && point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error("Le point de tracking doit contenir des coordonnées valides.");
    }
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y))
    };
  }

  // Create a serializable session without retaining fragile Premiere proxy objects.
  function createSession(input) {
    const source = input && input.source;
    if (!source || !source.id) {
      throw new Error("Un clip source est nécessaire.");
    }
    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      id: String(input.id || ("session-" + Date.now())),
      createdAt: String(input.createdAt || new Date().toISOString()),
      sequenceId: String(input.sequenceId || ""),
      source: Object.assign({}, source),
      range: Object.assign({ inTicks: "0", outTicks: "0" }, input.range || {}),
      referencePoint: normalizePoint(input.referencePoint || { x: 0.5, y: 0.5 }),
      profile: String(input.profile || "balanced"),
      samples: Array.isArray(input.samples) ? input.samples.slice() : [],
      corrections: Array.isArray(input.corrections) ? input.corrections.slice() : [],
      status: String(input.status || "ready")
    };
  }

  // Return a new session with one validated tracking sample appended.
  function appendSample(session, sample) {
    if (!session || !Array.isArray(session.samples)) {
      throw new Error("La session de tracking est invalide.");
    }
    const confidence = Number(sample && sample.confidence);
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
      throw new Error("Le score de confiance doit être compris entre 0 et 1.");
    }
    return Object.assign({}, session, {
      samples: session.samples.concat([{
        ticks: String(sample.ticks),
        point: normalizePoint(sample.point),
        confidence
      }])
    });
  }

  return {
    SESSION_SCHEMA_VERSION,
    normalizePoint,
    createSession,
    appendSample
  };
}));
