"use strict";

// Exercise the Transform application with the parameter names returned by Premiere.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadBridge() {
  const source = fs.readFileSync(path.join(__dirname, "../src/premiereBridge.js"), "utf8");
  const injection = `
    createTransformComponent = async () => ({component: {}, matchName: "Transform"});
    resolveInsertedTransform = async (chain) => chain.component;
    waitForHostPaint = async () => {};
    getKeyframesForTarget = (start, end, keys) => keys.map((key) => Object.assign({clipOffsetSeconds: key.seconds}, key));
    readMotionParamValue = async (param) => param.value;
    getPositionScale = (context, normalized, frame, scale) => normalized && frame && scale
      ? ({x: context.frameSize.width / (frame.width * scale.x / 100), y: context.frameSize.height / (frame.height * scale.y / 100)})
      : normalized || !context.frameSize ? ({x: 1, y: 1}) : ({x: context.frameSize.width, y: context.frameSize.height});
    getTargetMotionScale = async (item) => item.geometry.scale;
    createTimeAtTrackedOffset = (app, start, offset) => offset;
    createPoint = (app, x, y) => ({x, y});
    getTargetMediaFrame = async () => ({width: 200, height: 100});
    getTargetMotionGeometry = async (context, item) => item.geometry;
    root.testBridge = { applySurfaceMotionTrackingToItem, findSurfaceMotionParams, setSource: (item) => { handles.source = {item}; } };
  `;
  const window = { PMT_TRAJECTORY: require("../src/core/trajectory.js") };
  vm.runInNewContext(source.replace("  root.PMT_PREMIERE = {", injection + "\n  root.PMT_PREMIERE = {"), { window, setTimeout });
  return window.testBridge;
}

// The host exposes an unnamed control between Position and Scale Height.
function parameter(name, value, log) {
  return {
    displayName: name, value,
    createSetTimeVaryingAction: () => ({name, type: "enable"}),
    createKeyframe: (value) => ({value}),
    createAddKeyframeAction: (key) => ({name, type: "key", value: key.value})
  };
}

async function apply(options) {
  const log = [];
  const params = [parameter("Anchor Point", 0, log), parameter("Position", {x: 10, y: 20}, log),
    parameter("", true, log), parameter("Scale Height", 100, log), parameter("Scale Width", 100, log),
    parameter("Rotation", 0, log)];
  const component = { getParamCount: () => params.length, getParam: (index) => params[index] };
  const chain = { component, getComponentCount: () => 0, createInsertComponentAction: () => ({type: "insert"}) };
  const item = { getComponentChain: async () => chain, getInPoint: async () => ({}), getOutPoint: async () => ({}), getName: async () => "Target" };
  const project = { executeTransaction: (callback) => callback({addAction: (action) => log.push(action)}) };
  await loadBridge().applySurfaceMotionTrackingToItem({project, app: {}}, item, [
    {seconds: 0, dx: 0, dy: 0, scale: 1, rotation: 0},
    {seconds: 1, dx: 2, dy: 3, scale: 1.5, rotation: 30}
  ], options);
  return log;
}

test("Transform keys Scale Height and Rotation using Premiere's parameter labels", async () => {
  const log = await apply({scale: true, rotation: true});
  assert.deepEqual(log.filter((action) => action.name === "Scale Height" && action.type === "key").map((action) => action.value), [100, 150]);
  assert.deepEqual(log.filter((action) => action.name === "Rotation" && action.type === "key").map((action) => action.value), [0, 30]);
  assert.equal(log.some((action) => action.name === "Scale Width"), false);
});

test("disabled scale and rotation do not create their keyframes", async () => {
  const log = await apply({scale: false, rotation: false});
  assert.equal(log.some((action) => action.name === "Scale Height" || action.name === "Rotation"), false);
  assert.equal(log.filter((action) => action.name === "Position" && action.type === "key").length, 2);
});

// Verify that the bridge applies the pivot compensation to actual Position keyframe values.
test("Transform position follows the tracked pivot while rotating", async () => {
  const log = [];
  const params = [parameter("Position", {x: 100, y: 50}), parameter("Scale Height", 100), parameter("Rotation", 0)];
  const component = { getParamCount: () => params.length, getParam: (index) => params[index] };
  const chain = { component, getComponentCount: () => 0, createInsertComponentAction: () => ({type: "insert"}) };
  const geometry = {position: {x: 100, y: 50}, anchor: {x: 100, y: 50}, scale: {x: 100, y: 100}};
  const item = {geometry, getComponentChain: async () => chain, getInPoint: async () => ({}), getOutPoint: async () => ({}), getName: async () => "Target"};
  const bridge = loadBridge();
  bridge.setSource({geometry, getInPoint: async () => ({})});
  const project = {executeTransaction: (callback) => callback({addAction: (action) => log.push(action)})};
  await bridge.applySurfaceMotionTrackingToItem({project, app: {}, frameSize: {width: 200, height: 100}}, item, [
    {seconds: 0, dx: 0, dy: 0, scale: 1, rotation: 0, referencePoint: {x: 0.25, y: 0.5}},
    {seconds: 1, dx: 0, dy: 0, scale: 1, rotation: 90, referencePoint: {x: 0.25, y: 0.5}}
  ], {rotation: true, scale: false, sourceFrame: {width: 200, height: 100}});
  const keys = log.filter((action) => action.name === "Position" && action.type === "key");
  assert.ok(Math.abs(keys[1].value.x - 50) < 1e-10);
  assert.ok(Math.abs(keys[1].value.y - 100) < 1e-10);
});

