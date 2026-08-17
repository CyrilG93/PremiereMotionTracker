(function (root) {
  "use strict";

  const state = {
    language: "en",
    source: null,
    media: null,
    range: null,
    preview: null,
    previewVideo: null,
    renderVideoPreview: false,
    referencePoint: null,
    tracking: null,
    liveSamples: [],
    analysisTaskId: "",
    analysisSampleIndex: 0,
    videoUnavailable: false,
    busy: false,
    operation: "",
    log: ["Prototype ready. Capture the source clip first."]
  };

  // Keep the visible panel wording separate from technical diagnostics and default to English.
  const translations = {
    en: {
      noClip: "No source clip",
      noMedia: "Video metadata not read",
      sourceClip: "Clip to analyze",
      capturePrepare: "Capture and prepare",
      renderVideoPreview: "Render video preview",
      renderingPreview: "Premiere is rendering the preview video…",
      video: "Video",
      selectCapture: "Select and capture the clip to analyze.",
      analysisRunning: "OpenCV analysis in progress… Do not close the panel.",
      liveProgress: "Analyzing {count} frames…",
      analysisReady: "{count} frames analyzed. Review uncertain frames before applying.",
      inImageLoaded: "In-point image loaded. Click the image to place the tracking point.",
      sourceReady: "Selection confirmed. The OpenCV engine is the next milestone.",
      readyToAnalyze: "Ready to analyze the In/Out range.",
      loading: "loading…",
      unavailable: "unavailable",
      analyze: "Analyze",
      analyzing: "Analyzing…",
      trackingPreview: "Tracking preview · frame {current} / {total}",
      videoPreviewAlt: "Source video preview",
      videoUnavailable: "Video preview unavailable. The In-point image remains available.",
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
      renderVideoPreview: "Pré-rendre la prévisualisation vidéo",
      renderingPreview: "Premiere effectue le rendu de la prévisualisation vidéo…",
      video: "Vidéo",
      selectCapture: "Sélectionnez puis capturez le clip à analyser.",
      analysisRunning: "Analyse OpenCV en cours… Ne fermez pas le panneau.",
      liveProgress: "Analyse de {count} images…",
      analysisReady: "{count} images analysées. Vérifiez les images incertaines avant l’application.",
      inImageLoaded: "Image du point In chargée. Cliquez dans l’image pour placer le point de tracking.",
      sourceReady: "Sélection validée. Le moteur OpenCV constitue le prochain jalon.",
      readyToAnalyze: "Prêt à analyser la plage In/Out.",
      loading: "chargement…",
      unavailable: "indisponible",
      analyze: "Analyser",
      analyzing: "Analyse en cours…",
      trackingPreview: "Aperçu tracking · image {current} / {total}",
      videoPreviewAlt: "Aperçu vidéo de la source",
      videoUnavailable: "Aperçu vidéo indisponible. L’image du point In reste disponible.",
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
    state.liveSamples = [];
    state.analysisTaskId = "";
    state.analysisSampleIndex = 0;
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
    if (!state.source || !state.range || !state.referencePoint) {
      throw new Error("Capture and prepare a source, then place the tracking point.");
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
    if (state.operation === "rendering") {
      return { tone: "warning", text: t("renderingPreview") };
    }
    if (!state.source) {
      return { tone: "warning", text: t("selectCapture") };
    }
    if (state.preview) {
      if (state.tracking) {
        return { tone: "success", text: t("analysisReady", { count: state.tracking.length }) };
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
    const videoPreviewUrl = state.previewVideo && !state.videoUnavailable ? state.previewVideo.url : "";
    const canPrepare = Boolean(state.source && !state.busy);
    const canAnalyze = Boolean(canPrepare && state.media && state.range && (state.preview || videoPreviewUrl) && state.referencePoint);
    const canApplyTracking = Boolean(canPrepare && state.tracking && state.tracking.length >= 2 && state.range && state.range.sequenceId === state.source.sequenceId);
    const analyzeLabel = state.operation === "analysis" ? t("analyzing") : t("analyze");
    const initialPoint = getSampleAtVideoTime(state.range && state.range.inPoint ? Number(state.range.inPoint.seconds) : 0) || state.referencePoint;
    const previewContent = videoPreviewUrl
      ? '<video class="pmt-preview-video" id="pmt-preview-video" src="' + escapeHtml(videoPreviewUrl) + '" muted controls playsinline preload="auto" aria-label="' + escapeHtml(t("videoPreviewAlt")) + '"></video><div class="pmt-tracking-point" id="pmt-preview-point" style="left:' + (Number(initialPoint && initialPoint.x || 0.5) * 100).toFixed(3) + '%;top:' + (Number(initialPoint && initialPoint.y || 0.5) * 100).toFixed(3) + '%"></div><div class="pmt-preview-status" id="pmt-preview-status">' + escapeHtml(state.operation === "analysis" ? t("liveProgress", { count: state.liveSamples.length }) : t("readyToAnalyze")) + '</div>'
      : state.preview
      ? '<img class="pmt-preview-image" src="' + escapeHtml(state.preview.url) + '" alt="' + escapeHtml(t("inImageAlt")) + '">' + (state.referencePoint
        ? '<div class="pmt-tracking-point" style="left:' + (state.referencePoint.x * 100).toFixed(3) + '%;top:' + (state.referencePoint.y * 100).toFixed(3) + '%"></div>'
        : "")
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
      '      ' + checkboxMarkup("pmt-render-video", t("renderVideoPreview"), state.renderVideoPreview, state.busy),
      '      ' + buttonMarkup("pmt-capture-source", t("capturePrepare"), [], state.busy),
      '    </div>',
      state.source ? '    <div class="pmt-label">' + escapeHtml(t("video")) + ': ' + escapeHtml(mediaLabel(state.media)) + '</div>' : '',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">' + escapeHtml(t("previewTitle")) + '</h2>',
      '    <div class="pmt-preview" id="pmt-preview" data-ready="' + String(Boolean((state.preview || videoPreviewUrl))) + '">' + previewContent + '</div>',
      '    <div class="pmt-actions">',
      '      ' + buttonMarkup("pmt-analyze", analyzeLabel, ["pmt-button-primary"], !canAnalyze),
      '    </div>',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">' + escapeHtml(t("applyTitle")) + '</h2>',
      '    <div class="pmt-label">' + escapeHtml(t("applyHelp")) + '</div>',
      '    ' + buttonMarkup("pmt-apply-tracking", t("applyTrajectory"), ["pmt-button-full"], !canApplyTracking),
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

  // Read the sequence range and its In image, then optionally ask Premiere for a temporary playable render.
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
    try {
      state.preview = await root.PMT_PREMIERE.exportPreviewFrame();
      addLog("In-point image loaded: " + state.preview.fileName + " · " + state.preview.width + " × " + state.preview.height + ".");
    } catch (previewError) {
      state.preview = null;
      addLog("Image error: " + (previewError && previewError.message ? previewError.message : String(previewError)));
    }
    if (state.renderVideoPreview) {
      state.operation = "rendering";
      render(rootNode);
      try {
        state.previewVideo = await root.PMT_PREMIERE.exportPreviewVideo();
        state.videoUnavailable = false;
        addLog("Premiere preview video rendered: " + state.previewVideo.fileName + ".");
      } catch (videoError) {
        state.previewVideo = null;
        addLog("Video render error: " + (videoError && videoError.message ? videoError.message : String(videoError)));
      } finally {
        state.operation = "";
      }
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
      state.referencePoint = null;
      state.tracking = null;
      state.liveSamples = [];
      state.analysisTaskId = "";
      state.analysisSampleIndex = 0;
      state.videoUnavailable = false;
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

  // Store a normalized point from a click inside the exported preview frame.
  function chooseReferencePoint(rootNode, event) {
    const preview = rootNode.querySelector("#pmt-preview");
    if (!preview || !state.source || !state.range || typeof preview.getBoundingClientRect !== "function") {
      return;
    }
    const bounds = preview.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return;
    }
    state.referencePoint = root.PMT_SESSION.normalizePoint({
      x: (Number(event.clientX) - bounds.left) / bounds.width,
      y: (Number(event.clientY) - bounds.top) / bounds.height
    });
    state.tracking = null;
    state.liveSamples = [];
    clearTrackingPreview();
    addLog("Tracking point: " + (state.referencePoint.x * 100).toFixed(1) + "%, " + (state.referencePoint.y * 100).toFixed(1) + "%.");
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
      status.textContent = t("trackingPreview", { current: Math.max(1, state.tracking.indexOf(sample) + 1), total: state.tracking.length });
    } else {
      status.textContent = t("readyToAnalyze");
    }
  }

  // Keep the Premiere-generated proxy inside its own duration and never output audio from the panel.
  function bindVideoPreview(rootNode) {
    const video = rootNode.querySelector("#pmt-preview-video");
    if (!video) {
      return;
    }
    video.addEventListener("loadeddata", () => {
      addLog("Preview video decoded: " + Number(video.videoWidth) + " × " + Number(video.videoHeight) + " · " + Number(video.duration).toFixed(3) + " s.");
      video.currentTime = 0;
      updateVideoPreview(rootNode);
    });
    video.addEventListener("timeupdate", () => {
      if (Number.isFinite(Number(video.duration)) && Number(video.currentTime) >= Number(video.duration)) {
        video.pause();
        video.currentTime = 0;
      }
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
      state.analysisTaskId = await root.PMT_NATIVE.startTracking(state.source.mediaPath, state.referencePoint, mediaRange.startSeconds, mediaRange.endSeconds);
      const samples = await collectLiveTracking(rootNode, state.analysisTaskId);
      state.analysisTaskId = "";
      state.tracking = samples;
      const invalidCount = state.tracking.filter((sample) => !sample.valid).length;
      addLog("OpenCV tracking: " + state.tracking.length + " frames from " + mediaRange.startSeconds.toFixed(3) + " s to " + mediaRange.endSeconds.toFixed(3) + " s.");
      addLog("Uncertain frames: " + invalidCount + ".");
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

  // Convert native frame samples into offsets, then apply every valid sample to selected destinations.
  async function applyTracking(rootNode) {
    state.busy = true;
    render(rootNode);
    try {
      const keyframes = root.PMT_TRAJECTORY.buildPositionKeyframes(state.tracking, state.referencePoint);
      const results = await root.PMT_PREMIERE.applyTracking(keyframes);
      addLog("Trajectory applied to " + results.length + " selected clip(s). " + keyframes.length + " keyframes per clip.");
      results.forEach((result) => {
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
    bindButton(rootNode, "pmt-render-video", () => {
      state.renderVideoPreview = !state.renderVideoPreview;
      render(rootNode);
    });
    bindButton(rootNode, "pmt-capture-source", () => captureAndPrepare(rootNode));
    bindButton(rootNode, "pmt-analyze", () => analyzeTracking(rootNode));
    bindButton(rootNode, "pmt-apply-tracking", () => applyTracking(rootNode));
    bindButton(rootNode, "pmt-copy-log", () => copyDiagnostics(rootNode));
    const preview = rootNode.querySelector("#pmt-preview");
    if (preview && (state.preview || rootNode.querySelector("#pmt-preview-video")) && !state.busy) {
      preview.addEventListener("click", (event) => {
        // Keep video transport controls usable; a point is chosen only by clicking the video image itself.
        if (!event.target || event.target.id === "pmt-preview-video" || event.target.className === "pmt-preview-image") {
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
