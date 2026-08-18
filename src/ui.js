(function (root) {
  "use strict";

  const state = {
    language: "en",
    source: null,
    media: null,
    range: null,
    preview: null,
    trackingPreview: null,
    previewFrameIndex: 0,
    previewActiveBuffer: "a",
    previewPaintRequest: 0,
    previewPlaying: false,
    previewBuildCount: 0,
    previewBuildTotal: 0,
    previewSkipRequested: false,
    correction: null,
    confidenceThreshold: 0.65,
    searchRadius: 10,
    smoothingEnabled: true,
    trackingMode: "point",
    // Keep the experimental shape-preserving implementation dormant while Surface uses Corner Pin only.
    surfaceApplication: "perspective",
    referencePoint: null,
    referenceCorners: [],
    tracking: null,
    liveSamples: [],
    analysisTaskId: "",
    analysisSampleIndex: 0,
    busy: false,
    operation: "",
    log: ["Prototype ready. Capture the source clip first."]
  };
  let previewPlaybackTimer = null;

  // Keep the visible panel wording separate from technical diagnostics and default to English.
  const translations = {
    en: {
      noClip: "No source clip",
      noMedia: "Video metadata not read",
      sourceClip: "Clip to analyze",
      capturePrepare: "Capture and prepare",
      video: "Video",
      selectCapture: "Select and capture the clip to analyze.",
      analysisRunning: "OpenCV analysis in progress… Do not close the panel.",
      liveProgress: "Analyzing {count} frames…",
      analysisReady: "{count} frames analyzed · {uncertain} uncertain. Review them before applying.",
      inImageLoaded: "In-point image loaded. Click the image to place the tracking point.",
      sourceReady: "Selection confirmed. The OpenCV engine is the next milestone.",
      trackingMode: "Tracking mode",
      pointMode: "Point",
      surfaceMode: "Surface (beta)",
      surfaceHelp: "Click the four corners in order, then drag each blue handle independently to refine the surface.",
      resetSurface: "Reset corners",
      readyToAnalyze: "Ready to analyze the In/Out range.",
      loading: "loading…",
      unavailable: "unavailable",
      analyze: "Analyze",
      analyzing: "Analyzing…",
      play: "Play",
      pause: "Pause",
      preparingPreview: "Preparing preview {count} / {total}…",
      skippingPreview: "Skipping preview…",
      trackingPreview: "Tracking preview · frame {current} / {total} · confidence {confidence}%",
      trackingPreviewAlt: "Tracking preview",
      previewNavigation: "Browse the analyzed frames",
      correctionHelp: "Click the image to correct the point, then re-track from this frame.",
      retrackFromHere: "Re-track from this frame",
      retracking: "Re-tracking from the corrected frame…",
      confidenceThreshold: "Confidence alert threshold: {value}%",
      searchArea: "Search area: ±{value} px",
      smoothing: "Light smoothing when applying",
      rawTrajectory: "Raw trajectory",
      uncertainFrames: "{count} uncertain image(s)",
      nextUncertain: "Next uncertain",
      uncertainMarker: "Uncertain image {current}",
      inImageAlt: "Sequence image at the In point",
      emptyPreview: "The sequence image at the In point will appear here after preparation.",
      sourceTitle: "1. Tracking source",
      previewTitle: "2. Preview",
      skipPreview: "Skip preview",
      start: "Start",
      previousFrame: "− frame",
      nextFrame: "+ frame",
      applyTitle: "3. Apply",
      applyHelp: "After tracking, select one or more destination clips. One Position keyframe will be created for every valid frame.",
      applySurfaceHelp: "After surface tracking, select one or more destination clips. Corner Pin will receive four keys for every sequence frame.",
      surfaceApplication: "Surface application",
      surfaceMotion: "Preserve shape",
      surfacePerspective: "Match perspective",
      applySurfaceMotionHelp: "Use the surface as a movement reference. Transform will apply Position, Rotation and uniform Scale without warping the target.",
      applySurfacePerspectiveHelp: "Fit the target to all four tracked corners with Corner Pin. This can warp the target to match perspective.",
      applySurfaceMotion: "Apply preserved motion",
      applySurfacePerspective: "Apply perspective",
      applyTrajectory: "Apply trajectory",
      diagnostics: "Diagnostics",
      copy: "Copy",
      nativeEngine: "Native engine",
      languageButton: "FR"
    },
    fr: {
      noClip: "Aucun clip source",
      noMedia: "Métadonnées vidéo non lues",
      sourceClip: "Clip à analyser",
      capturePrepare: "Capturer et préparer",
      video: "Vidéo",
      selectCapture: "Sélectionnez puis capturez le clip à analyser.",
      analysisRunning: "Analyse OpenCV en cours… Ne fermez pas le panneau.",
      liveProgress: "Analyse de {count} images…",
      analysisReady: "{count} images analysées · {uncertain} incertaines. Vérifiez-les avant l’application.",
      inImageLoaded: "Image du point In chargée. Cliquez dans l’image pour placer le point de tracking.",
      sourceReady: "Sélection validée. Le moteur OpenCV constitue le prochain jalon.",
      trackingMode: "Mode de tracking",
      pointMode: "Point",
      surfaceMode: "Surface (bêta)",
      surfaceHelp: "Cliquez les quatre coins dans l’ordre, puis déplacez chaque poignée bleue indépendamment pour ajuster la surface.",
      resetSurface: "Réinitialiser les coins",
      readyToAnalyze: "Prêt à analyser la plage In/Out.",
      loading: "chargement…",
      unavailable: "indisponible",
      analyze: "Analyser",
      analyzing: "Analyse en cours…",
      play: "Lire",
      pause: "Pause",
      preparingPreview: "Préparation de l’aperçu {count} / {total}…",
      skippingPreview: "Aperçu ignoré…",
      trackingPreview: "Aperçu tracking · image {current} / {total} · confiance {confidence}%",
      trackingPreviewAlt: "Aperçu du tracking",
      previewNavigation: "Parcourir les images analysées",
      correctionHelp: "Cliquez dans l’image pour corriger le point, puis relancer le tracking depuis cette image.",
      retrackFromHere: "Relancer depuis cette image",
      retracking: "Reprise du tracking depuis l’image corrigée…",
      confidenceThreshold: "Seuil d’alerte confiance : {value}%",
      searchArea: "Zone de recherche : ±{value} px",
      smoothing: "Lissage léger à l’application",
      rawTrajectory: "Trajectoire brute",
      uncertainFrames: "{count} image(s) incertaine(s)",
      nextUncertain: "Suivante incertaine",
      uncertainMarker: "Image incertaine {current}",
      inImageAlt: "Image de la séquence au point In",
      emptyPreview: "L’image de la séquence au point In apparaîtra ici après préparation.",
      sourceTitle: "1. Source du tracking",
      previewTitle: "2. Prévisualisation",
      skipPreview: "Ignorer l’aperçu",
      start: "Début",
      previousFrame: "− image",
      nextFrame: "+ image",
      applyTitle: "3. Application",
      applyHelp: "Après le tracking, sélectionnez un ou plusieurs clips de destination. Une clé Position sera créée pour chaque image valide.",
      applySurfaceHelp: "Après le suivi de surface, sélectionnez un ou plusieurs clips de destination. Corner Pin recevra quatre clés pour chaque image de la séquence.",
      surfaceApplication: "Application de la surface",
      surfaceMotion: "Conserver la forme",
      surfacePerspective: "Suivre la perspective",
      applySurfaceMotionHelp: "Utilise la surface comme référence de mouvement. Transform applique Position, Rotation et Échelle uniforme sans déformer le média cible.",
      applySurfacePerspectiveHelp: "Ajuste le média cible aux quatre coins avec Corner Pin. Cela peut le déformer pour suivre la perspective.",
      applySurfaceMotion: "Appliquer le mouvement conservé",
      applySurfacePerspective: "Appliquer la perspective",
      applyTrajectory: "Appliquer la trajectoire",
      diagnostics: "Diagnostic",
      copy: "Copier",
      nativeEngine: "Moteur natif",
      languageButton: "EN"
    }
  };

  // Format a translated panel string and leave missing placeholders visible during development.
  function t(key, values) {
    const template = translations[state.language][key] || translations.en[key] || key;
    return template.replace(/\{(\w+)\}/g, (match, name) => {
      return values && values[name] !== undefined ? String(values[name]) : match;
    });
  }

  // Escape dynamic Premiere labels before inserting them into the panel markup.
  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Add a diagnostic line while keeping enough history for useful bug reports.
  function addLog(message) {
    state.log.push(String(message));
    state.log = state.log.slice(-100);
  }

  // Discard progress data that belongs to an earlier source, range, or tracking point.
  function clearTrackingPreview() {
    if (previewPlaybackTimer) {
      clearTimeout(previewPlaybackTimer);
      previewPlaybackTimer = null;
    }
    state.trackingPreview = null;
    state.previewFrameIndex = 0;
    state.previewActiveBuffer = "a";
    state.previewPaintRequest += 1;
    state.previewPlaying = false;
    state.previewBuildCount = 0;
    state.previewBuildTotal = 0;
    state.previewSkipRequested = false;
    state.correction = null;
    state.liveSamples = [];
    state.analysisTaskId = "";
    state.analysisSampleIndex = 0;
  }

  // Keep the established point workflow separate from the four-corner planar workflow.
  function isSurfaceMode() {
    return state.trackingMode === "surface";
  }

  // Surface analysis is enabled only after the user has deliberately placed all four corners.
  function hasTrackingReference() {
    return isSurfaceMode() ? state.referenceCorners.length === 4 : Boolean(state.referencePoint);
  }

  // Format one captured clip for compact display in a docked panel.
  function clipLabel(clip, emptyLabel) {
    if (!clip) {
      return emptyLabel;
    }
    return clip.name + " · V" + (clip.trackIndex + 1);
  }

  // Format native decoder metadata without exposing implementation-only fields in the panel.
  function mediaLabel(media) {
    if (!media) {
      return t("noMedia");
    }
    const frameRate = Number(media.framesPerSecond || 0);
    const frameCount = Number(media.frameCount || 0);
    const size = Number(media.width || 0) + " × " + Number(media.height || 0);
    const frameRateLabel = frameRate > 0 ? frameRate.toFixed(3).replace(/\.0+$/, "") + " fps" : "unknown frame rate";
    const frameCountLabel = frameCount > 0 ? frameCount + " frames" : "unknown frame count";
    return size + " · " + frameRateLabel + " · " + frameCountLabel + " · " + String(media.backend || "unknown backend");
  }

  // Intersect the visible sequence range with the source clip and convert it into source-media seconds.
  function getTrackingMediaRange() {
    if (!state.source || !state.range || !hasTrackingReference()) {
      throw new Error("Capture and prepare a source, then place the tracking reference.");
    }
    if (state.source.reversed) {
      throw new Error("Reversed clip tracking is not supported yet.");
    }
    const speed = Number(state.source.speed);
    const normalizedSpeed = speed === 100 ? 1 : speed;
    if (!Number.isFinite(normalizedSpeed) || normalizedSpeed <= 0) {
      throw new Error("The source clip speed is invalid.");
    }
    const sequenceStart = Math.max(Number(state.range.inPoint.seconds), Number(state.source.start.seconds));
    const sequenceEnd = Math.min(Number(state.range.outPoint.seconds), Number(state.source.end.seconds));
    if (!Number.isFinite(sequenceStart) || !Number.isFinite(sequenceEnd) || sequenceEnd <= sequenceStart) {
      throw new Error("The sequence In/Out range does not overlap the source clip.");
    }
    return {
      startSeconds: Number(state.source.inPoint.seconds) + (sequenceStart - Number(state.source.start.seconds)) * normalizedSpeed,
      endSeconds: Number(state.source.inPoint.seconds) + (sequenceEnd - Number(state.source.start.seconds)) * normalizedSpeed
    };
  }

  // Select the latest known sample at the video playhead without forcing UXP to repaint the video image itself.
  function getSampleAtVideoTime(seconds) {
    const samples = state.tracking || state.liveSamples;
    if (!samples || !samples.length || !Number.isFinite(Number(seconds))) {
      return null;
    }
    let selected = samples[0];
    for (let index = 1; index < samples.length; index += 1) {
      if (Number(samples[index].seconds) > Number(seconds)) {
        break;
      }
      selected = samples[index];
    }
    return selected;
  }

  // Format one native confidence score for both the current frame label and the review markers.
  function confidencePercent(sample) {
    return Math.round(Math.max(0, Math.min(1, Number(sample && sample.confidence) || 0)) * 100);
  }

  // Keep only preview images that need attention at the current user-selected confidence threshold.
  function getPreviewUncertainIndexes() {
    const frames = state.trackingPreview && state.trackingPreview.frames ? state.trackingPreview.frames : [];
    return frames.reduce((indexes, frame, index) => {
      if (!frame.valid || Number(frame.confidence) < Number(state.confidenceThreshold)) {
        indexes.push(index);
      }
      return indexes;
    }, []);
  }

  // Bound visible marker count while preserving the first and last doubtful areas on long analyses.
  function selectUncertainMarkerIndexes(indexes) {
    const limit = 40;
    if (indexes.length <= limit) {
      return indexes;
    }
    return Array.from({ length: limit }, (_, index) => indexes[Math.round(index * (indexes.length - 1) / (limit - 1))]);
  }

  // Draw the configured optical-flow search window at the actual normalized tracking point.
  function searchAreaMarkup(point) {
    if (!point || !state.media || !Number(state.media.width) || !Number(state.media.height)) {
      return "";
    }
    const width = Math.min(100, Math.max(1, Number(state.searchRadius) * 2 / Number(state.media.width) * 100));
    const height = Math.min(100, Math.max(1, Number(state.searchRadius) * 2 / Number(state.media.height) * 100));
    return '<div class="pmt-search-area" style="left:' + (Number(point.x) * 100).toFixed(3) + '%;top:' + (Number(point.y) * 100).toFixed(3) + '%;width:' + width.toFixed(3) + '%;height:' + height.toFixed(3) + '%"></div>';
  }

  // Convert normalized corners into the stable 0–100 viewBox coordinates used by the non-interactive shape overlay.
  function surfacePolygonPoints(corners) {
    return (Array.isArray(corners) ? corners : []).map((corner) => {
      return (Number(corner.x) * 100).toFixed(3) + "," + (Number(corner.y) * 100).toFixed(3);
    }).join(" ");
  }

  // Keep draggable handles as HTML controls while SVG draws only the lightweight surface fill and dotted outline.
  function surfaceCornersMarkup(corners, editable) {
    if (!Array.isArray(corners) || !corners.length) {
      return "";
    }
    const points = surfacePolygonPoints(corners);
    const shape = corners.length >= 3
      ? '<svg class="pmt-surface-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon id="pmt-surface-polygon" points="' + points + '"></polygon></svg>'
      : '<svg class="pmt-surface-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline id="pmt-surface-polygon" points="' + points + '"></polyline></svg>';
    const handles = corners.map((corner, index) => {
      const className = editable ? "pmt-surface-corner pmt-surface-corner-editable" : "pmt-surface-corner";
      const attributes = editable
        ? ' role="button" tabindex="0" aria-label="Surface corner ' + String(index + 1) + '"'
        : ' aria-hidden="true"';
      return '<div class="' + className + '" data-surface-corner="' + String(index) + '"' + attributes + ' style="left:' + (Number(corner.x) * 100).toFixed(3) + '%;top:' + (Number(corner.y) * 100).toFixed(3) + '%">' + String(index + 1) + '</div>';
    }).join("");
    return shape + handles;
  }

  // Render attention markers below the host-provided slider without replacing its validated transport control.
  function uncertainMarkersMarkup(indexes, frameCount) {
    if (!indexes.length || frameCount < 2) {
      return '<div class="pmt-label">' + escapeHtml(t("uncertainFrames", { count: 0 })) + '</div>';
    }
    const markers = selectUncertainMarkerIndexes(indexes).map((index) => {
      const left = index / (frameCount - 1) * 100;
      return '<div class="pmt-uncertain-marker" role="button" tabindex="0" data-preview-index="' + String(index) + '" style="left:' + left.toFixed(3) + '%" aria-label="' + escapeHtml(t("uncertainMarker", { current: index + 1 })) + '"></div>';
    }).join("");
    return '<div class="pmt-uncertain-summary">' + escapeHtml(t("uncertainFrames", { count: indexes.length })) + '</div><div class="pmt-uncertain-markers" aria-label="' + escapeHtml(t("uncertainFrames", { count: indexes.length })) + '">' + markers + '</div>';
  }

  // Render a skin-free accessible control because Premiere adds an inner box to native buttons.
  function buttonMarkup(id, label, classNames, disabled) {
    const classes = ["pmt-button"].concat(classNames || []).join(" ");
    return '<div class="' + classes + '" id="' + id + '" role="button" aria-disabled="' + String(Boolean(disabled)) + '" data-disabled="' + String(Boolean(disabled)) + '" tabindex="' + (disabled ? "-1" : "0") + '">' + escapeHtml(label) + '</div>';
  }

  // Render an accessible skin-free checkbox because native UXP control styling varies by host version.
  function checkboxMarkup(id, label, checked, disabled) {
    return '<div class="pmt-checkbox" id="' + id + '" role="checkbox" aria-checked="' + String(Boolean(checked)) + '" aria-disabled="' + String(Boolean(disabled)) + '" data-disabled="' + String(Boolean(disabled)) + '" tabindex="' + (disabled ? "-1" : "0") + '"><span class="pmt-checkbox-box" aria-hidden="true">' + (checked ? "✓" : "") + '</span><span>' + escapeHtml(label) + '</span></div>';
  }

  // Compute the main readiness message from Premiere and native addon state.
  function getBanner() {
    const nativeStatus = root.PMT_NATIVE.probe();
    if (state.operation === "analysis") {
      // Keep the in-progress feedback limited to the existing stable UXP banner.
      return { tone: "warning", text: t("analysisRunning") };
    }
    if (state.operation === "preview") {
      return { tone: "warning", text: state.previewSkipRequested ? t("skippingPreview") : t("preparingPreview", { count: state.previewBuildCount, total: state.previewBuildTotal }) };
    }
    if (!state.source) {
      return { tone: "warning", text: t("selectCapture") };
    }
    if (state.preview) {
      if (state.tracking) {
        const uncertain = root.PMT_TRAJECTORY.findUncertainSamples(state.tracking, state.confidenceThreshold).length;
        return { tone: "success", text: t("analysisReady", { count: state.tracking.length, uncertain }) };
      }
      return { tone: "success", text: t("inImageLoaded") };
    }
    if (!nativeStatus.available) {
      return { tone: "warning", text: t("sourceReady") };
    }
    return { tone: "success", text: t("readyToAnalyze") };
  }

  // Render the complete prototype panel after each state change.
  function render(rootNode) {
    const banner = getBanner();
    const nativeStatus = root.PMT_NATIVE.probe();
    const nativeLabel = nativeStatus.available
      ? nativeStatus.version + " · self-test " + nativeStatus.selfTest
      : (nativeStatus.loading ? t("loading") : t("unavailable"));
    const canPrepare = Boolean(state.source && !state.busy);
    const surfaceMode = isSurfaceMode();
    const canAnalyze = Boolean(canPrepare && state.media && state.range && state.preview && hasTrackingReference());
    const canApplyTracking = Boolean(canPrepare && state.tracking && state.tracking.length >= 2 && state.range && state.range.sequenceId === state.source.sequenceId);
    const canPlayPreview = Boolean(!state.busy && state.trackingPreview && state.trackingPreview.frames.length > 1);
    const analyzeLabel = state.operation === "analysis" ? t("analyzing") : t("analyze");
    const playbackFrame = state.trackingPreview && state.trackingPreview.frames[state.previewFrameIndex];
    const hasCorrection = Boolean(!surfaceMode && state.correction && playbackFrame && state.correction.frameIndex === state.previewFrameIndex);
    const displayedPoint = hasCorrection ? state.correction.point : playbackFrame;
    const canRetrack = Boolean(!state.busy && hasCorrection && state.tracking && state.tracking.length > 1 && Number(playbackFrame.seconds) < Number(state.tracking[state.tracking.length - 1].seconds));
    const uncertainIndexes = getPreviewUncertainIndexes();
    const currentConfidence = confidencePercent(playbackFrame);
    const previewContent = playbackFrame
      ? '<div class="pmt-preview-stage"><img class="pmt-preview-buffer pmt-preview-buffer-active" id="pmt-tracking-image-a" src="' + escapeHtml(playbackFrame.url) + '" alt="' + escapeHtml(t("trackingPreviewAlt")) + '"><img class="pmt-preview-buffer" id="pmt-tracking-image-b" alt=""></div>' + (surfaceMode ? surfaceCornersMarkup(playbackFrame.corners, false) : searchAreaMarkup(displayedPoint) + '<div class="pmt-tracking-point" id="pmt-preview-point" style="left:' + (Number(displayedPoint.x) * 100).toFixed(3) + '%;top:' + (Number(displayedPoint.y) * 100).toFixed(3) + '%"></div>') + '<div class="pmt-preview-status" id="pmt-preview-status">' + escapeHtml(t("trackingPreview", { current: state.previewFrameIndex + 1, total: state.trackingPreview.frames.length, confidence: currentConfidence })) + '</div>'
      : state.preview
      ? '<img class="pmt-preview-image" src="' + escapeHtml(state.preview.url) + '" alt="' + escapeHtml(t("inImageAlt")) + '">' + (surfaceMode
        ? surfaceCornersMarkup(state.referenceCorners, true)
        : state.referencePoint ? searchAreaMarkup(state.referencePoint) + '<div class="pmt-tracking-point" style="left:' + (state.referencePoint.x * 100).toFixed(3) + '%;top:' + (state.referencePoint.y * 100).toFixed(3) + '%"></div>' : "")
      : '<div class="pmt-preview-grid"></div><div class="pmt-preview-copy">' + escapeHtml(t("emptyPreview")) + '</div>';
    rootNode.innerHTML = [
      '<div class="pmt-shell">',
      '  <div class="pmt-header">',
      '    <h1 class="pmt-title">Motion Tracker</h1>',
      '    <div class="pmt-header-tools">' + buttonMarkup("pmt-toggle-language", t("languageButton"), ["pmt-button-compact"], false) + '<span class="pmt-version">v' + escapeHtml(root.PMT_VERSION) + '</span></div>',
      '  </div>',
      '  <div class="pmt-banner" data-tone="' + banner.tone + '">' + escapeHtml(banner.text) + '</div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">' + escapeHtml(t("sourceTitle")) + '</h2>',
      '    <div class="pmt-slot">',
      '      <div class="pmt-slot-copy"><div class="pmt-label">' + escapeHtml(t("sourceClip")) + '</div><div class="pmt-value">' + escapeHtml(clipLabel(state.source, t("noClip"))) + '</div></div>',
      '      ' + buttonMarkup("pmt-capture-source", t("capturePrepare"), [], state.busy),
      '    </div>',
      state.source ? '    <div class="pmt-label">' + escapeHtml(t("video")) + ': ' + escapeHtml(mediaLabel(state.media)) + '</div>' : '',
      state.source ? '    <div class="pmt-settings"><div class="pmt-label">' + escapeHtml(t("trackingMode")) + '</div><div class="pmt-actions">' + buttonMarkup("pmt-mode-point", t("pointMode"), [], !canPrepare || !surfaceMode) + buttonMarkup("pmt-mode-surface", t("surfaceMode"), [], !canPrepare || surfaceMode) + '</div></div>' : '',
      state.source ? '    <div class="pmt-settings"><div class="pmt-label">' + escapeHtml(t("searchArea", { value: state.searchRadius })) + '</div><sp-slider class="pmt-setting-slider" id="pmt-search-radius" min="5" max="40" step="1" value="' + String(state.searchRadius) + '"' + (canPrepare ? '' : ' disabled') + ' aria-label="' + escapeHtml(t("searchArea", { value: state.searchRadius })) + '"></sp-slider></div>' : '',
      state.source ? '    <div class="pmt-settings"><div class="pmt-label">' + escapeHtml(t("confidenceThreshold", { value: Math.round(state.confidenceThreshold * 100) })) + '</div><sp-slider class="pmt-setting-slider" id="pmt-confidence-threshold" min="0.1" max="1" step="0.05" value="' + String(state.confidenceThreshold) + '"' + (canPrepare ? '' : ' disabled') + ' aria-label="' + escapeHtml(t("confidenceThreshold", { value: Math.round(state.confidenceThreshold * 100) })) + '"></sp-slider></div>' : '',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">' + escapeHtml(t("previewTitle")) + '</h2>',
      '    <div class="pmt-preview" id="pmt-preview" data-ready="' + String(Boolean(state.preview || playbackFrame)) + '">' + previewContent + '</div>',
      playbackFrame ? '    <div class="pmt-preview-navigation"><div class="pmt-label">' + escapeHtml(t("previewNavigation")) + '</div><sp-slider class="pmt-preview-slider" id="pmt-preview-slider" min="0" max="' + String(Math.max(0, state.trackingPreview.frames.length - 1)) + '" step="1" value="' + String(state.previewFrameIndex) + '"' + (canPlayPreview ? '' : ' disabled') + ' aria-label="' + escapeHtml(t("previewNavigation")) + '"></sp-slider></div>' : '',
      playbackFrame ? '    <div class="pmt-uncertain-review">' + uncertainMarkersMarkup(uncertainIndexes, state.trackingPreview.frames.length) + '</div>' : '',
      playbackFrame && !surfaceMode ? '    <div class="pmt-label">' + escapeHtml(t("correctionHelp")) + '</div>' : '',
      !playbackFrame && surfaceMode && state.preview ? '    <div class="pmt-label">' + escapeHtml(t("surfaceHelp")) + ' (' + String(state.referenceCorners.length) + '/4)</div>' : '',
      '    <div class="pmt-actions">',
      '      ' + buttonMarkup("pmt-analyze", analyzeLabel, ["pmt-button-primary"], !canAnalyze),
      '      ' + buttonMarkup("pmt-play-preview", state.previewPlaying ? t("pause") : t("play"), [], !canPlayPreview),
      !playbackFrame && surfaceMode ? '      ' + buttonMarkup("pmt-reset-surface", t("resetSurface"), [], !state.referenceCorners.length || state.busy) : '',
      state.operation === "preview" ? '      ' + buttonMarkup("pmt-skip-preview", t("skipPreview"), [], state.previewSkipRequested) : '',
      playbackFrame ? '      ' + buttonMarkup("pmt-preview-reset", t("start"), [], !canPlayPreview) : '',
      playbackFrame ? '      ' + buttonMarkup("pmt-next-uncertain", t("nextUncertain"), [], !uncertainIndexes.length || state.busy) : '',
      '    </div>',
      playbackFrame && !surfaceMode ? '    ' + buttonMarkup("pmt-retrack-from-here", t("retrackFromHere"), ["pmt-button-full", "pmt-button-primary"], !canRetrack) : '',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">' + escapeHtml(t("applyTitle")) + '</h2>',
      '    <div class="pmt-label">' + escapeHtml(surfaceMode ? t("applySurfaceHelp") : t("applyHelp")) + '</div>',
      !surfaceMode ? '    ' + checkboxMarkup("pmt-toggle-smoothing", state.smoothingEnabled ? t("smoothing") : t("rawTrajectory"), state.smoothingEnabled, !canPrepare) : '',
      '    ' + buttonMarkup("pmt-apply-tracking", surfaceMode ? t("applySurfacePerspective") : t("applyTrajectory"), ["pmt-button-full"], !canApplyTracking),
      '  </div>',
      '  <div class="pmt-card">',
      '    <div class="pmt-card-header"><h2 class="pmt-card-title">' + escapeHtml(t("diagnostics")) + '</h2>' + buttonMarkup("pmt-copy-log", t("copy"), ["pmt-button-compact"], false) + '</div>',
      '    <div class="pmt-label">' + escapeHtml(t("nativeEngine")) + ': ' + escapeHtml(nativeLabel) + '</div>',
      '    <div class="pmt-log" id="pmt-log" role="log" tabindex="0">' + escapeHtml(state.log.join("\n")) + '</div>',
      '  </div>',
      '</div>'
    ].join("");
    bindEvents(rootNode);
    const logArea = rootNode.querySelector("#pmt-log");
    if (logArea) {
      // Keep the latest diagnostic visible while preserving manual text selection.
      logArea.scrollTop = logArea.scrollHeight;
    }
  }

  // Yield once after rendering so Premiere can visibly paint the analysis state before native work begins.
  function waitForPanelPaint() {
    return new Promise((resolve) => setTimeout(resolve, 30));
  }

  // Repeat one deferred render only after source preparation because Premiere can miss that first exported image paint.
  function refreshAfterHostWork(rootNode, repeatRender) {
    render(rootNode);
    if (repeatRender) {
      setTimeout(() => {
        render(rootNode);
      }, 60);
    }
  }

  // Update only the banner while Premiere exports review images so diagnostics stay mounted and selectable.
  function updatePreviewBuildStatus(rootNode) {
    const banner = rootNode.querySelector(".pmt-banner");
    if (banner) {
      banner.textContent = state.previewSkipRequested ? t("skippingPreview") : t("preparingPreview", { count: state.previewBuildCount, total: state.previewBuildTotal });
    }
  }

  // Swap between two loaded PNG elements, keeping the last painted image visible until the next one is ready.
  function showTrackingPreviewFrame(rootNode, frameIndex) {
    const frames = state.trackingPreview && state.trackingPreview.frames;
    if (!frames || !frames.length) {
      return Promise.resolve(false);
    }
    const requestedIndex = Math.min(frames.length - 1, Math.max(0, Math.round(Number(frameIndex) || 0)));
    const nextBuffer = state.previewActiveBuffer === "a" ? "b" : "a";
    const activeImage = rootNode.querySelector("#pmt-tracking-image-" + state.previewActiveBuffer);
    const nextImage = rootNode.querySelector("#pmt-tracking-image-" + nextBuffer);
    if (!activeImage || !nextImage) {
      return Promise.resolve(false);
    }
    const request = state.previewPaintRequest + 1;
    state.previewPaintRequest = request;
    return new Promise((resolve) => {
      const swapWhenReady = () => {
        if (request !== state.previewPaintRequest) {
          resolve(false);
          return;
        }
        const frame = frames[requestedIndex];
        nextImage.classList.add("pmt-preview-buffer-active");
        activeImage.classList.remove("pmt-preview-buffer-active");
        state.previewActiveBuffer = nextBuffer;
        state.previewFrameIndex = requestedIndex;
        const correction = state.correction && state.correction.frameIndex === requestedIndex ? state.correction.point : frame;
        const point = rootNode.querySelector("#pmt-preview-point");
        const searchArea = rootNode.querySelector(".pmt-search-area");
        const status = rootNode.querySelector("#pmt-preview-status");
        const slider = rootNode.querySelector("#pmt-preview-slider");
        if (!isSurfaceMode() && point) {
          point.style.left = (Number(correction.x) * 100).toFixed(3) + "%";
          point.style.top = (Number(correction.y) * 100).toFixed(3) + "%";
        }
        if (!isSurfaceMode() && searchArea) {
          searchArea.style.left = (Number(correction.x) * 100).toFixed(3) + "%";
          searchArea.style.top = (Number(correction.y) * 100).toFixed(3) + "%";
        }
        if (isSurfaceMode() && Array.isArray(frame.corners)) {
          // Keep the translucent surface polygon in lockstep with the four tracked corner handles.
          const polygon = rootNode.querySelector("#pmt-surface-polygon");
          if (polygon) {
            polygon.setAttribute("points", surfacePolygonPoints(frame.corners));
          }
          Array.prototype.forEach.call(rootNode.querySelectorAll(".pmt-surface-corner"), (cornerElement) => {
            const cornerIndex = Number(cornerElement.getAttribute("data-surface-corner"));
            const corner = frame.corners[cornerIndex];
            if (corner) {
              cornerElement.style.left = (Number(corner.x) * 100).toFixed(3) + "%";
              cornerElement.style.top = (Number(corner.y) * 100).toFixed(3) + "%";
            }
          });
        }
        if (status) {
          status.textContent = t("trackingPreview", { current: requestedIndex + 1, total: frames.length, confidence: confidencePercent(frame) });
        }
        if (slider) {
          slider.value = String(requestedIndex);
        }
        resolve(true);
      };
      nextImage.onload = swapWhenReady;
      nextImage.onerror = () => resolve(false);
      nextImage.src = frames[requestedIndex].url;
    });
  }

  // Advance cached images at a conservative cadence which Premiere UXP has previously rendered successfully.
  function scheduleTrackingPreviewFrame(rootNode) {
    previewPlaybackTimer = setTimeout(() => {
      if (!state.previewPlaying || !state.trackingPreview) {
        previewPlaybackTimer = null;
        return;
      }
      showTrackingPreviewFrame(rootNode, (state.previewFrameIndex + 1) % state.trackingPreview.frames.length).then(() => scheduleTrackingPreviewFrame(rootNode));
    }, 83);
  }

  // Export a bounded sequence of Premiere PNGs after tracking, then make it available for replay.
  async function buildTrackingPreview(rootNode) {
    const samples = root.PMT_TRAJECTORY.selectPreviewSamples(state.tracking, 120);
    const frames = [];
    state.operation = "preview";
    state.previewBuildCount = 0;
    state.previewBuildTotal = samples.length;
    state.previewSkipRequested = false;
    render(rootNode);
    await waitForPanelPaint();
    for (let index = 0; index < samples.length; index += 1) {
      if (state.previewSkipRequested) {
        addLog("Tracking preview skipped.");
        return false;
      }
      const sample = samples[index];
      const exported = await root.PMT_PREMIERE.exportTrackingPreviewFrame(Number(sample.seconds), index);
      frames.push({ url: exported.url, width: exported.width, height: exported.height, frame: Number(sample.frame), seconds: Number(sample.seconds), x: Number(sample.x), y: Number(sample.y), corners: Array.isArray(sample.corners) ? sample.corners.map((corner) => ({ x: Number(corner.x), y: Number(corner.y) })) : null, confidence: Number(sample.confidence), valid: sample.valid !== false });
      state.previewBuildCount = index + 1;
      updatePreviewBuildStatus(rootNode);
    }
    state.trackingPreview = { frames };
    state.previewFrameIndex = 0;
    addLog("Tracking preview ready: " + frames.length + " rendered images.");
    return true;
  }

  // Let the user skip remaining PNG exports without interrupting the completed tracking trajectory.
  function skipTrackingPreview(rootNode) {
    state.previewSkipRequested = true;
    updatePreviewBuildStatus(rootNode);
  }

  // Toggle image playback without rebuilding the panel or its diagnostics section.
  function toggleTrackingPreview(rootNode) {
    state.previewPlaying = !state.previewPlaying;
    if (state.previewPlaying) {
      scheduleTrackingPreviewFrame(rootNode);
    } else if (previewPlaybackTimer) {
      clearTimeout(previewPlaybackTimer);
      previewPlaybackTimer = null;
    }
    const button = rootNode.querySelector("#pmt-play-preview");
    if (button) {
      button.textContent = state.previewPlaying ? t("pause") : t("play");
    }
  }

  // Jump to the next flagged review image and wrap to the first marker after the end of the preview.
  function showNextUncertainPreview(rootNode) {
    const indexes = getPreviewUncertainIndexes();
    if (!indexes.length) {
      return;
    }
    const nextIndex = indexes.find((index) => index > state.previewFrameIndex);
    showTrackingPreviewFrame(rootNode, nextIndex === undefined ? indexes[0] : nextIndex);
  }

  // Read the sequence range and its In image before an optional image-sequence preview is generated after analysis.
  async function prepareSourceRange(rootNode) {
    state.range = await root.PMT_PREMIERE.getActiveRange();
    state.tracking = null;
    state.liveSamples = [];
    state.analysisTaskId = "";
    state.analysisSampleIndex = 0;
    clearTrackingPreview();
    addLog("Sequence range: " + state.range.inPoint.seconds.toFixed(3) + " s → " + state.range.outPoint.seconds.toFixed(3) + " s");
    // Keep a usable centre-point default even when Premiere cannot export the optional still-image fallback.
    state.referencePoint = { x: 0.5, y: 0.5 };
    state.referenceCorners = [];
    try {
      state.preview = await root.PMT_PREMIERE.exportPreviewFrame();
      addLog("In-point image loaded: " + state.preview.fileName + " · " + state.preview.width + " × " + state.preview.height + ".");
    } catch (previewError) {
      state.preview = null;
      addLog("Image error: " + (previewError && previewError.message ? previewError.message : String(previewError)));
    }
    const session = root.PMT_SESSION.createSession({
      sequenceId: state.range.sequenceId,
      source: state.source,
      range: { inTicks: state.range.inPoint.ticks, outTicks: state.range.outPoint.ticks },
      referencePoint: { x: 0.5, y: 0.5 }
    });
    addLog("Session prepared: " + session.id);
  }

  // Capture the selected source, inspect it, and immediately prepare its sequence range in one action.
  async function captureAndPrepare(rootNode) {
    state.busy = true;
    render(rootNode);
    try {
      const clip = await root.PMT_PREMIERE.captureSelectedClip();
      state.source = clip;
      state.media = null;
      state.range = null;
      state.preview = null;
      state.referencePoint = null;
      state.referenceCorners = [];
      state.tracking = null;
      state.liveSamples = [];
      state.analysisTaskId = "";
      state.analysisSampleIndex = 0;
      clearTrackingPreview();
      addLog("Source captured: " + clip.name);
      if (!clip.mediaPath) {
        addLog("Warning: Premiere did not return a media path for this source.");
      } else {
        const nativeStatus = await root.PMT_NATIVE.initialize();
        if (!nativeStatus.available) {
          addLog("OpenCV reading unavailable: " + (nativeStatus.error || "addon not loaded"));
        } else {
          state.media = await root.PMT_NATIVE.inspectMedia(clip.mediaPath);
          addLog("OpenCV media: " + mediaLabel(state.media) + ".");
        }
      }
      // Premiere versions may report normal speed as either a 1x factor or 100 percent.
      if (![1, 100].includes(clip.speed) || clip.reversed) {
        addLog("Warning: time remapping will be rejected in this first V1.");
      }
      await prepareSourceRange(rootNode);
    } catch (error) {
      addLog("Error: " + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      refreshAfterHostWork(rootNode, true);
    }
  }

  // Convert a mouse or keyboard pointer event into a normalized point inside the visible preview frame.
  function getPreviewSelectionPoint(rootNode, event) {
    const preview = rootNode.querySelector("#pmt-preview");
    if (!preview || !state.source || !state.range || typeof preview.getBoundingClientRect !== "function") {
      return null;
    }
    const bounds = preview.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return null;
    }
    return root.PMT_SESSION.normalizePoint({
      x: (Number(event.clientX) - bounds.left) / bounds.width,
      y: (Number(event.clientY) - bounds.top) / bounds.height
    });
  }

  // Store either one point or the next ordered corner from a click inside the exported preview frame.
  function chooseReferencePoint(rootNode, event) {
    const selectedPoint = getPreviewSelectionPoint(rootNode, event);
    if (!selectedPoint) {
      return;
    }
    if (isSurfaceMode()) {
      if (state.referenceCorners.length >= 4) {
        return;
      }
      state.referenceCorners = state.referenceCorners.concat([selectedPoint]);
      addLog("Surface corner " + state.referenceCorners.length + "/4: " + (selectedPoint.x * 100).toFixed(1) + "%, " + (selectedPoint.y * 100).toFixed(1) + "%.");
    } else {
      state.referencePoint = selectedPoint;
      addLog("Tracking point: " + (state.referencePoint.x * 100).toFixed(1) + "%, " + (state.referencePoint.y * 100).toFixed(1) + "%.");
    }
    state.tracking = null;
    state.liveSamples = [];
    clearTrackingPreview();
    render(rootNode);
  }

  // Update one surface corner without changing the other three selected corners.
  function setSurfaceCorner(rootNode, cornerIndex, point) {
    if (!Number.isInteger(cornerIndex) || cornerIndex < 0 || cornerIndex >= state.referenceCorners.length || !point) {
      return false;
    }
    state.referenceCorners = state.referenceCorners.map((corner, index) => index === cornerIndex ? point : corner);
    state.tracking = null;
    state.liveSamples = [];
    return true;
  }

  // Update only the overlay during a drag so Premiere does not lose the current mouse interaction to a full render.
  function updateSurfaceSelectionOverlay(rootNode) {
    const points = surfacePolygonPoints(state.referenceCorners);
    const polygon = rootNode.querySelector("#pmt-surface-polygon");
    if (polygon) {
      polygon.setAttribute("points", points);
    }
    Array.prototype.forEach.call(rootNode.querySelectorAll(".pmt-surface-corner"), (cornerElement) => {
      const cornerIndex = Number(cornerElement.getAttribute("data-surface-corner"));
      const corner = state.referenceCorners[cornerIndex];
      if (corner) {
        cornerElement.style.left = (Number(corner.x) * 100).toFixed(3) + "%";
        cornerElement.style.top = (Number(corner.y) * 100).toFixed(3) + "%";
      }
    });
  }

  // Drag an existing blue handle with plain mouse events, which remain reliable in Premiere UXP panels.
  function beginSurfaceCornerDrag(rootNode, cornerIndex, event) {
    if (state.busy || !isSurfaceMode() || state.trackingPreview || !state.preview || !state.referenceCorners[cornerIndex]) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const move = (moveEvent) => {
      const point = getPreviewSelectionPoint(rootNode, moveEvent);
      if (point && setSurfaceCorner(rootNode, cornerIndex, point)) {
        updateSurfaceSelectionOverlay(rootNode);
      }
    };
    const finish = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", finish);
      const corner = state.referenceCorners[cornerIndex];
      if (corner) {
        addLog("Surface corner " + (cornerIndex + 1) + " adjusted: " + (corner.x * 100).toFixed(1) + "%, " + (corner.y * 100).toFixed(1) + "%." );
      }
      render(rootNode);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", finish);
  }

  // Let keyboard users nudge one selected corner without resetting the complete surface.
  function nudgeSurfaceCorner(rootNode, cornerIndex, event) {
    const changes = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const change = changes[event.key];
    if (!change || state.busy || !state.referenceCorners[cornerIndex]) {
      return;
    }
    event.preventDefault();
    const step = event.shiftKey ? 0.05 : 0.01;
    const current = state.referenceCorners[cornerIndex];
    const point = root.PMT_SESSION.normalizePoint({ x: current.x + change[0] * step, y: current.y + change[1] * step });
    if (setSurfaceCorner(rootNode, cornerIndex, point)) {
      addLog("Surface corner " + (cornerIndex + 1) + " adjusted: " + (point.x * 100).toFixed(1) + "%, " + (point.y * 100).toFixed(1) + "%." );
      render(rootNode);
    }
  }

  // Save a corrected point on the displayed review image without invalidating its already approved prefix.
  function chooseCorrectionPoint(rootNode, event) {
    const preview = rootNode.querySelector("#pmt-preview");
    const frame = state.trackingPreview && state.trackingPreview.frames[state.previewFrameIndex];
    if (!preview || !frame || typeof preview.getBoundingClientRect !== "function") {
      return;
    }
    const bounds = preview.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return;
    }
    if (previewPlaybackTimer) {
      clearTimeout(previewPlaybackTimer);
      previewPlaybackTimer = null;
    }
    state.previewPlaying = false;
    state.correction = {
      frameIndex: state.previewFrameIndex,
      frame: Number(frame.frame),
      seconds: Number(frame.seconds),
      point: root.PMT_SESSION.normalizePoint({
        x: (Number(event.clientX) - bounds.left) / bounds.width,
        y: (Number(event.clientY) - bounds.top) / bounds.height
      })
    };
    addLog("Tracking correction: source frame " + state.correction.frame + " · " + (state.correction.point.x * 100).toFixed(1) + "%, " + (state.correction.point.y * 100).toFixed(1) + "%." );
    render(rootNode);
  }

  // Convert a proxy-video playhead into the original media clock used by native tracking samples.
  function getPreviewVideoTrackingTime(video) {
    if (!state.previewVideo) {
      return Number(video.currentTime);
    }
    const mediaRange = getTrackingMediaRange();
    return Number(mediaRange.startSeconds) + Number(video.currentTime);
  }

  // Move only the overlay and its label while the video decoder stays mounted and continues normal playback.
  function updateVideoPreview(rootNode) {
    const video = rootNode.querySelector("#pmt-preview-video");
    const point = rootNode.querySelector("#pmt-preview-point");
    const status = rootNode.querySelector("#pmt-preview-status");
    if (!video || !point || !status) {
      return;
    }
    const sample = getSampleAtVideoTime(getPreviewVideoTrackingTime(video));
    const fallbackPoint = state.referencePoint || { x: 0.5, y: 0.5 };
    const displayPoint = sample || fallbackPoint;
    point.style.left = (Number(displayPoint.x) * 100).toFixed(3) + "%";
    point.style.top = (Number(displayPoint.y) * 100).toFixed(3) + "%";
    if (state.operation === "analysis") {
      status.textContent = t("liveProgress", { count: state.liveSamples.length });
    } else if (sample) {
      status.textContent = t("trackingPreview", { current: Math.max(1, state.tracking.indexOf(sample) + 1), total: state.tracking.length, confidence: confidencePercent(sample) });
    } else {
      status.textContent = t("readyToAnalyze");
    }
  }

  // Start the muted proxy just after its first frame so Premiere paints actual video instead of an empty zero-time surface.
  function bindVideoPreview(rootNode) {
    const video = rootNode.querySelector("#pmt-preview-video");
    if (!video) {
      return;
    }
    video.addEventListener("loadeddata", () => {
      addLog("Preview video decoded: " + Number(video.videoWidth) + " × " + Number(video.videoHeight) + " · " + Number(video.duration).toFixed(3) + " s.");
      video.currentTime = Number(video.duration) > 0.05 ? 0.04 : 0;
      updateVideoPreview(rootNode);
      // UXP's play() reports errors through the error event, so retain that listener as the failure path.
      Promise.resolve(video.play()).catch(() => {});
    });
    video.addEventListener("timeupdate", () => {
      updateVideoPreview(rootNode);
    });
    video.addEventListener("error", () => {
      state.videoUnavailable = true;
      const mediaError = video.error;
      const errorCode = mediaError && mediaError.code ? " (code " + mediaError.code + ")" : "";
      addLog(t("videoUnavailable") + errorCode + " URL: " + String(video.currentSrc || video.src || "unknown"));
      render(rootNode);
    });
    // Explicitly begin loading after listeners are attached so the diagnostic captures every UXP event.
    if (typeof video.load === "function") {
      video.load();
    }
  }

  // Wait briefly between progress polls so UXP keeps repainting while OpenCV decodes in its worker thread.
  function waitForTrackingProgress() {
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Drain native progress batches until the worker returns its final trajectory or a useful failure message.
  async function collectLiveTracking(rootNode, taskId) {
    while (true) {
      const progress = await root.PMT_NATIVE.pollTracking(taskId, state.analysisSampleIndex);
      const newSamples = Array.prototype.slice.call(progress.samples || []);
      if (newSamples.length) {
        state.liveSamples = state.liveSamples.concat(newSamples);
        state.analysisSampleIndex = Number(progress.nextIndex || state.liveSamples.length);
        updateVideoPreview(rootNode);
      }
      if (progress.done) {
        if (progress.cancelled) {
          throw new Error("Tracking cancelled.");
        }
        if (progress.error) {
          throw new Error(String(progress.error));
        }
        return state.liveSamples.slice();
      }
      await waitForTrackingProgress();
    }
  }

  // Run Lucas-Kanade in a background native worker while the source video and its overlay stay interactive.
  async function analyzeTracking(rootNode) {
    state.busy = true;
    state.operation = "analysis";
    state.tracking = null;
    state.liveSamples = [];
    state.analysisSampleIndex = 0;
    clearTrackingPreview();
    addLog("OpenCV analysis in progress…");
    render(rootNode);
    try {
      const video = rootNode.querySelector("#pmt-preview-video");
      if (video && typeof video.play === "function") {
        // Ignore autoplay-policy failures; controls still let the user start the muted preview manually.
        Promise.resolve(video.play()).catch(() => {});
      }
      await waitForPanelPaint();
      const mediaRange = getTrackingMediaRange();
      let samples;
      if (isSurfaceMode()) {
        // The first planar beta returns a bounded full trajectory; point tracking retains its live worker preview.
        samples = await root.PMT_NATIVE.trackSurface(state.source.mediaPath, state.referenceCorners, mediaRange.startSeconds, mediaRange.endSeconds, state.searchRadius);
      } else {
        state.analysisTaskId = await root.PMT_NATIVE.startTracking(state.source.mediaPath, state.referencePoint, mediaRange.startSeconds, mediaRange.endSeconds, state.searchRadius);
        samples = await collectLiveTracking(rootNode, state.analysisTaskId);
        state.analysisTaskId = "";
      }
      state.tracking = samples;
      const invalidCount = root.PMT_TRAJECTORY.findUncertainSamples(state.tracking, state.confidenceThreshold).length;
      addLog("OpenCV " + (isSurfaceMode() ? "surface tracking" : "tracking") + ": " + state.tracking.length + " frames from " + mediaRange.startSeconds.toFixed(3) + " s to " + mediaRange.endSeconds.toFixed(3) + " s.");
      addLog("Tracking settings: search ±" + state.searchRadius + " px · confidence alert below " + Math.round(state.confidenceThreshold * 100) + "%.");
      addLog("Uncertain frames: " + invalidCount + ".");
      try {
        await buildTrackingPreview(rootNode);
      } catch (previewError) {
        clearTrackingPreview();
        addLog("Preview unavailable: " + (previewError && previewError.message ? previewError.message : String(previewError)));
      }
    } catch (error) {
      state.tracking = null;
      state.analysisTaskId = "";
      addLog("Tracking error: " + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      state.operation = "";
      refreshAfterHostWork(rootNode, false);
    }
  }

  // Re-run only the unapproved tail of the trajectory from a manually corrected preview image.
  async function retrackFromCorrection(rootNode) {
    const correction = state.correction;
    const previousTracking = state.tracking ? state.tracking.slice() : [];
    if (!correction || !previousTracking.length) {
      return;
    }
    state.busy = true;
    state.operation = "analysis";
    state.liveSamples = [];
    state.analysisSampleIndex = 0;
    clearTrackingPreview();
    addLog("Re-tracking from source frame " + correction.frame + ".");
    render(rootNode);
    try {
      await waitForPanelPaint();
      const mediaRange = getTrackingMediaRange();
      if (Number(correction.seconds) >= Number(mediaRange.endSeconds)) {
        throw new Error("The correction must be before the end of the tracking range.");
      }
      state.analysisTaskId = await root.PMT_NATIVE.startTracking(state.source.mediaPath, correction.point, correction.seconds, mediaRange.endSeconds, state.searchRadius);
      const replacement = await collectLiveTracking(rootNode, state.analysisTaskId);
      state.analysisTaskId = "";
      state.tracking = root.PMT_TRAJECTORY.replaceTrackingTail(previousTracking, replacement);
      const invalidCount = root.PMT_TRAJECTORY.findUncertainSamples(state.tracking, state.confidenceThreshold).length;
      addLog("Correction merged: " + replacement.length + " re-tracked frames from source frame " + correction.frame + ".");
      addLog("Uncertain frames: " + invalidCount + ".");
      try {
        await buildTrackingPreview(rootNode);
      } catch (previewError) {
        clearTrackingPreview();
        addLog("Preview unavailable: " + (previewError && previewError.message ? previewError.message : String(previewError)));
      }
    } catch (error) {
      state.analysisTaskId = "";
      addLog("Correction error: " + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      state.operation = "";
      refreshAfterHostWork(rootNode, false);
    }
  }

  // Convert native samples to sequence-frame cadence before applying point or Corner Pin keyframes.
  async function applyTracking(rootNode) {
    state.busy = true;
    render(rootNode);
    try {
      const surfaceMode = isSurfaceMode();
      // Anchor point trajectories to their first actual sample; surface trajectories retain their exact four-corner shape.
      const trajectoryForApply = !surfaceMode && state.smoothingEnabled ? root.PMT_TRAJECTORY.smoothTrackingSamples(state.tracking) : state.tracking;
      const mediaRange = getTrackingMediaRange();
      const sequenceSamples = root.PMT_TRAJECTORY.resampleTrackingSamples(trajectoryForApply, mediaRange.startSeconds, mediaRange.endSeconds, state.range.frameRate, Number(state.source.speed) === 100 ? 1 : Number(state.source.speed));
      const keyframes = surfaceMode ? root.PMT_TRAJECTORY.buildSurfaceKeyframes(sequenceSamples) : root.PMT_TRAJECTORY.buildPositionKeyframes(sequenceSamples);
      const results = surfaceMode ? await root.PMT_PREMIERE.applySurfaceTracking(keyframes) : await root.PMT_PREMIERE.applyTracking(keyframes);
      addLog((surfaceMode ? "Surface perspective" : "Trajectory") + " applied to " + results.length + " selected clip(s). " + keyframes.length + " sequence-frame keys per clip.");
      if (!surfaceMode) {
        addLog("Applied trajectory: " + (state.smoothingEnabled ? "light smoothing." : "raw tracking."));
      }
      results.forEach((result) => {
        if (surfaceMode) {
          addLog(result.clipName + ": " + result.keyframeCount + " Corner Pin keys · " + result.matchName + ".");
          return;
        }
        const scale = result.positionScale || { x: 1, y: 1 };
        const coordinateSpace = result.targetCoordinateSpace === "sequence" ? "Graphics Layer" : "media";
        addLog(result.clipName + ": " + result.keyframeCount + " keys · " + coordinateSpace + " · compensation " + Number(scale.x).toFixed(3) + " × " + Number(scale.y).toFixed(3) + " · " + result.initialPoint.x + ", " + result.initialPoint.y + " → " + result.finalPoint.x + ", " + result.finalPoint.y);
      });
    } catch (error) {
      addLog("Application error: " + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      render(rootNode);
    }
  }

  // Try both Premiere UXP clipboard generations because their availability varies by host runtime.
  async function writeClipboardText(text) {
    const clipboard = navigator.clipboard;
    const errors = [];
    if (!clipboard) {
      throw new Error("Clipboard API unavailable");
    }
    if (typeof clipboard.setContent === "function") {
      try {
        // Premiere's current UXP recipe documents setContent for manifest v5 plugins.
        await clipboard.setContent({ "text/plain": text });
        return;
      } catch (error) {
        errors.push(error);
      }
    }
    if (typeof clipboard.writeText === "function") {
      try {
        // Newer UXP runtimes expose the standards-compatible writeText method.
        await clipboard.writeText(text);
        return;
      } catch (error) {
        errors.push(error);
      }
    }
    const lastError = errors[errors.length - 1];
    throw lastError || new Error("No compatible copy method");
  }

  // Select the HTML diagnostic so Ctrl+C remains available without UXP's fragile native textarea control.
  function selectDiagnostics(rootNode) {
    const logArea = rootNode.querySelector("#pmt-log");
    if (logArea && root.document && typeof root.document.createRange === "function" && typeof root.getSelection === "function") {
      logArea.focus();
      const selection = root.getSelection();
      if (!selection) {
        return;
      }
      const range = root.document.createRange();
      range.selectNodeContents(logArea);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  // Copy the complete diagnostic and leave a usable manual fallback on clipboard permission errors.
  async function copyDiagnostics(rootNode) {
    const text = state.log.join("\n");
    try {
      await writeClipboardText(text);
      addLog("Diagnostics copied to the clipboard.");
    } catch (error) {
      addLog("Copy failed: " + (error && error.message ? error.message : String(error)));
      addLog("Diagnostics selected: press Ctrl+C. If needed, remove and add the plugin again in UXP Developer Tool.");
    }
    render(rootNode);
    if (state.log[state.log.length - 1].indexOf("Diagnostics selected") === 0) {
      selectDiagnostics(rootNode);
    }
  }

  // Bind mouse and keyboard activation to one custom button without a native UXP skin.
  function bindButton(rootNode, id, callback) {
    const element = rootNode.querySelector("#" + id);
    if (!element || element.getAttribute("data-disabled") === "true") {
      return;
    }
    element.addEventListener("click", callback);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        callback();
      }
    });
  }

  // Connect the freshly rendered controls to their Premiere diagnostics.
  function bindEvents(rootNode) {
    bindButton(rootNode, "pmt-toggle-language", () => {
      state.language = state.language === "en" ? "fr" : "en";
      render(rootNode);
    });
    bindButton(rootNode, "pmt-capture-source", () => captureAndPrepare(rootNode));
    bindButton(rootNode, "pmt-mode-point", () => {
      state.trackingMode = "point";
      state.tracking = null;
      clearTrackingPreview();
      addLog("Tracking mode: point.");
      render(rootNode);
    });
    bindButton(rootNode, "pmt-mode-surface", () => {
      state.trackingMode = "surface";
      state.referenceCorners = [];
      state.tracking = null;
      clearTrackingPreview();
      addLog("Tracking mode: surface. Select 4 corners before Analyze.");
      render(rootNode);
    });
    bindButton(rootNode, "pmt-analyze", () => analyzeTracking(rootNode));
    bindButton(rootNode, "pmt-play-preview", () => toggleTrackingPreview(rootNode));
    bindButton(rootNode, "pmt-skip-preview", () => skipTrackingPreview(rootNode));
    bindButton(rootNode, "pmt-preview-reset", () => showTrackingPreviewFrame(rootNode, 0));
    bindButton(rootNode, "pmt-reset-surface", () => {
      state.referenceCorners = [];
      state.tracking = null;
      clearTrackingPreview();
      addLog("Surface corner selection reset.");
      render(rootNode);
    });
    bindButton(rootNode, "pmt-next-uncertain", () => showNextUncertainPreview(rootNode));
    bindButton(rootNode, "pmt-retrack-from-here", () => retrackFromCorrection(rootNode));
    bindButton(rootNode, "pmt-toggle-smoothing", () => {
      state.smoothingEnabled = !state.smoothingEnabled;
      render(rootNode);
    });
    bindButton(rootNode, "pmt-apply-tracking", () => applyTracking(rootNode));
    bindButton(rootNode, "pmt-copy-log", () => copyDiagnostics(rootNode));
    const preview = rootNode.querySelector("#pmt-preview");
    const previewSlider = rootNode.querySelector("#pmt-preview-slider");
    if (previewSlider && state.trackingPreview && !state.busy) {
      // Spectrum's native UXP slider gives direct scrubbing without the unreliable HTML range control.
      const scrubPreview = (event) => showTrackingPreviewFrame(rootNode, Number(event.target.value));
      previewSlider.addEventListener("input", scrubPreview);
      previewSlider.addEventListener("change", scrubPreview);
    }
    const searchRadiusSlider = rootNode.querySelector("#pmt-search-radius");
    if (searchRadiusSlider && !state.busy) {
      // Keep the search radius within the range independently validated by the native OpenCV addon.
      const updateSearchRadius = (event) => {
        state.searchRadius = Math.min(40, Math.max(5, Math.round(Number(event.target.value) || 10)));
        render(rootNode);
      };
      searchRadiusSlider.addEventListener("input", updateSearchRadius);
      searchRadiusSlider.addEventListener("change", updateSearchRadius);
    }
    const confidenceSlider = rootNode.querySelector("#pmt-confidence-threshold");
    if (confidenceSlider && !state.busy) {
      // Recompute only the review classification; native tracking samples remain unchanged.
      const updateConfidenceThreshold = (event) => {
        state.confidenceThreshold = Math.min(1, Math.max(0.1, Number(event.target.value) || 0.65));
        render(rootNode);
      };
      confidenceSlider.addEventListener("input", updateConfidenceThreshold);
      confidenceSlider.addEventListener("change", updateConfidenceThreshold);
    }
    Array.prototype.forEach.call(rootNode.querySelectorAll(".pmt-uncertain-marker"), (marker) => {
      const showMarker = () => showTrackingPreviewFrame(rootNode, Number(marker.getAttribute("data-preview-index")));
      marker.addEventListener("click", showMarker);
      marker.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          showMarker();
        }
      });
    });
    Array.prototype.forEach.call(rootNode.querySelectorAll(".pmt-surface-corner-editable"), (cornerElement) => {
      const cornerIndex = Number(cornerElement.getAttribute("data-surface-corner"));
      cornerElement.addEventListener("mousedown", (event) => beginSurfaceCornerDrag(rootNode, cornerIndex, event));
      cornerElement.addEventListener("keydown", (event) => nudgeSurfaceCorner(rootNode, cornerIndex, event));
    });
    if (preview && state.trackingPreview && !state.busy && !isSurfaceMode()) {
      preview.addEventListener("click", (event) => chooseCorrectionPoint(rootNode, event));
    } else if (preview && state.preview && !state.busy) {
      preview.addEventListener("click", (event) => {
        // The initial still image remains the only place where a new full-range reference point is chosen.
        if (!event.target || event.target.className === "pmt-preview-image") {
          chooseReferencePoint(rootNode, event);
        }
      });
    }
  }

  // Mount the panel once and let later actions update the same root node.
  function mount(rootNode) {
    const nativeInitialization = root.PMT_NATIVE.initialize();
    render(rootNode);
    nativeInitialization.then((nativeStatus) => {
      if (nativeStatus.available) {
        addLog("Native engine loaded: " + nativeStatus.version + " · self-test " + nativeStatus.selfTest + ".");
        addLog("Native exports: " + nativeStatus.exportNames.join(", ") + ".");
      } else {
        addLog("Native engine unavailable: " + (nativeStatus.error || "unknown reason") + ".");
      }
      render(rootNode);
    });
  }

  root.PMT_UI = { mount };
}(window));
