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
    getPositionScale = () => ({x: 1, y: 1});
    createTimeAtTrackedOffset = (app, start, offset) => offset;
    createPoint = (app, x, y) => ({x, y});
    root.testBridge = { applySurfaceMotionTrackingToItem, findSurfaceMotionParams };
  `;
  const window = {};
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
