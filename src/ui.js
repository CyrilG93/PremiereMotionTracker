(function (root) {
  "use strict";

  const state = {
    language: "en",
    source: null,
    media: null,
    range: null,
    preview: null,
    previewVideo: null,
    videoUnavailable: false,
    trackingPreview: null,
    previewFrameIndex: 0,
    previewActiveBuffer: "a",
    previewPaintRequest: 0,
    previewPlaying: false,
    previewBuildCount: 0,
    previewBuildTotal: 0,
    previewSkipRequested: false,
    previewGenerationSkipped: false,
    previewGenerationDeferred: false,
    previewGenerationConfirmed: false,
    correction: null,
    confidenceThreshold: 0.65,
    searchRadius: 10,
    surfaceFeatureCount: 240,
    trackingMode: "point",
    referencePoint: null,
    referenceCorners: [],
    tracking: null,
    liveSamples: [],
    analysisTaskId: "",
    analysisSampleIndex: 0,
    analysisTotalFrames: 0,
    cancelRequested: false,
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
      chooseSourceFile: "Choose source file…",
      sourceUsesProxy: "Premiere did not expose the original path; the attached proxy will be analyzed.",
      sourcePathUnavailable: "Premiere did not expose a usable media path. Choose the original source file to continue.",
      video: "Video",
      selectCapture: "Select and capture the clip to analyze.",
      analysisRunning: "Analysis in progress… {percent}%",
      liveProgress: "Analyzing {count} frames…",
      analysisReady: "{count} frames analyzed · {uncertain} uncertain. Review them before applying.",
      inImageLoaded: "In-point image loaded. Click the image to place the tracking point.",
      directVideoLoaded: "Original source video ready. Click the video to place the tracking point.",
      sourceReady: "Selection confirmed. The OpenCV engine is the next milestone.",
      trackingMode: "Tracking mode",
      pointMode: "Point",
      surfaceMode: "Surface",
      surfaceHelp: "Click the four corners in order, then drag each blue handle independently to refine the surface.",
      resetSurface: "Reset corners",
      readyToAnalyze: "Ready to analyze the In/Out range.",
      loading: "loading…",
      unavailable: "unavailable",
      analyze: "Analyze",
      analyzing: "Analyzing…",
      cancelAnalysis: "Cancel analysis",
      cancellingAnalysis: "Cancelling analysis…",
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
      surfaceDetail: "Surface tracking points: {value}",
      surfaceDetailHelp: "More points can improve recovery on detailed surfaces, but take longer to analyze.",
      frameRateWarning: "The source is {mediaFps} fps and the sequence is {sequenceFps} fps. This mismatch can cause jitter in the applied tracking.",
      uncertainFrames: "{count} uncertain image(s)",
      nextUncertain: "Next uncertain",
      uncertainMarker: "Uncertain image {current}",
      inImageAlt: "Sequence image at the In point",
      emptyPreview: "The sequence image at the In point will appear here after preparation.",
      sourceTitle: "1. Tracking source",
      previewTitle: "2. Preview",
      skipPreview: "Skip preview",
      skipPreviewBefore: "Skip preview generation",
      previewSkippedBefore: "Preview generation skipped",
      longPreviewWarning: "This range contains {count} preview images. Generating them can take time and use temporary storage.",
      generatePreview: "Generate preview images",
      start: "Start",
      previousFrame: "− frame",
      nextFrame: "+ frame",
      applyTitle: "3. Apply",
      applyHelp: "After tracking, select one or more destination clips. One Position keyframe will be created for every valid frame.",
      applySurfaceHelp: "After surface tracking, select one or more destination clips. Corner Pin will receive four keys for every sequence frame.",
      surfaceMotion: "Preserve shape",
      surfacePerspective: "Match perspective",
      applySurfaceMotionHelp: "Use the surface as a movement reference. Transform will apply Position, Rotation and uniform Scale without warping the target.",
      applySurfacePerspectiveHelp: "Fit the target to all four tracked corners with Corner Pin. This can warp the target to match perspective.",
      applySurfaceMotion: "Apply preserved motion",
      applySurfacePerspective: "Apply perspective",
      applyTrajectory: "Apply trajectory",
      selectDestination: "Select at least one destination clip, different from the source clip, in the same sequence.",
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
      chooseSourceFile: "Choisir le fichier source…",
      sourceUsesProxy: "Premiere ne fournit pas le chemin original ; le proxy associé sera analysé.",
      sourcePathUnavailable: "Premiere ne fournit pas de chemin média exploitable. Choisissez le fichier source original pour continuer.",
      video: "Vidéo",
      selectCapture: "Sélectionnez puis capturez le clip à analyser.",
      analysisRunning: "Analyse en cours… {percent}%",
      liveProgress: "Analyse de {count} images…",
      analysisReady: "{count} images analysées · {uncertain} incertaines. Vérifiez-les avant l’application.",
      inImageLoaded: "Image du point In chargée. Cliquez dans l’image pour placer le point de tracking.",
      directVideoLoaded: "Vidéo source originale prête. Cliquez dans la vidéo pour placer le point de tracking.",
      sourceReady: "Sélection validée. Le moteur OpenCV constitue le prochain jalon.",
      trackingMode: "Mode de tracking",
      pointMode: "Point",
      surfaceMode: "Surface",
      surfaceHelp: "Cliquez les quatre coins dans l’ordre, puis déplacez chaque poignée bleue indépendamment pour ajuster la surface.",
      resetSurface: "Réinitialiser les coins",
      readyToAnalyze: "Prêt à analyser la plage In/Out.",
      loading: "chargement…",
      unavailable: "indisponible",
      analyze: "Analyser",
      analyzing: "Analyse en cours…",
      cancelAnalysis: "Annuler l’analyse",
      cancellingAnalysis: "Annulation de l’analyse…",
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
      surfaceDetail: "Points analysés sur la surface : {value}",
      surfaceDetailHelp: "Davantage de points peuvent mieux récupérer une surface détaillée, mais rallongent l’analyse.",
      frameRateWarning: "La source est à {mediaFps} i/s et la séquence à {sequenceFps} i/s. Cette différence peut provoquer un tremblement du tracking appliqué.",
      uncertainFrames: "{count} image(s) incertaine(s)",
      nextUncertain: "Suivante incertaine",
      uncertainMarker: "Image incertaine {current}",
      inImageAlt: "Image de la séquence au point In",
      emptyPreview: "L’image de la séquence au point In apparaîtra ici après préparation.",
      sourceTitle: "1. Source du tracking",
      previewTitle: "2. Prévisualisation",
      skipPreview: "Ignorer l’aperçu",
      skipPreviewBefore: "Ne pas générer l’aperçu",
      previewSkippedBefore: "Génération d’aperçu ignorée",
      longPreviewWarning: "Cette plage contient {count} images d’aperçu. Leur génération peut prendre du temps et utiliser du stockage temporaire.",
      generatePreview: "Générer les images d’aperçu",
      start: "Début",
      previousFrame: "− image",
      nextFrame: "+ image",
      applyTitle: "3. Application",
      applyHelp: "Après le tracking, sélectionnez un ou plusieurs clips de destination. Une clé Position sera créée pour chaque image valide.",
      applySurfaceHelp: "Après le suivi de surface, sélectionnez un ou plusieurs clips de destination. Corner Pin recevra quatre clés pour chaque image de la séquence.",
      surfaceMotion: "Conserver la forme",
      surfacePerspective: "Suivre la perspective",
      applySurfaceMotionHelp: "Utilise la surface comme référence de mouvement. Transform applique Position, Rotation et Échelle uniforme sans déformer le média cible.",
      applySurfacePerspectiveHelp: "Ajuste le média cible aux quatre coins avec Corner Pin. Cela peut le déformer pour suivre la perspective.",
      applySurfaceMotion: "Appliquer le mouvement conservé",
      applySurfacePerspective: "Appliquer la perspective",
      applyTrajectory: "Appliquer la trajectoire",
      selectDestination: "Sélectionnez au moins un clip de destination différent du clip source dans la même séquence.",
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

  // Add timestamped diagnostics while retaining a generous support-report history.
  function addLog(message) {
    // Preserve the original host error: Premiere's UI locale can differ from the panel language.
    const now = new Date();
    const timestamp = [now.getHours(), now.getMinutes(), now.getSeconds()].map((value) => String(value).padStart(2, "0")).join(":") + "." + String(now.getMilliseconds()).padStart(3, "0");
    state.log.push("[" + timestamp + "] " + String(message));
    state.log = state.log.slice(-500);
  }

  // Treat an original-file video and a Premiere-exported still as equivalent initial preview surfaces.
  function hasInitialPreview() {
    return Boolean(state.previewVideo && !state.videoUnavailable) || Boolean(state.preview);
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
    state.previewGenerationDeferred = false;
    state.previewGenerationConfirmed = false;
    state.correction = null;
    state.liveSamples = [];
    state.analysisTaskId = "";
    state.analysisSampleIndex = 0;
    state.cancelRequested = false;
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

  // Premiere's sequence timebase is expressed in ticks per frame; use it only when the host returned a valid value.
  function getSequenceFrameRate() {
    const timebase = Number(state.range && state.range.timebase);
    const ticksPerSecond = 254016000000;
    const framesPerSecond = ticksPerSecond / timebase;
    return Number.isFinite(framesPerSecond) && framesPerSecond > 0 ? framesPerSecond : 0;
  }

  // Treat integer frame-rate multiples in either direction as safe for the frame-aligned keyframe workflow.
  function frameRatesAreCompatible(mediaFramesPerSecond, sequenceFramesPerSecond) {
    const mediaRate = Number(mediaFramesPerSecond);
    const sequenceRate = Number(sequenceFramesPerSecond);
    if (!Number.isFinite(mediaRate) || mediaRate <= 0 || !Number.isFinite(sequenceRate) || sequenceRate <= 0) {
      return true;
    }
    const ratio = mediaRate / sequenceRate;
    const inverseRatio = sequenceRate / mediaRate;
    return Math.abs(ratio - Math.round(ratio)) < 0.02 || Math.abs(inverseRatio - Math.round(inverseRatio)) < 0.02;
  }

  // Warn before analysis when frames cannot be paired cleanly between the source media and the active sequence.
  function getFrameRateWarning() {
    const mediaRate = Number(state.media && state.media.framesPerSecond);
    const sequenceRate = getSequenceFrameRate();
    if (frameRatesAreCompatible(mediaRate, sequenceRate)) {
      return "";
    }
    return t("frameRateWarning", {
      mediaFps: mediaRate.toFixed(3).replace(/\.0+$/, ""),
      sequenceFps: sequenceRate.toFixed(3).replace(/\.0+$/, "")
    });
  }

  // Magnify the small source-pixel search radius so its change remains visible in a compact 4K preview.
  function getSearchAreaVisualSize() {
    return Math.round(18 + Number(state.searchRadius) * 1.5);
  }

  // Resize every visible search window during a slider drag without rebuilding the active Spectrum control.
  function updateSearchAreaSize(rootNode) {
    if (!rootNode) {
      return;
    }
    const visualSize = getSearchAreaVisualSize();
    Array.prototype.forEach.call(rootNode.querySelectorAll(".pmt-search-area"), (searchArea) => {
      searchArea.style.width = String(visualSize) + "px";
      searchArea.style.height = String(visualSize) + "px";
    });
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

  // Convert the visible sequence window to the original-file clock before a reference point has been chosen.
  function getPreviewVideoRange() {
    if (!state.source || !state.range) {
      return null;
    }
    const speed = Number(state.source.speed) === 100 ? 1 : Number(state.source.speed);
    const sequenceStart = Math.max(Number(state.range.inPoint.seconds), Number(state.source.start.seconds));
    const sequenceEnd = Math.min(Number(state.range.outPoint.seconds), Number(state.source.end.seconds));
    if (state.source.reversed || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(sequenceStart) || !Number.isFinite(sequenceEnd) || sequenceEnd <= sequenceStart) {
      return null;
    }
    return {
      startSeconds: Number(state.source.inPoint.seconds) + (sequenceStart - Number(state.source.start.seconds)) * speed,
      endSeconds: Number(state.source.inPoint.seconds) + (sequenceEnd - Number(state.source.start.seconds)) * speed
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

  // Draw a scaled visual representation of the configured optical-flow search window at its normalized location.
  function searchAreaMarkup(point) {
    if (!point) {
      return "";
    }
    const visualSize = getSearchAreaVisualSize();
    return '<div class="pmt-search-area" style="left:' + (Number(point.x) * 100).toFixed(3) + '%;top:' + (Number(point.y) * 100).toFixed(3) + '%;width:' + String(visualSize) + 'px;height:' + String(visualSize) + 'px"></div>';
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
      // Estimate progress from the durable samples already published by the native worker.
      const percent = state.analysisTotalFrames > 0 ? Math.min(99, Math.floor(state.liveSamples.length / state.analysisTotalFrames * 100)) : 0;
      return { tone: "warning", text: state.cancelRequested ? t("cancellingAnalysis") : t("analysisRunning", { percent }) };
    }
    if (state.operation === "preview") {
      return { tone: "warning", text: state.previewSkipRequested ? t("skippingPreview") : t("preparingPreview", { count: state.previewBuildCount, total: state.previewBuildTotal }) };
    }
    if (!state.source) {
      return { tone: "warning", text: t("selectCapture") };
    }
    if (hasInitialPreview()) {
      if (state.tracking) {
        const uncertain = root.PMT_TRAJECTORY.findUncertainSamples(state.tracking, state.confidenceThreshold).length;
        return { tone: "success", text: t("analysisReady", { count: state.tracking.length, uncertain }) };
      }
      return { tone: "success", text: state.previewVideo && !state.videoUnavailable ? t("directVideoLoaded") : t("inImageLoaded") };
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
    const canAnalyze = Boolean(canPrepare && state.media && state.range && hasInitialPreview() && hasTrackingReference());
    const canApplyTracking = Boolean(canPrepare && state.tracking && state.tracking.length >= 2 && state.range && state.range.sequenceId === state.source.sequenceId);
    const canPlayPreview = Boolean(!state.busy && ((state.previewVideo && !state.videoUnavailable) || (state.trackingPreview && state.trackingPreview.frames.length > 1)));
    const analyzeLabel = state.operation === "analysis" ? t("analyzing") : t("analyze");
    const playbackFrame = state.trackingPreview && state.trackingPreview.frames[state.previewFrameIndex];
    const hasCorrection = Boolean(!surfaceMode && state.correction && playbackFrame && state.correction.frameIndex === state.previewFrameIndex);
    const displayedPoint = hasCorrection ? state.correction.point : playbackFrame;
    const canRetrack = Boolean(!state.busy && hasCorrection && state.tracking && state.tracking.length > 1 && Number(playbackFrame.seconds) < Number(state.tracking[state.tracking.length - 1].seconds));
    const uncertainIndexes = getPreviewUncertainIndexes();
    const currentConfidence = confidencePercent(playbackFrame);
    const previewContent = playbackFrame
      ? '<div class="pmt-preview-stage"><img class="pmt-preview-buffer pmt-preview-buffer-active" id="pmt-tracking-image-a" src="' + escapeHtml(playbackFrame.url) + '" alt="' + escapeHtml(t("trackingPreviewAlt")) + '"><img class="pmt-preview-buffer" id="pmt-tracking-image-b" alt=""></div>' + (surfaceMode ? (Array.isArray(playbackFrame.corners) ? playbackFrame.corners.map(searchAreaMarkup).join("") : "") + surfaceCornersMarkup(playbackFrame.corners, false) : searchAreaMarkup(displayedPoint) + '<div class="pmt-tracking-point" id="pmt-preview-point" style="left:' + (Number(displayedPoint.x) * 100).toFixed(3) + '%;top:' + (Number(displayedPoint.y) * 100).toFixed(3) + '%"></div>') + '<div class="pmt-preview-status" id="pmt-preview-status">' + escapeHtml(t("trackingPreview", { current: state.previewFrameIndex + 1, total: state.trackingPreview.frames.length, confidence: currentConfidence })) + '</div>'
      : state.previewVideo && !state.videoUnavailable
      ? '<video class="pmt-preview-video" id="pmt-preview-video" src="' + escapeHtml(state.previewVideo.url) + '" muted playsinline preload="metadata"></video>' + (surfaceMode
        ? state.referenceCorners.map(searchAreaMarkup).join("") + surfaceCornersMarkup(state.referenceCorners, true)
        : state.referencePoint ? searchAreaMarkup(state.referencePoint) + '<div class="pmt-tracking-point" id="pmt-preview-point" style="left:' + (state.referencePoint.x * 100).toFixed(3) + '%;top:' + (state.referencePoint.y * 100).toFixed(3) + '%"></div>' : "") + '<div class="pmt-preview-status" id="pmt-preview-status">' + escapeHtml(t("readyToAnalyze")) + '</div>'
      : state.preview
      ? '<img class="pmt-preview-image" src="' + escapeHtml(state.preview.url) + '" alt="' + escapeHtml(t("inImageAlt")) + '">' + (surfaceMode
        ? state.referenceCorners.map(searchAreaMarkup).join("") + surfaceCornersMarkup(state.referenceCorners, true)
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
      getFrameRateWarning() ? '    <div class="pmt-rate-warning">' + escapeHtml(getFrameRateWarning()) + '</div>' : '',
      state.source && !state.media && nativeStatus.available ? '    <div class="pmt-label">' + escapeHtml(t("sourcePathUnavailable")) + '</div>' + buttonMarkup("pmt-choose-source-media", t("chooseSourceFile"), ["pmt-button-full"], state.busy) : '',
      state.source ? '    <div class="pmt-settings"><div class="pmt-label">' + escapeHtml(t("trackingMode")) + '</div><div class="pmt-actions">' + buttonMarkup("pmt-mode-point", t("pointMode"), [], !canPrepare || !surfaceMode) + buttonMarkup("pmt-mode-surface", t("surfaceMode"), [], !canPrepare || surfaceMode) + '</div></div>' : '',
      state.source ? '    <div class="pmt-settings"><div class="pmt-label" id="pmt-search-radius-label">' + escapeHtml(t("searchArea", { value: state.searchRadius })) + '</div><sp-slider class="pmt-setting-slider" id="pmt-search-radius" min="5" max="40" step="1" value="' + String(state.searchRadius) + '"' + (canPrepare ? '' : ' disabled') + ' aria-label="' + escapeHtml(t("searchArea", { value: state.searchRadius })) + '"></sp-slider></div>' : '',
      state.source && surfaceMode ? '    <div class="pmt-settings"><div class="pmt-label" id="pmt-surface-feature-count-label">' + escapeHtml(t("surfaceDetail", { value: state.surfaceFeatureCount })) + '</div><div class="pmt-label">' + escapeHtml(t("surfaceDetailHelp")) + '</div><sp-slider class="pmt-setting-slider" id="pmt-surface-feature-count" min="80" max="400" step="20" value="' + String(state.surfaceFeatureCount) + '"' + (canPrepare ? '' : ' disabled') + ' aria-label="' + escapeHtml(t("surfaceDetail", { value: state.surfaceFeatureCount })) + '"></sp-slider></div>' : '',
      state.source ? '    <div class="pmt-settings"><div class="pmt-label" id="pmt-confidence-threshold-label">' + escapeHtml(t("confidenceThreshold", { value: Math.round(state.confidenceThreshold * 100) })) + '</div><sp-slider class="pmt-setting-slider" id="pmt-confidence-threshold" min="0.1" max="1" step="0.05" value="' + String(state.confidenceThreshold) + '"' + (canPrepare ? '' : ' disabled') + ' aria-label="' + escapeHtml(t("confidenceThreshold", { value: Math.round(state.confidenceThreshold * 100) })) + '"></sp-slider></div>' : '',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">' + escapeHtml(t("previewTitle")) + '</h2>',
       '    <div class="pmt-preview" id="pmt-preview" data-ready="' + String(Boolean(hasInitialPreview() || playbackFrame)) + '">' + previewContent + '</div>',
      playbackFrame ? '    <div class="pmt-preview-navigation"><div class="pmt-label">' + escapeHtml(t("previewNavigation")) + '</div><sp-slider class="pmt-preview-slider" id="pmt-preview-slider" min="0" max="' + String(Math.max(0, state.trackingPreview.frames.length - 1)) + '" step="1" value="' + String(state.previewFrameIndex) + '"' + (canPlayPreview ? '' : ' disabled') + ' aria-label="' + escapeHtml(t("previewNavigation")) + '"></sp-slider></div>' : '',
      playbackFrame ? '    <div class="pmt-uncertain-review">' + uncertainMarkersMarkup(uncertainIndexes, state.trackingPreview.frames.length) + '</div>' : '',
      playbackFrame && !surfaceMode ? '    <div class="pmt-label">' + escapeHtml(t("correctionHelp")) + '</div>' : '',
       !playbackFrame && surfaceMode && hasInitialPreview() ? '    <div class="pmt-label">' + escapeHtml(t("surfaceHelp")) + ' (' + String(state.referenceCorners.length) + '/4)</div>' : '',
      '    <div class="pmt-actions">',
      '      ' + buttonMarkup("pmt-analyze", analyzeLabel, ["pmt-button-primary"], !canAnalyze),
      state.operation === "analysis" ? '      ' + buttonMarkup("pmt-cancel-analysis", t("cancelAnalysis"), [], state.cancelRequested) : '',
      '      ' + buttonMarkup("pmt-play-preview", state.previewPlaying ? t("pause") : t("play"), [], !canPlayPreview),
      !playbackFrame && surfaceMode ? '      ' + buttonMarkup("pmt-reset-surface", t("resetSurface"), [], !state.referenceCorners.length || state.busy) : '',
      state.operation === "preview" ? '      ' + buttonMarkup("pmt-skip-preview", t("skipPreview"), [], state.previewSkipRequested) : '',
      !playbackFrame && state.preview && (state.operation === "" || state.operation === "analysis") ? '      ' + buttonMarkup("pmt-toggle-preview-generation", state.previewGenerationSkipped ? t("previewSkippedBefore") : t("skipPreviewBefore"), state.previewGenerationSkipped ? ["pmt-button-primary"] : [], false) : '',
      playbackFrame ? '      ' + buttonMarkup("pmt-preview-reset", t("start"), [], !canPlayPreview) : '',
      playbackFrame ? '      ' + buttonMarkup("pmt-next-uncertain", t("nextUncertain"), [], !uncertainIndexes.length || state.busy) : '',
      '    </div>',
      state.previewGenerationDeferred ? '    <div class="pmt-label">' + escapeHtml(t("longPreviewWarning", { count: state.previewBuildTotal })) + '</div>' + buttonMarkup("pmt-generate-long-preview", t("generatePreview"), ["pmt-button-full", "pmt-button-primary"], state.busy) : '',
      playbackFrame && !surfaceMode ? '    ' + buttonMarkup("pmt-retrack-from-here", t("retrackFromHere"), ["pmt-button-full", "pmt-button-primary"], !canRetrack) : '',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">' + escapeHtml(t("applyTitle")) + '</h2>',
      '    <div class="pmt-label">' + escapeHtml(surfaceMode ? t("applySurfaceHelp") : t("applyHelp")) + '</div>',
      canApplyTracking ? '    <div class="pmt-label">' + escapeHtml(t("selectDestination")) + '</div>' : '',
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
    bindVideoPreview(rootNode);
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
          Array.prototype.forEach.call(rootNode.querySelectorAll(".pmt-search-area"), (searchArea, index) => {
            const corner = frame.corners[index];
            if (corner) {
              searchArea.style.left = (Number(corner.x) * 100).toFixed(3) + "%";
              searchArea.style.top = (Number(corner.y) * 100).toFixed(3) + "%";
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

  // Keep the direct source video live by default; PNG review remains an opt-in fallback for hosts that cannot paint video.
  async function buildTrackingPreview(rootNode) {
    const samples = Array.isArray(state.tracking) ? state.tracking.slice() : [];
    if (state.previewVideo && !state.videoUnavailable) {
      addLog("Tracking overlay remains on the direct source video. PNG frame export bypassed for immediate preview.");
      return false;
    }
    if (state.previewGenerationSkipped) {
      // Honor the choice made before analysis completes without mounting or exporting preview PNGs.
      addLog("Tracking preview generation skipped by user.");
      return false;
    }
    if (samples.length > 600 && !state.previewGenerationConfirmed) {
      // Require an explicit decision before a long full-frame preview can consume substantial temporary storage.
      state.previewGenerationDeferred = true;
      state.previewBuildTotal = samples.length;
      addLog("Preview generation requires confirmation for " + samples.length + " images.");
      return false;
    }
    state.previewGenerationDeferred = false;
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
      let exported;
      try {
        exported = await root.PMT_PREMIERE.exportTrackingPreviewFrame(Number(sample.seconds), index, () => state.previewSkipRequested);
      } catch (error) {
        if (state.previewSkipRequested) {
          addLog("Tracking preview skipped.");
          return false;
        }
        throw error;
      }
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
    // Invalidate the pending image swap immediately, even while Premiere finishes its current frame export.
    state.previewPaintRequest += 1;
    updatePreviewBuildStatus(rootNode);
  }

  // Let users opt out before tracking completes, while preserving the existing in-progress export skip action.
  function togglePreviewGeneration(rootNode) {
    state.previewGenerationSkipped = !state.previewGenerationSkipped;
    addLog(state.previewGenerationSkipped ? "Tracking preview generation will be skipped." : "Tracking preview generation enabled.");
    render(rootNode);
  }

  // Resume a deliberately confirmed long preview after tracking has already completed successfully.
  async function generateDeferredPreview(rootNode) {
    if (!state.previewGenerationDeferred || state.busy) {
      return;
    }
    state.previewGenerationConfirmed = true;
    state.busy = true;
    try {
      await buildTrackingPreview(rootNode);
    } catch (error) {
      clearTrackingPreview();
      addLog("Preview unavailable: " + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      state.operation = "";
      refreshAfterHostWork(rootNode, false);
    }
  }

  // Summarize Premiere's source-item diagnostics without exposing NAS paths in the copied support log.
  function sourcePathDiagnostic(clip) {
    const details = clip && clip.sourceDiagnostics ? clip.sourceDiagnostics : {};
    const flags = [];
    if (details.isOffline) flags.push("offline");
    if (details.isSequence) flags.push("sequence/nest");
    if (details.isMulticam) flags.push("multicam");
    if (details.isMerged) flags.push("merged clip");
    if (details.hasProxy) flags.push("proxy attached");
    if (details.contentType) flags.push("content type " + details.contentType);
    return flags.length ? flags.join(" · ") : "no compatible file-backed media type reported";
  }

  // Toggle image playback without rebuilding the panel or its diagnostics section.
  function toggleTrackingPreview(rootNode) {
    const video = rootNode.querySelector("#pmt-preview-video");
    if (video && state.previewVideo && !state.videoUnavailable) {
      if (video.paused) {
        addLog("Source video play requested by user.");
        state.previewPlaying = true;
        Promise.resolve(video.play()).catch((error) => addLog("Source video play rejected: " + (error && error.message ? error.message : String(error))));
      } else {
        video.pause();
        state.previewPlaying = false;
        addLog("Source video paused by user.");
      }
      const button = rootNode.querySelector("#pmt-play-preview");
      if (button) button.textContent = state.previewPlaying ? t("pause") : t("play");
      return;
    }
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

  // Read the sequence range and prefer its original media file over an exported still-image fallback.
  async function prepareSourceRange(rootNode) {
    state.range = await root.PMT_PREMIERE.getActiveRange();
    state.tracking = null;
    state.liveSamples = [];
    state.analysisTaskId = "";
    state.analysisSampleIndex = 0;
    state.analysisTotalFrames = 0;
    clearTrackingPreview();
    addLog("Sequence range: " + state.range.inPoint.seconds.toFixed(3) + " s → " + state.range.outPoint.seconds.toFixed(3) + " s");
    // Keep a usable centre-point default even when the direct file preview is unavailable.
    state.referencePoint = { x: 0.5, y: 0.5 };
    state.referenceCorners = [];
    try {
      state.previewVideo = await root.PMT_PREMIERE.getSourcePreviewVideo();
      state.videoUnavailable = false;
      addLog("Direct source video prepared: " + state.previewVideo.fileName + " · origin " + state.previewVideo.origin + ". PNG preview export bypassed.");
    } catch (videoError) {
      state.previewVideo = null;
      state.videoUnavailable = true;
      addLog("Direct source video unavailable: " + (videoError && videoError.message ? videoError.message : String(videoError)) + ". Trying Premiere still image fallback.");
    }
    if (!state.previewVideo) {
      await loadStillPreviewFallback(rootNode, "no direct source video URL");
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
      state.previewVideo = null;
      state.videoUnavailable = false;
      state.referencePoint = null;
      state.referenceCorners = [];
      state.tracking = null;
      state.liveSamples = [];
      state.analysisTaskId = "";
      state.analysisSampleIndex = 0;
      clearTrackingPreview();
      addLog("Source captured: " + clip.name);
      addLog("Source descriptor: origin " + clip.mediaPathOrigin + " · proxy " + String(Boolean(clip.sourceDiagnostics && clip.sourceDiagnostics.hasProxy)) + " · offline " + String(Boolean(clip.sourceDiagnostics && clip.sourceDiagnostics.isOffline)) + " · speed " + String(clip.speed) + ".");
      if (!clip.mediaPath) {
        addLog("Warning: Premiere did not return a usable media path for this source (" + sourcePathDiagnostic(clip) + ").");
      } else {
        if (clip.mediaPathOrigin === "proxy") {
          addLog(t("sourceUsesProxy"));
        }
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

  // Inspect a manually selected source file and keep the captured sequence range ready for analysis.
  async function chooseSourceMedia(rootNode) {
    if (!state.source || state.busy) {
      return;
    }
    state.busy = true;
    render(rootNode);
    try {
      const selected = await root.PMT_PREMIERE.chooseSourceMediaFile();
      if (!selected) {
        addLog("Manual source selection cancelled.");
        return;
      }
      state.source.mediaPath = selected.mediaPath;
      state.source.mediaPathOrigin = "manual";
      const nativeStatus = await root.PMT_NATIVE.initialize();
      if (!nativeStatus.available) {
        throw new Error(nativeStatus.error || "OpenCV media reading is unavailable.");
      }
      state.media = await root.PMT_NATIVE.inspectMedia(selected.mediaPath);
      addLog("Manual source file selected: " + selected.fileName + ".");
      addLog("OpenCV media: " + mediaLabel(state.media) + ".");
      state.previewVideo = await root.PMT_PREMIERE.getSourcePreviewVideo();
      state.videoUnavailable = false;
      addLog("Direct source video updated after manual selection: " + state.previewVideo.fileName + ".");
    } catch (error) {
      addLog("Manual source error: " + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      refreshAfterHostWork(rootNode, false);
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

  // The direct file URL keeps the HTML video clock in the same seconds as native tracking samples.
  function getPreviewVideoTrackingTime(video) {
    return Number(video.currentTime);
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

  // Capture every useful media event because Premiere UXP can decode video without painting it.
  function bindVideoPreview(rootNode) {
    const video = rootNode.querySelector("#pmt-preview-video");
    if (!video) {
      return;
    }
    const describeVideo = () => "readyState=" + Number(video.readyState) + " networkState=" + Number(video.networkState) + " current=" + Number(video.currentTime).toFixed(3) + " duration=" + Number(video.duration).toFixed(3) + " paused=" + String(video.paused);
    const logVideoEvent = (name) => addLog("Source video event " + name + ": " + describeVideo());
    const previewRange = getPreviewVideoRange();
    state.previewPlaying = false;
    addLog("Source video mounted: " + String(state.previewVideo.fileName || "unknown") + " · origin " + String(state.previewVideo.origin || "unknown") + " · " + describeVideo());
    const playButton = rootNode.querySelector("#pmt-play-preview");
    if (playButton) playButton.textContent = t("play");
    ["loadstart", "loadedmetadata", "loadeddata", "canplay", "canplaythrough", "play", "playing", "pause", "seeking", "seeked", "waiting", "stalled", "suspend", "ended", "abort", "emptied"].forEach((eventName) => {
      video.addEventListener(eventName, () => logVideoEvent(eventName));
    });
    video.addEventListener("loadedmetadata", () => {
      addLog("Source video metadata: " + Number(video.videoWidth) + " × " + Number(video.videoHeight) + " · duration " + Number(video.duration).toFixed(3) + " s · target range " + (previewRange ? previewRange.startSeconds.toFixed(3) + " → " + previewRange.endSeconds.toFixed(3) + " s" : "unavailable") + ".");
      if (previewRange && Number.isFinite(Number(video.duration)) && previewRange.startSeconds >= 0 && previewRange.startSeconds < Number(video.duration)) {
        video.currentTime = previewRange.startSeconds;
        addLog("Source video seek requested: " + previewRange.startSeconds.toFixed(3) + " s.");
      }
    });
    video.addEventListener("loadeddata", () => {
      updateVideoPreview(rootNode);
    });
    video.addEventListener("play", () => {
      state.previewPlaying = true;
      const button = rootNode.querySelector("#pmt-play-preview");
      if (button) button.textContent = t("pause");
    });
    video.addEventListener("pause", () => {
      state.previewPlaying = false;
      const button = rootNode.querySelector("#pmt-play-preview");
      if (button) button.textContent = t("play");
    });
    video.addEventListener("timeupdate", () => {
      if (previewRange && Number(video.currentTime) >= previewRange.endSeconds) {
        video.pause();
        video.currentTime = previewRange.startSeconds;
        addLog("Source video looped at the selected Out point.");
      }
      updateVideoPreview(rootNode);
    });
    video.addEventListener("error", () => {
      state.videoUnavailable = true;
      const mediaError = video.error;
      const errorCode = mediaError && mediaError.code ? "code " + mediaError.code : "no MediaError code";
      addLog("Source video error: " + errorCode + " · " + describeVideo() + " · URL scheme " + String(video.currentSrc || video.src || "unknown").split(":")[0] + ". Falling back to the Premiere still image.");
      loadStillPreviewFallback(rootNode, "source video failed to load");
    });
    // Explicitly begin loading after listeners are attached so the diagnostic captures every UXP event.
    if (typeof video.load === "function") {
      video.load();
    }
  }

  // Export one still only after the direct original-file path failed, preserving a usable fallback in Premiere UXP.
  async function loadStillPreviewFallback(rootNode, reason) {
    if (state.preview || !state.source) {
      render(rootNode);
      return;
    }
    addLog("Premiere still-image fallback requested: " + reason + ".");
    try {
      state.preview = await root.PMT_PREMIERE.exportPreviewFrame();
      addLog("In-point image fallback loaded: " + state.preview.fileName + " · " + state.preview.width + " × " + state.preview.height + ".");
    } catch (fallbackError) {
      addLog("In-point image fallback failed: " + (fallbackError && fallbackError.message ? fallbackError.message : String(fallbackError)));
    }
    render(rootNode);
  }

  // Wait briefly between progress polls so UXP keeps repainting while OpenCV decodes in its worker thread.
  function waitForTrackingProgress() {
    return new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Refresh only the short banner while native samples arrive, avoiding a panel re-render during analysis.
  function updateAnalysisProgress(rootNode) {
    const banner = rootNode.querySelector(".pmt-banner");
    if (!banner || state.operation !== "analysis") {
      return;
    }
    const percent = state.analysisTotalFrames > 0 ? Math.min(99, Math.floor(state.liveSamples.length / state.analysisTotalFrames * 100)) : 0;
    banner.textContent = t("analysisRunning", { percent });
  }

  // Keep user cancellation distinct from a native tracking failure so the diagnostic stays actionable.
  function isTrackingCancellation(error) {
    return state.cancelRequested || /tracking cancelled/i.test(String(error && error.message ? error.message : error));
  }

  // Stop the active native point-tracking worker between decoded frames without keeping a partial trajectory.
  async function cancelAnalysis(rootNode) {
    if (state.operation !== "analysis" || state.cancelRequested) {
      return;
    }
    state.cancelRequested = true;
    addLog("Tracking cancellation requested.");
    render(rootNode);
    if (!state.analysisTaskId) {
      return;
    }
    try {
      await root.PMT_NATIVE.cancelTracking(state.analysisTaskId);
    } catch (error) {
      addLog("Tracking cancellation request failed: " + (error && error.message ? error.message : String(error)));
    }
  }

  // Drain native progress batches until the worker returns its final trajectory or a useful failure message.
  async function collectLiveTracking(rootNode, taskId) {
    while (true) {
      if (state.cancelRequested) {
        throw new Error("Tracking cancelled.");
      }
      const progress = await root.PMT_NATIVE.pollTracking(taskId, state.analysisSampleIndex);
      const newSamples = Array.prototype.slice.call(progress.samples || []);
      if (newSamples.length) {
        state.liveSamples = state.liveSamples.concat(newSamples);
        state.analysisSampleIndex = Number(progress.nextIndex || state.liveSamples.length);
        updateVideoPreview(rootNode);
        updateAnalysisProgress(rootNode);
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
      if (state.cancelRequested) {
        throw new Error("Tracking cancelled.");
      }
      const mediaRange = getTrackingMediaRange();
      // Use the inspected media rate to turn incoming samples into a lightweight, monotonic percentage.
      state.analysisTotalFrames = Math.max(1, Math.ceil((mediaRange.endSeconds - mediaRange.startSeconds) * Number(state.media && state.media.framesPerSecond || 0)) + 1);
      let samples;
      if (isSurfaceMode()) {
        // Use the cancellable worker for planar tracking as well as point tracking.
        state.analysisTaskId = await root.PMT_NATIVE.startSurfaceTracking(state.source.mediaPath, state.referenceCorners, mediaRange.startSeconds, mediaRange.endSeconds, state.searchRadius, state.surfaceFeatureCount);
        if (state.cancelRequested) {
          await root.PMT_NATIVE.cancelTracking(state.analysisTaskId);
          throw new Error("Tracking cancelled.");
        }
        samples = await collectLiveTracking(rootNode, state.analysisTaskId);
        state.analysisTaskId = "";
      } else {
        state.analysisTaskId = await root.PMT_NATIVE.startTracking(state.source.mediaPath, state.referencePoint, mediaRange.startSeconds, mediaRange.endSeconds, state.searchRadius);
        if (state.cancelRequested) {
          await root.PMT_NATIVE.cancelTracking(state.analysisTaskId);
          throw new Error("Tracking cancelled.");
        }
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
      addLog(isTrackingCancellation(error) ? "Tracking cancelled by user." : "Tracking error: " + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      state.operation = "";
      state.cancelRequested = false;
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
      if (state.cancelRequested) {
        throw new Error("Tracking cancelled.");
      }
      const mediaRange = getTrackingMediaRange();
      if (Number(correction.seconds) >= Number(mediaRange.endSeconds)) {
        throw new Error("The correction must be before the end of the tracking range.");
      }
      state.analysisTaskId = await root.PMT_NATIVE.startTracking(state.source.mediaPath, correction.point, correction.seconds, mediaRange.endSeconds, state.searchRadius);
      if (state.cancelRequested) {
        await root.PMT_NATIVE.cancelTracking(state.analysisTaskId);
        throw new Error("Tracking cancelled.");
      }
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
      addLog(isTrackingCancellation(error) ? "Correction tracking cancelled by user." : "Correction error: " + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      state.operation = "";
      state.cancelRequested = false;
      refreshAfterHostWork(rootNode, false);
    }
  }

  // Convert native samples into Position or Corner Pin keyframes using their original tracking timing.
  async function applyTracking(rootNode) {
    state.busy = true;
    render(rootNode);
    try {
      const surfaceMode = isSurfaceMode();
      const destinationStatus = await root.PMT_PREMIERE.getDestinationSelectionStatus();
      if (!destinationStatus.sameSequence || !destinationStatus.targetCount) {
        addLog(t("selectDestination"));
        return;
      }
      // Anchor point trajectories to their first actual sample; surface trajectories retain their exact four-corner shape.
      // Apply the exact reviewed point trajectory; users can now rely on their visible corrections directly.
      const trajectoryForApply = state.tracking;
      const keyframes = surfaceMode ? root.PMT_TRAJECTORY.buildSurfaceKeyframes(trajectoryForApply) : root.PMT_TRAJECTORY.buildPositionKeyframes(trajectoryForApply);
      const results = surfaceMode ? await root.PMT_PREMIERE.applySurfaceTracking(keyframes) : await root.PMT_PREMIERE.applyTracking(keyframes);
      addLog((surfaceMode ? "Surface perspective" : "Trajectory") + " applied to " + results.length + " selected clip(s). " + keyframes.length + " keyframes per clip.");
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
    bindButton(rootNode, "pmt-choose-source-media", () => chooseSourceMedia(rootNode));
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
    bindButton(rootNode, "pmt-cancel-analysis", () => cancelAnalysis(rootNode));
    bindButton(rootNode, "pmt-play-preview", () => toggleTrackingPreview(rootNode));
    bindButton(rootNode, "pmt-skip-preview", () => skipTrackingPreview(rootNode));
    bindButton(rootNode, "pmt-toggle-preview-generation", () => togglePreviewGeneration(rootNode));
    bindButton(rootNode, "pmt-generate-long-preview", () => generateDeferredPreview(rootNode));
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
      const updateSearchRadius = (event, shouldRender) => {
        state.searchRadius = Math.min(40, Math.max(5, Math.round(Number(event.target.value) || 10)));
        const label = rootNode.querySelector("#pmt-search-radius-label");
        if (label) label.textContent = t("searchArea", { value: state.searchRadius });
        updateSearchAreaSize(rootNode);
        if (shouldRender) render(rootNode);
      };
      searchRadiusSlider.addEventListener("input", (event) => updateSearchRadius(event, false));
      searchRadiusSlider.addEventListener("change", (event) => updateSearchRadius(event, true));
    }
    const surfaceFeatureCountSlider = rootNode.querySelector("#pmt-surface-feature-count");
    if (surfaceFeatureCountSlider && !state.busy) {
      // Let Surface mode retain more texture points on long or detailed 4K shots.
      const updateSurfaceFeatureCount = (event, shouldRender) => {
        state.surfaceFeatureCount = Math.min(400, Math.max(80, Math.round((Number(event.target.value) || 240) / 20) * 20));
        const label = rootNode.querySelector("#pmt-surface-feature-count-label");
        if (label) label.textContent = t("surfaceDetail", { value: state.surfaceFeatureCount });
        if (shouldRender) render(rootNode);
      };
      surfaceFeatureCountSlider.addEventListener("input", (event) => updateSurfaceFeatureCount(event, false));
      surfaceFeatureCountSlider.addEventListener("change", (event) => updateSurfaceFeatureCount(event, true));
    }
    const confidenceSlider = rootNode.querySelector("#pmt-confidence-threshold");
    if (confidenceSlider && !state.busy) {
      // Recompute only the review classification; native tracking samples remain unchanged.
      const updateConfidenceThreshold = (event, shouldRender) => {
        state.confidenceThreshold = Math.min(1, Math.max(0.1, Number(event.target.value) || 0.65));
        const label = rootNode.querySelector("#pmt-confidence-threshold-label");
        if (label) label.textContent = t("confidenceThreshold", { value: Math.round(state.confidenceThreshold * 100) });
        if (shouldRender) render(rootNode);
      };
      confidenceSlider.addEventListener("input", (event) => updateConfidenceThreshold(event, false));
      confidenceSlider.addEventListener("change", (event) => updateConfidenceThreshold(event, true));
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
    } else if (preview && hasInitialPreview() && !state.busy) {
      preview.addEventListener("click", (event) => {
        // The direct source video and still fallback use the same normalized reference-point coordinates.
        if (!event.target || event.target.className === "pmt-preview-image" || event.target.id === "pmt-preview-video") {
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
