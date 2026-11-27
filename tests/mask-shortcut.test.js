"use strict";

// Exercise the shortcut through the real panel logic without a Premiere host.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("mask shortcut captures and analyses without preparing source media", async () => {
  const calls = [];
  const source = { name: "Hand", sequenceId: "seq", start: { seconds: 0 }, end: { seconds: 2 } };
  const range = { sequenceId: "seq", inPoint: { seconds: 0 }, outPoint: { seconds: 2 }, timebase: "8467200000" };
  const samples = [{ frame: 0, seconds: 0, x: 0.4, y: 0.5, confidence: 1 }, { frame: 1, seconds: 1 / 30, x: 0.41, y: 0.5, confidence: 1 }];
  const status = { available: true, version: "test", selfTest: "ok", exportNames: [] };
  const window = {
    PMT_VERSION: "test",
    PMT_NATIVE: {
      probe: () => status,
      initialize: async () => status,
      inspectMedia: async () => { throw new Error("Source inspection should not run"); },
      startMaskTracking: async (...args) => { calls.push(["start", ...args]); return "task"; },
      pollTracking: async () => ({ samples, nextIndex: 2, done: true })
    },
    PMT_PREMIERE: {
      captureSelectedClip: async () => { calls.push(["capture"]); return source; },
      getActiveRange: async () => range,
      exportMaskFrames: async (...args) => { calls.push(["export", ...args.slice(0, 3)]); return { folder: "/tmp/mask", count: 60, startSeconds: 0, frameSeconds: 1 / 30 }; }
    },
    PMT_TRAJECTORY: { findUncertainSamples: () => [] }
  };
  const node = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [] };
  const file = path.join(__dirname, "..", "src", "ui.js");
  const script = fs.readFileSync(file, "utf8").replace("root.PMT_UI = { mount };", "root.PMT_UI = { mount, trackSelectedMask, captureAndPrepare, state }; ");
  vm.runInNewContext(script, { window, setTimeout, clearTimeout, console });
  await window.PMT_UI.trackSelectedMask(node);
  assert.deepEqual(calls.map(call => call[0]), ["capture", "export", "start"]);
  assert.equal(window.PMT_UI.state.trackingMode, "mask");
  assert.equal(window.PMT_UI.state.tracking.length, 2);
  assert.equal(window.PMT_UI.state.media, null);
  assert.equal(window.PMT_UI.state.busy, false);
  assert.match(node.innerHTML, /pmt-mask-quick-start/);
  assert.match(node.innerHTML, /pmt-source-actions/);
  assert.doesNotMatch(node.innerHTML, /pmt-mode-point|pmt-mode-two-point|pmt-mode-surface|pmt-search-radius|pmt-confidence-threshold/);
  assert.match(node.innerHTML, /style="display:none"/);
  // If switching workflows fails to capture a source, do not leave mask data active as point tracking.
  window.PMT_PREMIERE.captureSelectedClip = async () => { throw new Error("No source selected"); };
  await window.PMT_UI.captureAndPrepare(node);
  assert.equal(window.PMT_UI.state.trackingMode, "point");
  assert.equal(window.PMT_UI.state.tracking, null);
  assert.equal(window.PMT_UI.state.source, null);
});
