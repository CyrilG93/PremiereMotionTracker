"use strict";

// Validate the pure tracking model without requiring Premiere Pro.
const test = require("node:test");
const assert = require("node:assert/strict");
const sessionApi = require("../src/core/session.js");
const trajectoryApi = require("../src/core/trajectory.js");

test("normalizePoint clamps coordinates into the preview", () => {
  assert.deepEqual(sessionApi.normalizePoint({ x: -0.2, y: 1.3 }), { x: 0, y: 1 });
});

test("createSession retains durable clip metadata", () => {
  const session = sessionApi.createSession({
    id: "test-session",
    createdAt: "2026-08-16T00:00:00.000Z",
    sequenceId: "sequence-1",
    source: { id: "source-1", name: "Source" },
    referencePoint: { x: 0.25, y: 0.75 }
  });
  assert.equal(session.schemaVersion, 2);
  assert.equal(session.source.name, "Source");
  assert.equal(Object.prototype.hasOwnProperty.call(session, "target"), false);
  assert.deepEqual(session.referencePoint, { x: 0.25, y: 0.75 });
});

test("appendSample rejects an impossible confidence score", () => {
  const session = sessionApi.createSession({
    source: { id: "source-1" }
  });
  assert.throws(() => sessionApi.appendSample(session, {
    ticks: "1",
    point: { x: 0.5, y: 0.5 },
    confidence: 1.2
  }), /confiance/);
});

test("computeRelativeOffsets anchors motion to the reference frame", () => {
  const offsets = trajectoryApi.computeRelativeOffsets([
    { ticks: "0", point: { x: 0.4, y: 0.5 }, confidence: 1 },
    { ticks: "1", point: { x: 0.45, y: 0.42 }, confidence: 0.9 }
  ], 0);
  assert.deepEqual(offsets, [
    { ticks: "0", dx: 0, dy: 0, confidence: 1 },
    { ticks: "1", dx: 0.04999999999999999, dy: -0.08000000000000002, confidence: 0.9 }
  ]);
});

test("findUncertainSamples returns only samples below the threshold", () => {
  const uncertain = trajectoryApi.findUncertainSamples([
    { confidence: 0.9 },
    { confidence: 0.4 },
    { confidence: 0.65 }
  ], 0.65);
  assert.equal(uncertain.length, 1);
  assert.equal(uncertain[0].confidence, 0.4);
});

test("buildPositionKeyframes retains one Position keyframe for every valid frame", () => {
  const keyframes = trajectoryApi.buildPositionKeyframes([
    { frame: 100, seconds: 4, x: 0.25, y: 0.5, confidence: 1, valid: true },
    { frame: 101, seconds: 4.04, x: 0.3, y: 0.45, confidence: 0.9, valid: true },
    { frame: 102, seconds: 4.08, x: 0.4, y: 0.35, confidence: 0.2, valid: false },
    { frame: 103, seconds: 4.12, x: 0.35, y: 0.4, confidence: 0.8, valid: true }
  ], { x: 0.25, y: 0.5 });
  assert.equal(keyframes.length, 3);
  assert.deepEqual(keyframes.map((keyframe) => keyframe.frame), [100, 101, 103]);
  assert.equal(keyframes[0].progress, 0);
  assert.ok(Math.abs(keyframes[1].progress - (1 / 3)) < 0.000001);
  assert.equal(keyframes[2].progress, 1);
  assert.ok(Math.abs(keyframes[1].dx - 0.05) < 0.000001);
  assert.ok(Math.abs(keyframes[1].dy + 0.05) < 0.000001);
});

test("computeTargetPositionScale compensates a smaller target media and its Motion scale", () => {
  const scale = trajectoryApi.computeTargetPositionScale(
    { width: 1920, height: 1080 },
    { width: 192, height: 192 },
    { x: 100, y: 50 }
  );
  assert.deepEqual(scale, { x: 10, y: 11.25 });
});

test("computeTargetPositionScale preserves Graphics Layers using the sequence canvas", () => {
  const scale = trajectoryApi.computeTargetPositionScale(
    { width: 1920, height: 1080 },
    { width: 1920, height: 1080 },
    { x: 100, y: 100 }
  );
  assert.deepEqual(scale, { x: 1, y: 1 });
});
