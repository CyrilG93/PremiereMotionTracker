(function (root) {
  "use strict";

  const state = {
    source: null,
    media: null,
    range: null,
    preview: null,
    referencePoint: null,
    tracking: null,
    trackingPreview: null,
    previewFrameIndex: 0,
    previewPlaying: false,
    previewBuildCount: 0,
    previewBuildTotal: 0,
    busy: false,
    operation: "",
    log: ["Prototype prêt. Capturez d’abord le clip source."]
  };
  let previewPlaybackTimer = null;

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

  // Stop playback and discard obsolete preview frames after a new source, range, or reference point.
  function clearTrackingPreview() {
    if (previewPlaybackTimer) {
      clearTimeout(previewPlaybackTimer);
      previewPlaybackTimer = null;
    }
    state.trackingPreview = null;
    state.previewFrameIndex = 0;
    state.previewPlaying = false;
    state.previewBuildCount = 0;
    state.previewBuildTotal = 0;
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
      return "Métadonnées vidéo non lues";
    }
    const frameRate = Number(media.framesPerSecond || 0);
    const frameCount = Number(media.frameCount || 0);
    const size = Number(media.width || 0) + " × " + Number(media.height || 0);
    const frameRateLabel = frameRate > 0 ? frameRate.toFixed(3).replace(/\.0+$/, "") + " i/s" : "cadence inconnue";
    const frameCountLabel = frameCount > 0 ? frameCount + " images" : "nombre d’images inconnu";
    return size + " · " + frameRateLabel + " · " + frameCountLabel + " · " + String(media.backend || "backend inconnu");
  }

  // Intersect the visible sequence range with the source clip and convert it into source-media seconds.
  function getTrackingMediaRange() {
    if (!state.source || !state.range || !state.referencePoint) {
      throw new Error("Capturez et préparez une source, puis placez le point de tracking.");
    }
    if (state.source.reversed) {
      throw new Error("Le tracking de clip inversé n’est pas encore pris en charge.");
    }
    const speed = Number(state.source.speed);
    const normalizedSpeed = speed === 100 ? 1 : speed;
    if (!Number.isFinite(normalizedSpeed) || normalizedSpeed <= 0) {
      throw new Error("La vitesse du clip source est invalide.");
    }
    const sequenceStart = Math.max(Number(state.range.inPoint.seconds), Number(state.source.start.seconds));
    const sequenceEnd = Math.min(Number(state.range.outPoint.seconds), Number(state.source.end.seconds));
    if (!Number.isFinite(sequenceStart) || !Number.isFinite(sequenceEnd) || sequenceEnd <= sequenceStart) {
      throw new Error("Les In/Out de la séquence ne recouvrent pas le clip source.");
    }
    return {
      startSeconds: Number(state.source.inPoint.seconds) + (sequenceStart - Number(state.source.start.seconds)) * normalizedSpeed,
      endSeconds: Number(state.source.inPoint.seconds) + (sequenceEnd - Number(state.source.start.seconds)) * normalizedSpeed
    };
  }

  // Render a skin-free accessible control because Premiere adds an inner box to native buttons.
  function buttonMarkup(id, label, classNames, disabled) {
    const classes = ["pmt-button"].concat(classNames || []).join(" ");
    return '<div class="' + classes + '" id="' + id + '" role="button" aria-disabled="' + String(Boolean(disabled)) + '" data-disabled="' + String(Boolean(disabled)) + '" tabindex="' + (disabled ? "-1" : "0") + '">' + escapeHtml(label) + '</div>';
  }

  // Compute the main readiness message from Premiere and native addon state.
  function getBanner() {
    const nativeStatus = root.PMT_NATIVE.probe();
    if (state.operation === "analysis") {
      // Keep the in-progress feedback limited to the existing stable UXP banner.
      return { tone: "warning", text: "Analyse OpenCV en cours… Ne fermez pas le panneau." };
    }
    if (state.operation === "preview") {
      return { tone: "warning", text: "Préparation de l’aperçu vidéo : " + state.previewBuildCount + " / " + state.previewBuildTotal + " images." };
    }
    if (!state.source) {
      return { tone: "warning", text: "Sélectionnez puis capturez le clip à analyser." };
    }
    if (state.preview) {
      if (state.tracking) {
        return { tone: "success", text: state.tracking.length + " images analysées. Vérifiez les images incertaines avant l’application." };
      }
      return { tone: "success", text: "Image du point In chargée. Cliquez dans l’image pour placer le point de tracking." };
    }
    if (!nativeStatus.available) {
      return { tone: "warning", text: "Sélection validée. Le moteur OpenCV constitue le prochain jalon." };
    }
    return { tone: "success", text: "Prêt à analyser la plage In/Out." };
  }

  // Render the complete prototype panel after each state change.
  function render(rootNode) {
    const banner = getBanner();
    const nativeStatus = root.PMT_NATIVE.probe();
    const nativeLabel = nativeStatus.available
      ? nativeStatus.version + " · autotest " + nativeStatus.selfTest
      : (nativeStatus.loading ? "chargement…" : "indisponible");
    const canPrepare = Boolean(state.source && !state.busy);
    const canAnalyze = Boolean(canPrepare && state.media && state.range && state.preview && state.referencePoint);
    const canApplyTracking = Boolean(canPrepare && state.tracking && state.tracking.length >= 2 && state.range && state.range.sequenceId === state.source.sequenceId);
    const canPlayPreview = Boolean(!state.busy && state.trackingPreview && state.trackingPreview.frames.length > 1);
    const analyzeLabel = state.operation === "analysis" ? "Analyse en cours…" : "Analyser";
    const playbackLabel = state.previewPlaying ? "Pause aperçu" : "Lire l’aperçu";
    const playbackFrame = state.trackingPreview && state.trackingPreview.frames[state.previewFrameIndex];
    const previewContent = playbackFrame
      ? '<img class="pmt-preview-image" src="' + escapeHtml(playbackFrame.url) + '" alt="Aperçu animé du tracking"><div class="pmt-tracking-point" style="left:' + (Number(playbackFrame.x) * 100).toFixed(3) + '%;top:' + (Number(playbackFrame.y) * 100).toFixed(3) + '%"></div><div class="pmt-preview-status">Aperçu tracking · image ' + (state.previewFrameIndex + 1) + ' / ' + state.trackingPreview.frames.length + '</div>'
      : state.preview
      ? '<img class="pmt-preview-image" src="' + escapeHtml(state.preview.url) + '" alt="Image de la séquence au point In">' + (state.referencePoint
        ? '<div class="pmt-tracking-point" style="left:' + (state.referencePoint.x * 100).toFixed(3) + '%;top:' + (state.referencePoint.y * 100).toFixed(3) + '%"></div>'
        : "")
      : '<div class="pmt-preview-grid"></div><div class="pmt-preview-copy">L’image de la séquence au point In apparaîtra ici après préparation.</div>';
    rootNode.innerHTML = [
      '<div class="pmt-shell">',
      '  <div class="pmt-header">',
      '    <h1 class="pmt-title">Motion Tracker</h1>',
      '    <span class="pmt-version">v' + escapeHtml(root.PMT_VERSION) + '</span>',
      '  </div>',
      '  <div class="pmt-banner" data-tone="' + banner.tone + '">' + escapeHtml(banner.text) + '</div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">1. Source du tracking</h2>',
      '    <div class="pmt-slot">',
      '      <div class="pmt-slot-copy"><div class="pmt-label">Clip à analyser</div><div class="pmt-value">' + escapeHtml(clipLabel(state.source, "Aucun clip source")) + '</div></div>',
      '      ' + buttonMarkup("pmt-capture-source", "Capturer et préparer", [], state.busy),
      '    </div>',
      state.source ? '    <div class="pmt-label">Vidéo : ' + escapeHtml(mediaLabel(state.media)) + '</div>' : '',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">2. Prévisualisation</h2>',
      '    <div class="pmt-preview" id="pmt-preview" data-ready="' + String(Boolean(state.preview && !playbackFrame)) + '">' + previewContent + '</div>',
      '    <div class="pmt-actions">',
      '      ' + buttonMarkup("pmt-analyze", analyzeLabel, ["pmt-button-primary"], !canAnalyze),
      '      ' + buttonMarkup("pmt-play-preview", playbackLabel, [], !canPlayPreview),
      '    </div>',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">3. Application</h2>',
      '    <div class="pmt-label">Après le tracking, sélectionnez un ou plusieurs clips de destination. Une clé Position sera créée pour chaque image valide.</div>',
      '    ' + buttonMarkup("pmt-apply-tracking", "Appliquer la trajectoire", ["pmt-button-full"], !canApplyTracking),
      '  </div>',
      '  <div class="pmt-card">',
      '    <div class="pmt-card-header"><h2 class="pmt-card-title">Diagnostic</h2>' + buttonMarkup("pmt-copy-log", "Copier", ["pmt-button-compact"], false) + '</div>',
      '    <div class="pmt-label">Moteur natif : ' + escapeHtml(nativeLabel) + '</div>',
      '    <textarea class="pmt-log" id="pmt-log" readonly>' + escapeHtml(state.log.join("\n")) + '</textarea>',
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

  // Read the sequence range and its In image as the mandatory preparation that follows source capture.
  async function prepareSourceRange() {
    state.range = await root.PMT_PREMIERE.getActiveRange();
    state.tracking = null;
    clearTrackingPreview();
    addLog("Plage séquence : " + state.range.inPoint.seconds.toFixed(3) + " s → " + state.range.outPoint.seconds.toFixed(3) + " s");
    try {
      state.preview = await root.PMT_PREMIERE.exportPreviewFrame();
      state.referencePoint = { x: 0.5, y: 0.5 };
      addLog("Image du point In chargée : " + state.preview.fileName + " · " + state.preview.width + " × " + state.preview.height + ".");
    } catch (previewError) {
      state.preview = null;
      state.referencePoint = null;
      addLog("Erreur image : " + (previewError && previewError.message ? previewError.message : String(previewError)));
    }
    const session = root.PMT_SESSION.createSession({
      sequenceId: state.range.sequenceId,
      source: state.source,
      range: { inTicks: state.range.inPoint.ticks, outTicks: state.range.outPoint.ticks },
      referencePoint: { x: 0.5, y: 0.5 }
    });
    addLog("Session préparée : " + session.id);
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
      state.tracking = null;
      clearTrackingPreview();
      addLog("Source capturée : " + clip.name);
      if (!clip.mediaPath) {
        addLog("Attention : Premiere n’a pas renvoyé de chemin média pour cette source.");
      } else {
        const nativeStatus = await root.PMT_NATIVE.initialize();
        if (!nativeStatus.available) {
          addLog("Lecture OpenCV indisponible : " + (nativeStatus.error || "addon non chargé"));
        } else {
          state.media = await root.PMT_NATIVE.inspectMedia(clip.mediaPath);
          addLog("Média OpenCV : " + mediaLabel(state.media) + ".");
        }
      }
      // Premiere versions may report normal speed as either a 1x factor or 100 percent.
      if (![1, 100].includes(clip.speed) || clip.reversed) {
        addLog("Attention : le remappage temporel sera refusé dans la première V1.");
      }
      await prepareSourceRange();
    } catch (error) {
      addLog("Erreur : " + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      render(rootNode);
    }
  }

  // Store a normalized point from a click inside the exported preview frame.
  function chooseReferencePoint(rootNode, event) {
    const preview = rootNode.querySelector("#pmt-preview");
    if (!preview || !state.preview || typeof preview.getBoundingClientRect !== "function") {
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
    clearTrackingPreview();
    addLog("Point de tracking : " + (state.referencePoint.x * 100).toFixed(1) + " %, " + (state.referencePoint.y * 100).toFixed(1) + " %.");
    render(rootNode);
  }

  // Export a bounded sequence-image review for the tracked samples before any target clip is modified.
  async function buildTrackingPreview(rootNode) {
    const previewSamples = root.PMT_TRAJECTORY.selectPreviewSamples(state.tracking, 180);
    const frames = [];
    state.operation = "preview";
    state.previewBuildCount = 0;
    state.previewBuildTotal = previewSamples.length;
    render(rootNode);
    for (let index = 0; index < previewSamples.length; index += 1) {
      const sample = previewSamples[index];
      const exported = await root.PMT_PREMIERE.exportTrackingPreviewFrame(Number(sample.seconds), index);
      frames.push({
        url: exported.url,
        x: Number(sample.x),
        y: Number(sample.y),
        valid: Boolean(sample.valid),
        seconds: Number(sample.seconds)
      });
      state.previewBuildCount = index + 1;
      // Refresh periodically so a long sequence export never resembles a frozen panel.
      if (state.previewBuildCount === state.previewBuildTotal || state.previewBuildCount % 12 === 0) {
        render(rootNode);
      }
    }
    state.trackingPreview = { frames, sourceFrameCount: state.tracking.length };
    state.previewFrameIndex = 0;
    state.previewPlaying = false;
    addLog("Aperçu vidéo prêt : " + frames.length + " image(s) exportée(s) pour vérifier le tracking.");
  }

  // Schedule the next exported frame with a conservative UXP-friendly playback cadence.
  function schedulePreviewFrame(rootNode) {
    const frameRate = Math.min(24, Math.max(6, Number(state.media && state.media.framesPerSecond) || 12));
    previewPlaybackTimer = setTimeout(() => {
      if (!state.previewPlaying || !state.trackingPreview || !state.trackingPreview.frames.length) {
        previewPlaybackTimer = null;
        return;
      }
      state.previewFrameIndex = (state.previewFrameIndex + 1) % state.trackingPreview.frames.length;
      render(rootNode);
      schedulePreviewFrame(rootNode);
    }, Math.round(1000 / frameRate));
  }

  // Toggle the image-sequence playback without changing the tracking data or Premiere project.
  function toggleTrackingPreview(rootNode) {
    if (!state.trackingPreview || state.trackingPreview.frames.length < 2) {
      return;
    }
    state.previewPlaying = !state.previewPlaying;
    if (!state.previewPlaying && previewPlaybackTimer) {
      clearTimeout(previewPlaybackTimer);
      previewPlaybackTimer = null;
    }
    render(rootNode);
    if (state.previewPlaying) {
      schedulePreviewFrame(rootNode);
    }
  }

  // Run the native Lucas-Kanade tracker for the source-media interval visible in the active sequence range.
  async function analyzeTracking(rootNode) {
    state.busy = true;
    state.operation = "analysis";
    clearTrackingPreview();
    addLog("Analyse OpenCV en cours…");
    render(rootNode);
    try {
      await waitForPanelPaint();
      const mediaRange = getTrackingMediaRange();
      const samples = await root.PMT_NATIVE.trackMedia(state.source.mediaPath, state.referencePoint, mediaRange.startSeconds, mediaRange.endSeconds);
      state.tracking = Array.prototype.slice.call(samples || []);
      const invalidCount = state.tracking.filter((sample) => !sample.valid).length;
      addLog("Tracking OpenCV : " + state.tracking.length + " images de " + mediaRange.startSeconds.toFixed(3) + " s à " + mediaRange.endSeconds.toFixed(3) + " s.");
      addLog("Images incertaines : " + invalidCount + ".");
      try {
        await buildTrackingPreview(rootNode);
      } catch (previewError) {
        clearTrackingPreview();
        addLog("Aperçu vidéo indisponible : " + (previewError && previewError.message ? previewError.message : String(previewError)));
      }
    } catch (error) {
      state.tracking = null;
      addLog("Erreur tracking : " + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      state.operation = "";
      render(rootNode);
    }
  }

  // Convert native frame samples into offsets, then apply every valid sample to selected destinations.
  async function applyTracking(rootNode) {
    state.busy = true;
    render(rootNode);
    try {
      const keyframes = root.PMT_TRAJECTORY.buildPositionKeyframes(state.tracking, state.referencePoint);
      const results = await root.PMT_PREMIERE.applyTracking(keyframes);
      addLog("Trajectoire appliquée à " + results.length + " clip(s) sélectionné(s). " + keyframes.length + " images clés par clip.");
      results.forEach((result) => {
        const scale = result.positionScale || { x: 1, y: 1 };
        const coordinateSpace = result.targetCoordinateSpace === "sequence" ? "Graphics Layer" : "média";
        addLog(result.clipName + " : " + result.keyframeCount + " clés · " + coordinateSpace + " · compensation " + Number(scale.x).toFixed(3) + " × " + Number(scale.y).toFixed(3) + " · " + result.initialPoint.x + ", " + result.initialPoint.y + " → " + result.finalPoint.x + ", " + result.finalPoint.y);
      });
    } catch (error) {
      addLog("Erreur application : " + (error && error.message ? error.message : String(error)));
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
      throw new Error("API presse-papiers indisponible");
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
    throw lastError || new Error("Aucune méthode de copie compatible");
  }

  // Select the diagnostic so Ctrl+C remains available when UXP has not reloaded manifest permissions.
  function selectDiagnostics(rootNode) {
    const logArea = rootNode.querySelector("#pmt-log");
    if (logArea) {
      logArea.focus();
      logArea.select();
    }
  }

  // Copy the complete diagnostic and leave a usable manual fallback on clipboard permission errors.
  async function copyDiagnostics(rootNode) {
    const text = state.log.join("\n");
    try {
      await writeClipboardText(text);
      addLog("Diagnostic copié dans le presse-papiers.");
    } catch (error) {
      addLog("Copie impossible : " + (error && error.message ? error.message : String(error)));
      addLog("Diagnostic sélectionné : appuyez sur Ctrl+C. Si nécessaire, retirez puis ajoutez à nouveau le plugin dans UXP Developer Tool.");
    }
    render(rootNode);
    if (state.log[state.log.length - 1].indexOf("Diagnostic sélectionné") === 0) {
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
    bindButton(rootNode, "pmt-capture-source", () => captureAndPrepare(rootNode));
    bindButton(rootNode, "pmt-analyze", () => analyzeTracking(rootNode));
    bindButton(rootNode, "pmt-play-preview", () => toggleTrackingPreview(rootNode));
    bindButton(rootNode, "pmt-apply-tracking", () => applyTracking(rootNode));
    bindButton(rootNode, "pmt-copy-log", () => copyDiagnostics(rootNode));
    const preview = rootNode.querySelector("#pmt-preview");
    if (preview && state.preview && !state.trackingPreview) {
      preview.addEventListener("click", (event) => chooseReferencePoint(rootNode, event));
    }
  }

  // Mount the panel once and let later actions update the same root node.
  function mount(rootNode) {
    const nativeInitialization = root.PMT_NATIVE.initialize();
    render(rootNode);
    nativeInitialization.then((nativeStatus) => {
      if (nativeStatus.available) {
        addLog("Moteur natif chargé : " + nativeStatus.version + " · autotest " + nativeStatus.selfTest + ".");
        addLog("Exports natifs : " + nativeStatus.exportNames.join(", ") + ".");
      } else {
        addLog("Moteur natif indisponible : " + (nativeStatus.error || "raison inconnue") + ".");
      }
      render(rootNode);
    });
  }

  root.PMT_UI = { mount };
}(window));
