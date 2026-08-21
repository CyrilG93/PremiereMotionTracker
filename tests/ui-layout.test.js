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
const previewPreset = fs.readFileSync(path.join(projectRoot, "assets", "presets", "pmt-preview-h264.epr"), "utf8");

test("interactive rows use flex instead of hidden UXP grid layouts", () => {
  assert.match(styles, /\.pmt-slot\s*\{[^}]*display:\s*flex;/s);
  assert.match(styles, /\.pmt-actions\s*\{[^}]*display:\s*flex;/s);
  assert.doesNotMatch(styles, /display:\s*grid;/);
});

test("the complete docked panel scrolls when its controls exceed the available height", () => {
  assert.match(styles, /body\s*\{[^}]*position:\s*absolute;/s);
  assert.match(styles, /body\s*\{[^}]*bottom:\s*20px;/s);
  assert.match(styles, /body\s*\{[^}]*overflow:\s*auto;/s);
  assert.match(styles, /#pmt-root\s*\{[^}]*min-height:\s*100%;/s);
  assert.match(styles, /\.pmt-shell\s*\{[^}]*min-height:\s*100%;/s);
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

test("tracking preview replays Premiere-rendered image frames without replacing diagnostics", () => {
  assert.match(uiSource, /buildTrackingPreview/);
  assert.match(uiSource, /Array\.isArray\(state\.tracking\) \? state\.tracking\.slice\(\) : \[\]/);
  assert.doesNotMatch(uiSource, /selectPreviewSamples/);
  assert.match(uiSource, /pmt-toggle-preview-generation/);
  assert.match(uiSource, /state\.previewGenerationSkipped/);
  assert.match(uiSource, /Tracking preview generation skipped by user/);
  assert.match(uiSource, /pmt-tracking-image-a/);
  assert.match(uiSource, /pmt-tracking-image-b/);
  assert.match(uiSource, /updatePreviewBuildStatus/);
  assert.match(uiSource, /scheduleTrackingPreviewFrame/);
  assert.match(uiSource, /pmt-skip-preview/);
  assert.match(uiSource, /startTracking/);
  assert.match(uiSource, /pollTracking/);
  assert.match(uiSource, /waitForTrackingProgress/);
  assert.match(premiereSource, /exportTrackingPreviewFrame/);
  assert.match(premiereSource, /getSequenceSecondsForMediaSample/);
  assert.match(styles, /\.pmt-preview-buffer\s*\{[^}]*opacity:\s*0;/s);
  assert.doesNotMatch(styles, /@keyframes/);
});

test("tracking review scrubs through Spectrum and can replace only the corrected tail", () => {
  assert.match(uiSource, /<sp-slider class="pmt-preview-slider"/);
  assert.match(uiSource, /pmt-retrack-from-here/);
  assert.match(uiSource, /chooseCorrectionPoint/);
  assert.match(uiSource, /replaceTrackingTail\(previousTracking, replacement\)/);
  assert.match(uiSource, /previewSlider\.addEventListener\("input", scrubPreview\)/);
  assert.match(styles, /\.pmt-preview-slider\s*\{[^}]*width:\s*100%;/s);
  assert.doesNotMatch(uiSource, /type="range"/);
});

test("validation exposes confidence markers, visible search-area tuning, and Surface detail", () => {
  assert.match(uiSource, /pmt-confidence-threshold/);
  assert.match(uiSource, /pmt-search-radius/);
  assert.match(uiSource, /pmt-next-uncertain/);
  assert.match(uiSource, /pmt-uncertain-marker/);
  assert.match(uiSource, /pmt-surface-feature-count/);
  assert.match(uiSource, /pmt-surface-feature-count-label/);
  assert.match(uiSource, /surfaceFeatureCount/);
  assert.match(uiSource, /state\.searchRadius/);
  assert.match(uiSource, /updateSearchAreaSize/);
  assert.match(uiSource, /frameRatesAreCompatible/);
  assert.match(nativeSource, /Number\(searchRadius\) \|\| 10/);
  assert.match(styles, /\.pmt-search-area\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(uiSource, /getSearchAreaVisualSize/);
  assert.match(styles, /\.pmt-uncertain-markers\s*\{[^}]*position:\s*relative;/s);
});

test("the internal extension name stays concise while the panel retains its Motion Tracker label", () => {
  assert.equal(manifest.name, "Motion Tracker");
  assert.equal(manifest.entrypoints[0].label.default, "Motion Tracker");
});

test("the direct Premiere preview uses its bundled muted H.264 preset", () => {
  assert.match(previewPreset, /<PresetName>Premiere Motion Tracker Preview H\.264<\/PresetName>/);
  assert.match(previewPreset, /<DoAudio>false<\/DoAudio>/);
  assert.match(previewPreset, /<DoVideo>true<\/DoVideo>/);
  assert.match(previewPreset, /<ParamIdentifier>ADBEVideoCodec<\/ParamIdentifier>/);
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

test("surface mode collects four corners and applies the tracked plane through Corner Pin", () => {
  assert.match(uiSource, /trackingMode: "point"/);
  assert.match(uiSource, /pmt-mode-surface/);
  assert.match(uiSource, /referenceCorners\.length === 4/);
  assert.match(uiSource, /surfaceCornersMarkup/);
  assert.match(uiSource, /surfacePolygonPoints/);
  assert.match(uiSource, /beginSurfaceCornerDrag/);
  assert.match(uiSource, /nudgeSurfaceCorner/);
  assert.match(uiSource, /polygon\.setAttribute\("points", surfacePolygonPoints\(frame\.corners\)\)/);
  // Surface tracking now uses the same cancellable worker flow as point tracking.
  assert.match(uiSource, /PMT_NATIVE\.startSurfaceTracking/);
  assert.match(uiSource, /buildSurfaceKeyframes/);
  assert.match(uiSource, /PMT_PREMIERE\.applySurfaceTracking/);
  assert.doesNotMatch(uiSource, /pmt-surface-application-motion/);
  assert.match(nativeSource, /addon\.trackSurface/);
  assert.match(nativeSource, /addon\.startSurfaceTracking/);
  assert.match(nativeSource, /Number\(featureCount\) \|\| 240/);
  assert.match(premiereSource, /createCornerPinComponent/);
  assert.match(premiereSource, /applySurfaceTracking/);
  assert.match(premiereSource, /getTargetMotionGeometry/);
  assert.match(premiereSource, /computeCornerPinPoint/);
  assert.match(styles, /\.pmt-surface-corner\s*\{[^}]*position:\s*absolute;/s);
  assert.match(styles, /\.pmt-surface-shape\s*\{[^}]*pointer-events:\s*none;/s);
  assert.match(styles, /\.pmt-surface-corner-editable\s*\{[^}]*cursor:\s*grab;/s);
});

test("manifest v6 loads the platform Hybrid addon and exposes its startup diagnostic", () => {
  assert.equal(manifest.manifestVersion, 6);
  assert.equal(manifest.requiredPermissions.enableAddon, true);
  assert.equal(manifest.requiredPermissions.localFileSystem, "fullAccess");
  assert.equal(manifest.addon.name, "premiere-motion-tracker-" + manifest.version + ".uxpaddon");
  // Keep the asserted Hybrid module filename aligned with the manifest version.
  const addonPattern = new RegExp('await require\\("premiere-motion-tracker-' + manifest.version.replace(/\./g, '\\.') + '\\.uxpaddon"\\)');
  assert.match(nativeSource, addonPattern);
  assert.match(nativeSource, /loadedAddon\.runSelfTest\(\)/);
  assert.match(nativeSource, /addon\.inspectMedia/);
  assert.match(nativeSource, /addon\.trackMedia/);
  assert.match(nativeSource, /addon\.trackSurface/);
  assert.match(nativeSource, /addon\.startTracking/);
  assert.match(nativeSource, /addon\.pollTracking/);
  assert.match(uiSource, /PMT_NATIVE\.initialize\(\)/);
  assert.match(uiSource, /Native engine loaded/);
});

test("panel assets use the current version cache key", () => {
  const index = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  // Cache keys must change with the manifest version so Premiere reloads the current panel assets.
  const escapedVersion = manifest.version.replace(/\./g, "\\.");
  assert.match(index, new RegExp("premiereBridge\\.js\\?v=" + escapedVersion));
  assert.match(index, new RegExp("trajectory\\.js\\?v=" + escapedVersion));
});

test("native analysis visibly enters an in-progress state before tracking begins", () => {
  assert.match(uiSource, /OpenCV analysis in progress/);
  assert.match(uiSource, /Analyzing…/);
  assert.match(uiSource, /waitForPanelPaint\(\)/);
  assert.doesNotMatch(styles, /pmt-analysis-progress|@keyframes/);
});

test("point tracking exposes a real native cancellation control while analysis is running", () => {
  assert.match(uiSource, /pmt-cancel-analysis/);
  assert.match(uiSource, /cancelAnalysis\(rootNode\)/);
  assert.match(uiSource, /PMT_NATIVE\.cancelTracking\(state\.analysisTaskId\)/);
  assert.match(uiSource, /state\.cancelRequested/);
  assert.match(nativeSource, /async function cancelTracking/);
});

test("English is the default panel language and a compact French switch remains available", () => {
  assert.match(uiSource, /language: "en"/);
  assert.match(uiSource, /languageButton: "FR"/);
  assert.match(uiSource, /pmt-toggle-language/);
  assert.match(styles, /\.pmt-header-tools\s*\{[^}]*display:\s*flex;/s);
});
