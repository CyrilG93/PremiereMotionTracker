"use strict";

// Guard the Premiere UXP layout patterns that have been validated in other workspace plugins.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const styles = fs.readFileSync(path.join(projectRoot, "styles.css"), "utf8");
const uiSource = fs.readFileSync(path.join(projectRoot, "src", "ui.js"), "utf8");
const premiereSource = fs.readFileSync(path.join(projectRoot, "src", "premiereBridge.js"), "utf8");
const nativeSource = fs.readFileSync(path.join(projectRoot, "src", "nativeBridge.js"), "utf8");
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
  assert.match(uiSource, /buttonMarkup\("pmt-copy-log"/);
  assert.match(uiSource, /clipboard\.setContent\(\{ "text\/plain": text \}\)/);
  assert.match(uiSource, /logArea\.select\(\)/);
  assert.equal(manifest.requiredPermissions.clipboard, "readAndWrite");
});

test("custom buttons avoid Premiere's mismatched native inner border", () => {
  assert.doesNotMatch(uiSource, /<button/);
  assert.match(uiSource, /role="button"/);
  assert.match(uiSource, /data-disabled=/);
  assert.match(styles, /\.pmt-button\s*\{[^}]*display:\s*flex;/s);
  assert.match(styles, /\.pmt-button\s*\{[^}]*border-radius:\s*7px;/s);
});

test("the In point frame is exported and accepts a normalized tracking point", () => {
  assert.match(uiSource, /exportPreviewFrame\(\)/);
  assert.match(uiSource, /Capturer et préparer/);
  assert.doesNotMatch(uiSource, /pmt-read-range/);
  assert.match(uiSource, /pmt-preview-image/);
  assert.match(uiSource, /PMT_SESSION\.normalizePoint/);
  assert.match(premiereSource, /Exporter\.exportSequenceFrame\(/);
  assert.match(premiereSource, /nativeFileSystem\.readdir\(temporaryFolder\.nativePath\)/);
  assert.match(premiereSource, /setTimeout\(resolve, 100\)/);
  assert.doesNotMatch(styles, /\.pmt-preview\[data-ready="true"\]\s*\{[^}]*min-height:\s*0;/s);
});

test("analysed tracking plays the source video with native temporal controls before application", () => {
  assert.match(uiSource, /buildTrackingPreview/);
  assert.match(uiSource, /pmt-tracking-video/);
  assert.match(uiSource, /pmt-preview-scrubber/);
  assert.match(uiSource, /seekTrackingVideo/);
  assert.match(uiSource, /video\.pause\(\)/);
  assert.match(uiSource, /interpolateTrackingPoint/);
  assert.match(premiereSource, /exportTrackingPreviewVideo/);
  assert.match(premiereSource, /createPreviewVideo/);
  assert.doesNotMatch(uiSource, /exportTrackingPreviewFrame/);
  assert.doesNotMatch(styles, /pmt-analysis-progress|@keyframes/);
});

test("Transform Position falls back to a direct value read for proxy variants", () => {
  assert.match(premiereSource, /positionParam\.getValueAtTime\(inPoint\)/);
});

test("destination clips are selected only when applying the finished tracking", () => {
  assert.doesNotMatch(uiSource, /pmt-capture-target/);
  assert.match(uiSource, /Appliquer la trajectoire/);
  assert.match(uiSource, /buildPositionKeyframes/);
  assert.match(premiereSource, /applyTracking\(keyframes\)/);
  assert.match(premiereSource, /TickTime\.createWithSeconds/);
  assert.match(premiereSource, /keyframes\.map\(\(sample\)/);
  assert.match(premiereSource, /getTargetMediaFrame/);
  assert.match(premiereSource, /getTargetMotionScale/);
  assert.match(premiereSource, /computeTargetPositionScale/);
  assert.match(premiereSource, /coordinateSpace: "sequence"/);
});

test("manifest v6 loads the platform Hybrid addon and exposes its startup diagnostic", () => {
  assert.equal(manifest.manifestVersion, 6);
  assert.equal(manifest.requiredPermissions.enableAddon, true);
  assert.equal(manifest.requiredPermissions.localFileSystem, "plugin");
  assert.equal(manifest.addon.name, "premiere-motion-tracker-" + manifest.version + ".uxpaddon");
  assert.match(nativeSource, /await require\("premiere-motion-tracker-0\.2\.5\.uxpaddon"\)/);
  assert.match(nativeSource, /loadedAddon\.runSelfTest\(\)/);
  assert.match(nativeSource, /addon\.inspectMedia/);
  assert.match(nativeSource, /addon\.trackMedia/);
  assert.match(nativeSource, /addon\.createPreviewVideo/);
  assert.match(uiSource, /PMT_NATIVE\.initialize\(\)/);
  assert.match(uiSource, /Moteur natif chargé/);
});

test("native analysis visibly enters an in-progress state before tracking begins", () => {
  assert.match(uiSource, /Analyse OpenCV en cours/);
  assert.match(uiSource, /Analyse en cours…/);
  assert.match(uiSource, /waitForPanelPaint\(\)/);
  assert.doesNotMatch(styles, /pmt-analysis-progress|@keyframes/);
});
