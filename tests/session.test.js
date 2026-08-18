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
    { confidence: 0.65 },
    { confidence: 1, valid: false }
  ], 0.65);
  assert.equal(uncertain.length, 2);
  assert.equal(uncertain[0].confidence, 0.4);
  assert.equal(uncertain[1].valid, false);
});

test("smoothTrackingSamples reduces one-frame jitter without moving either endpoint", () => {
  const smoothed = trajectoryApi.smoothTrackingSamples([
    { frame: 0, x: 0.2, y: 0.2, valid: true },
    { frame: 1, x: 0.8, y: 0.8, valid: true },
    { frame: 2, x: 0.3, y: 0.3, valid: true }
  ]);
  assert.equal(smoothed[0].x, 0.2);
  assert.equal(smoothed[2].x, 0.3);
  assert.ok(Math.abs(smoothed[1].x - 0.525) < 0.000001);
  assert.ok(Math.abs(smoothed[1].y - 0.525) < 0.000001);
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

test("buildPositionKeyframes keeps the destination anchored to the first actual tracking sample by default", () => {
  const keyframes = trajectoryApi.buildPositionKeyframes([
    { frame: 200, seconds: 8, x: 0.59, y: 0.148, confidence: 1, valid: true },
    { frame: 201, seconds: 8.04, x: 0.62, y: 0.2, confidence: 0.9, valid: true }
  ]);
  assert.equal(keyframes[0].dx, 0);
  assert.equal(keyframes[0].dy, 0);
  assert.ok(Math.abs(keyframes[1].dx - 0.03) < 0.000001);
  assert.ok(Math.abs(keyframes[1].dy - 0.052) < 0.000001);
});

test("buildSurfaceKeyframes retains four ordered corners and skips invalid surface frames", () => {
  const keyframes = trajectoryApi.buildSurfaceKeyframes([
    { frame: 10, seconds: 1, confidence: 1, valid: true, corners: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.2 }, { x: 0.4, y: 0.5 }, { x: 0.1, y: 0.5 }] },
    { frame: 11, seconds: 1.04, confidence: 0.2, valid: false, corners: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }] },
    { frame: 12, seconds: 1.08, confidence: 0.8, valid: true, corners: [{ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.3 }, { x: 0.5, y: 0.6 }, { x: 0.2, y: 0.6 }] }
  ]);
  assert.equal(keyframes.length, 2);
  assert.equal(keyframes[0].progress, 0);
  assert.equal(keyframes[1].progress, 1);
  assert.deepEqual(keyframes[1].corners[2], { x: 0.5, y: 0.6 });
});

test("buildSurfaceMotionKeyframes preserves the target shape while deriving planar motion", () => {
  const keyframes = trajectoryApi.buildSurfaceMotionKeyframes([
    { frame: 10, seconds: 1, confidence: 1, valid: true, corners: [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.3 }, { x: 0.4, y: 0.5 }, { x: 0.2, y: 0.5 }] },
    // The second surface has moved 100 px right, rotated 90 degrees and doubled in size.
    { frame: 11, seconds: 1.04, confidence: 1, valid: true, corners: [{ x: 0.4, y: 0.2 }, { x: 0.4, y: 0.6 }, { x: 0.0, y: 0.6 }, { x: 0.0, y: 0.2 }] }
  ], { width: 1000, height: 1000 });
  assert.deepEqual({ dx: keyframes[0].dx, dy: keyframes[0].dy, scale: keyframes[0].scale, rotation: keyframes[0].rotation }, { dx: 0, dy: 0, scale: 1, rotation: 0 });
  assert.ok(Math.abs(keyframes[1].dx - -0.1) < 0.000001);
  assert.ok(Math.abs(keyframes[1].dy) < 0.000001);
  assert.ok(Math.abs(keyframes[1].scale - 2) < 0.000001);
  assert.ok(Math.abs(keyframes[1].rotation - 90) < 0.000001);
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

test("computeCornerPinPoint reverses target Motion before writing local Corner Pin coordinates", () => {
  const point = trajectoryApi.computeCornerPinPoint(
    { width: 1920, height: 1080 },
    { width: 372, height: 201 },
    { position: { x: 890.9, y: 942.8 }, anchor: { x: 186, y: 100.5 }, scale: { x: 100, y: 100 } },
    { x: 0.416, y: 0.778 }
  );
  // The resulting 94 px, -2 px local point maps back to the tracked 799 px, 840 px sequence corner.
  assert.ok(Math.abs(point.x - (93.82 / 372)) < 0.000001);
  assert.ok(Math.abs(point.y - (-2.06 / 201)) < 0.000001);
});

test("computeCornerPinPoint accounts for a resized target clip", () => {
  const point = trajectoryApi.computeCornerPinPoint(
    { width: 1920, height: 1080 },
    { width: 200, height: 100 },
    { position: { x: 960, y: 540 }, anchor: { x: 100, y: 50 }, scale: { x: 50, y: 200 } },
    { x: 0.75, y: 0.25 }
  );
  assert.deepEqual(point, { x: 5.3, y: -0.85 });
});

test("selectPreviewSamples bounds a long cached review while preserving both ends", () => {
  const samples = Array.from({ length: 10 }, (_, index) => ({ frame: index }));
  const preview = trajectoryApi.selectPreviewSamples(samples, 4);
  assert.equal(preview.length, 4);
  assert.equal(preview[0].frame, 0);
  assert.equal(preview[preview.length - 1].frame, 9);
});

test("replaceTrackingTail retains the approved prefix and replaces the corrected frame onward", () => {
  const merged = trajectoryApi.replaceTrackingTail([
    { frame: 100, seconds: 4, x: 0.2, y: 0.2 },
    { frame: 101, seconds: 4.04, x: 0.3, y: 0.3 },
    { frame: 102, seconds: 4.08, x: 0.4, y: 0.4 }
  ], [
    { frame: 101, seconds: 4.04, x: 0.31, y: 0.29 },
    { frame: 102, seconds: 4.08, x: 0.35, y: 0.25 }
  ]);
  assert.deepEqual(merged.map((sample) => sample.frame), [100, 101, 102]);
  assert.equal(merged[1].x, 0.31);
  assert.throws(() => trajectoryApi.replaceTrackingTail([], []), /aucune image exploitable/);
});
