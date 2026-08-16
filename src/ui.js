(function (root) {
  "use strict";

  const state = {
    source: null,
    range: null,
    preview: null,
    referencePoint: null,
    busy: false,
    log: ["Prototype prêt. Capturez d’abord le clip source."]
  };

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

  // Format one captured clip for compact display in a docked panel.
  function clipLabel(clip, emptyLabel) {
    if (!clip) {
      return emptyLabel;
    }
    return clip.name + " · V" + (clip.trackIndex + 1);
  }

  // Render a skin-free accessible control because Premiere adds an inner box to native buttons.
  function buttonMarkup(id, label, classNames, disabled) {
    const classes = ["pmt-button"].concat(classNames || []).join(" ");
    return '<div class="' + classes + '" id="' + id + '" role="button" aria-disabled="' + String(Boolean(disabled)) + '" data-disabled="' + String(Boolean(disabled)) + '" tabindex="' + (disabled ? "-1" : "0") + '">' + escapeHtml(label) + '</div>';
  }

  // Compute the main readiness message from Premiere and native addon state.
  function getBanner() {
    const nativeStatus = root.PMT_NATIVE.probe();
    if (!state.source) {
      return { tone: "warning", text: "Sélectionnez puis capturez le clip à analyser." };
    }
    if (state.preview) {
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
    const canTestTransform = Boolean(canPrepare && state.range && state.range.sequenceId === state.source.sequenceId);
    const previewContent = state.preview
      ? '<img class="pmt-preview-image" src="' + escapeHtml(state.preview.url) + '" alt="Image de la séquence au point In">' + (state.referencePoint
        ? '<div class="pmt-tracking-point" style="left:' + (state.referencePoint.x * 100).toFixed(3) + '%;top:' + (state.referencePoint.y * 100).toFixed(3) + '%"></div>'
        : "")
      : '<div class="pmt-preview-grid"></div><div class="pmt-preview-copy">L’image de la séquence au point In apparaîtra ici après lecture de la plage.</div>';
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
      '      ' + buttonMarkup("pmt-capture-source", "Capturer", [], state.busy),
      '    </div>',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">2. Prévisualisation</h2>',
      '    <div class="pmt-preview" id="pmt-preview" data-ready="' + String(Boolean(state.preview)) + '">' + previewContent + '</div>',
      '    <div class="pmt-actions">',
      '      ' + buttonMarkup("pmt-read-range", "Lire les In/Out", [], !canPrepare),
      '      ' + buttonMarkup("pmt-analyze", "Analyser", ["pmt-button-primary"], true),
      '    </div>',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">3. Application</h2>',
      '    <div class="pmt-label">Après le tracking, sélectionnez un ou plusieurs clips de destination dans la timeline.</div>',
      '    ' + buttonMarkup("pmt-test-transform", "Tester Transform sur la sélection", ["pmt-button-full"], !canTestTransform),
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

  // Capture the source from the current timeline selection and refresh the panel.
  async function captureSource(rootNode) {
    state.busy = true;
    render(rootNode);
    try {
      const clip = await root.PMT_PREMIERE.captureSelectedClip();
      state.source = clip;
      // A newly captured clip invalidates the previously prepared sequence range.
      state.range = null;
      state.preview = null;
      state.referencePoint = null;
      addLog("Source capturée : " + clip.name);
      if (!clip.mediaPath) {
        addLog("Attention : Premiere n’a pas renvoyé de chemin média pour cette source.");
      }
      // Premiere versions may report normal speed as either a 1x factor or 100 percent.
      if (![1, 100].includes(clip.speed) || clip.reversed) {
        addLog("Attention : le remappage temporel sera refusé dans la première V1.");
      }
    } catch (error) {
      addLog("Erreur : " + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      render(rootNode);
    }
  }

  // Read and display the active sequence range without mutating the Premiere project.
  async function readRange(rootNode) {
    state.busy = true;
    render(rootNode);
    try {
      state.range = await root.PMT_PREMIERE.getActiveRange();
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
    addLog("Point de tracking : " + (state.referencePoint.x * 100).toFixed(1) + " %, " + (state.referencePoint.y * 100).toFixed(1) + " %.");
    render(rootNode);
  }

  // Validate effect creation and Position keyframes before the tracker supplies real samples.
  async function testTransform(rootNode) {
    state.busy = true;
    render(rootNode);
    try {
      const results = await root.PMT_PREMIERE.applyTransformTest();
      addLog("Transform test appliqué à " + results.length + " clip(s) sélectionné(s).");
      results.forEach((result) => {
        addLog(result.clipName + " : " + result.initialPoint.x + ", " + result.initialPoint.y + " → " + result.finalPoint.x + ", " + result.finalPoint.y);
      });
    } catch (error) {
      addLog("Erreur Transform : " + (error && error.message ? error.message : String(error)));
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
    bindButton(rootNode, "pmt-capture-source", () => captureSource(rootNode));
    bindButton(rootNode, "pmt-read-range", () => readRange(rootNode));
    bindButton(rootNode, "pmt-test-transform", () => testTransform(rootNode));
    bindButton(rootNode, "pmt-copy-log", () => copyDiagnostics(rootNode));
    const preview = rootNode.querySelector("#pmt-preview");
    if (preview && state.preview) {
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
