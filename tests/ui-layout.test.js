"use strict";

// Guard the Premiere UXP layout patterns that have been validated in other workspace plugins.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const styles = fs.readFileSync(path.join(projectRoot, "styles.css"), "utf8");
const uiSource = fs.readFileSync(path.join(projectRoot, "src", "ui.js"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "manifest.json"), "utf8"));

test("interactive rows use flex instead of hidden UXP grid layouts", () => {
  assert.match(styles, /\.pmt-slot\s*\{[^}]*display:\s*flex;/s);
  assert.match(styles, /\.pmt-actions\s*\{[^}]*display:\s*flex;/s);
  assert.doesNotMatch(styles, /display:\s*grid;/);
});

test("panel cards use simple div containers in Premiere UXP", () => {
  assert.doesNotMatch(uiSource, /<\/?section/);
  assert.match(uiSource, /<div class="pmt-card">/);
});

test("diagnostics are selectable and can be copied through the declared clipboard permission", () => {
  assert.match(uiSource, /<textarea class="pmt-log"/);
  assert.match(uiSource, /id="pmt-copy-log"/);
  assert.match(uiSource, /clipboard\.setContent\(\{ "text\/plain": text \}\)/);
  assert.match(uiSource, /logArea\.select\(\)/);
  assert.equal(manifest.requiredPermissions.clipboard, "readAndWrite");
});

test("buttons disable the native UXP skin so their border uses one consistent radius", () => {
  assert.match(styles, /button\s*\{[^}]*appearance:\s*none;/s);
  assert.match(styles, /\.pmt-button\s*\{[^}]*border-radius:\s*7px;/s);
});

test("destination clips are selected only when applying the finished tracking", () => {
  assert.doesNotMatch(uiSource, /pmt-capture-target/);
  assert.match(uiSource, /Tester Transform sur la sélection/);
});
