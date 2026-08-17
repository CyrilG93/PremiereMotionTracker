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
  assert.match(uiSource, /<div class="pmt-log" id="pmt-log" role="log" tabindex="0">/);
  assert.match(uiSource, /buttonMarkup\("pmt-copy-log"/);
  assert.match(uiSource, /clipboard\.setContent\(\{ "text\/plain": text \}\)/);
  assert.match(uiSource, /range\.selectNodeContents\(logArea\)/);
  assert.doesNotMatch(uiSource, /<textarea class="pmt-log"/);
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

test("optional Premiere-rendered video preview updates only its overlay while analysis runs", () => {
  assert.match(uiSource, /<video class="pmt-preview-video"/);
  assert.match(uiSource, /muted controls playsinline preload="auto"/);
  assert.match(uiSource, /pmt-render-video/);
  assert.match(uiSource, /renderVideoPreview: false/);
  assert.match(uiSource, /exportPreviewVideo\(\)/);
  assert.match(uiSource, /state\.previewVideo\.url/);
  assert.doesNotMatch(uiSource, /getVideoPreviewUrl/);
  assert.match(uiSource, /getSampleAtVideoTime/);
  assert.match(uiSource, /updateVideoPreview/);
  assert.match(uiSource, /startTracking/);
  assert.match(uiSource, /pollTracking/);
  assert.match(uiSource, /waitForTrackingProgress/);
  assert.doesNotMatch(uiSource, /buildTrackingPreview/);
  assert.doesNotMatch(premiereSource, /exportTrackingPreviewFrame/);
  assert.match(premiereSource, /EncoderManager\.getManager\(\)/);
  assert.match(premiereSource, /ExportType\.IMMEDIATELY/);
  assert.match(premiereSource, /encoderManager\.exportSequence/);
  assert.match(styles, /\.pmt-preview-video\s*\{[^}]*width:\s*100%;/s);
  assert.match(styles, /\.pmt-checkbox\s*\{[^}]*display:\s*flex;/s);
  assert.doesNotMatch(styles, /@keyframes/);
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
  assert.equal(manifest.requiredPermissions.localFileSystem, "fullAccess");
  assert.equal(manifest.addon.name, "premiere-motion-tracker-" + manifest.version + ".uxpaddon");
  assert.match(nativeSource, /await require\("premiere-motion-tracker-0\.3\.2\.uxpaddon"\)/);
  assert.match(nativeSource, /loadedAddon\.runSelfTest\(\)/);
  assert.match(nativeSource, /addon\.inspectMedia/);
  assert.match(nativeSource, /addon\.trackMedia/);
  assert.match(nativeSource, /addon\.startTracking/);
  assert.match(nativeSource, /addon\.pollTracking/);
  assert.match(uiSource, /PMT_NATIVE\.initialize\(\)/);
  assert.match(uiSource, /Native engine loaded/);
});

test("native analysis visibly enters an in-progress state before tracking begins", () => {
  assert.match(uiSource, /OpenCV analysis in progress/);
  assert.match(uiSource, /Analyzing…/);
  assert.match(uiSource, /waitForPanelPaint\(\)/);
  assert.doesNotMatch(styles, /pmt-analysis-progress|@keyframes/);
});

test("English is the default panel language and a compact French switch remains available", () => {
  assert.match(uiSource, /language: "en"/);
  assert.match(uiSource, /languageButton: "FR"/);
  assert.match(uiSource, /pmt-toggle-language/);
  assert.match(styles, /\.pmt-header-tools\s*\{[^}]*display:\s*flex;/s);
});