// A target already rotated and scaled by Motion needs an inverse conversion into local Transform coordinates.
test("two-point translation compensates existing Motion rotation and scale", async () => {
  const log = [];
  const params = [parameter("Position", {x: 0.5, y: 0.5})];
  const component = {getParamCount: () => params.length, getParam: (index) => params[index]};
  const chain = {component, getComponentCount: () => 0, createInsertComponentAction: () => ({type: "insert"})};
  const sourceGeometry = {position: {x: 100, y: 50}, anchor: {x: 100, y: 50}, scale: {x: 100, y: 100}, rotation: 0};
  const targetGeometry = {position: {x: 100, y: 50}, anchor: {x: 100, y: 50}, scale: {x: 50, y: 50}, rotation: 90};
  const item = {geometry: targetGeometry, getComponentChain: async () => chain, getInPoint: async () => ({}), getOutPoint: async () => ({}), getName: async () => "Target"};
  const bridge = loadBridge();
  bridge.setSource({geometry: sourceGeometry, getInPoint: async () => ({})});
  const project = {executeTransaction: (callback) => callback({addAction: (action) => log.push(action)})};
  await bridge.applySurfaceMotionTrackingToItem({project, app: {}, frameSize: {width: 200, height: 100}}, item, [
    {seconds: 0, dx: 0, dy: 0, scale: 1, rotation: 0, referencePoint: {x: 0.5, y: 0.5}},
    {seconds: 1, dx: 0.25, dy: 0, scale: 1, rotation: 0, referencePoint: {x: 0.5, y: 0.5}}
  ], {rotation: false, scale: false, sourceFrame: {width: 200, height: 100}});
  const keys = log.filter((action) => action.name === "Position" && action.type === "key");
  assert.ok(Math.abs(keys[1].value.x - 0.5) < 1e-10);
  assert.ok(Math.abs(keys[1].value.y + 0.5) < 1e-10);
});

// Adjustment layers may expose a synthetic media path that OpenCV cannot inspect.
test("adjustment layers use sequence dimensions without inspecting their synthetic media", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/premiereBridge.js"), "utf8");
  const window = {PMT_NATIVE: {inspectMedia: async () => { throw new Error("Unexpected media inspection"); }}};
  const injected = source.replace("  root.PMT_PREMIERE = {", "  root.testFrame = getTargetMediaFrame;\n  root.PMT_PREMIERE = {");
  vm.runInNewContext(injected, {window, setTimeout});
  const item = {isAdjustmentLayer: async () => true, getProjectItem: async () => { throw new Error("Unexpected project item read"); }};
  const result = await window.testFrame({frameSize: {width: 4096, height: 2160}}, item);
  assert.equal(result.width, 4096);
  assert.equal(result.height, 2160);
  assert.equal(result.coordinateSpace, "sequence");
});

test("invalid ordinary media dimensions still produce an error", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/premiereBridge.js"), "utf8");
  const window = {PMT_NATIVE: {inspectMedia: async () => ({width: 0, height: 0})}};
  const injected = source.replace("  root.PMT_PREMIERE = {", "  root.testFrame = getTargetMediaFrame;\n  root.PMT_PREMIERE = {");
  vm.runInNewContext(injected, {window, setTimeout});
  const item = {isAdjustmentLayer: async () => false, getProjectItem: async () => ({getMediaFilePath: async () => "/video.mov"})};
  await assert.rejects(window.testFrame({frameSize: {width: 4096, height: 2160}}, item), /dimensions exploitables/);
});

// Verify the timestamps passed to Premiere for reverse tracking and ordinary destination tracking.
test("reverse tracking preserves the analysed range on a trimmed source clip", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/premiereBridge.js"), "utf8");
  const injection = `
    createTransformComponent = async () => ({component: {}, matchName: "Transform"});
    resolveInsertedTransform = async (chain) => chain.component;
    waitForHostPaint = async () => {};
    getPositionScale = () => ({x: 1, y: 1});
    createPoint = (app, x, y) => ({x, y});
    root.testApply = applyTrackingToItem;
  `;
  const window = {PMT_TRAJECTORY: require("../src/core/trajectory.js")};
  vm.runInNewContext(source.replace("  root.PMT_PREMIERE = {", injection + "\n  root.PMT_PREMIERE = {"), {window, setTimeout});
  const positions = [];
  const param = {displayName: "Position", getStartValue: async () => ({x: 100, y: 100}),
    createSetTimeVaryingAction: () => ({}), createKeyframe: (value) => ({value}),
    createAddKeyframeAction: (key) => { positions.push(key.position.seconds); return {}; }};
  const component = {getParamCount: () => 1, getParam: () => param};
  const chain = {component, getComponentCount: () => 0, createInsertComponentAction: () => ({})};
  const item = {getComponentChain: async () => chain, getInPoint: async () => ({seconds: 12.16}),
    getOutPoint: async () => ({seconds: 30.72}), getName: async () => "Source"};
  const context = {project: {executeTransaction: (callback) => callback({addAction: () => {}})},
    app: {TickTime: {createWithSeconds: (seconds) => ({seconds})}}};
  const keys = [{seconds: 18.88, dx: 0, dy: 0}, {seconds: 18.92, dx: 1, dy: 1}];
  await window.testApply(context, item, keys, true);
  assert.deepEqual(positions.map((time) => Number(time.toFixed(2))), [18.88, 18.92]);
  positions.length = 0;
  await window.testApply(context, item, keys);
  assert.deepEqual(positions.map((time) => Number(time.toFixed(2))), [12.16, 12.2]);
});
