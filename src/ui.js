(function (root) {
  "use strict";

  const state = {
    source: null,
    range: null,
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

  // Compute the main readiness message from Premiere and native addon state.
  function getBanner() {
    const nativeStatus = root.PMT_NATIVE.probe();
    if (!state.source) {
      return { tone: "warning", text: "Sélectionnez puis capturez le clip à analyser." };
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
    const canPrepare = Boolean(state.source && !state.busy);
    const canTestTransform = Boolean(canPrepare && state.range && state.range.sequenceId === state.source.sequenceId);
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
      '      <button class="pmt-button" id="pmt-capture-source"' + (state.busy ? " disabled" : "") + '>Capturer</button>',
      '    </div>',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">2. Prévisualisation</h2>',
      '    <div class="pmt-preview"><div class="pmt-preview-grid"></div><div class="pmt-preview-copy">L’image du clip et le point de tracking apparaîtront ici après connexion du moteur natif.</div></div>',
      '    <div class="pmt-actions">',
      '      <button class="pmt-button" id="pmt-read-range"' + (!canPrepare ? " disabled" : "") + '>Lire les In/Out</button>',
      '      <button class="pmt-button pmt-button-primary" disabled>Analyser</button>',
      '    </div>',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">3. Application</h2>',
      '    <div class="pmt-label">Après le tracking, sélectionnez un ou plusieurs clips de destination dans la timeline.</div>',
      '    <button class="pmt-button pmt-button-full" id="pmt-test-transform"' + (!canTestTransform ? " disabled" : "") + '>Tester Transform sur la sélection</button>',
      '  </div>',
      '  <div class="pmt-card">',
      '    <div class="pmt-card-header"><h2 class="pmt-card-title">Diagnostic</h2><button class="pmt-button pmt-button-compact" id="pmt-copy-log">Copier</button></div>',
      '    <div class="pmt-label">Moteur natif : ' + escapeHtml(nativeStatus.available ? nativeStatus.version : "non intégré") + '</div>',
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

  // Copy the complete diagnostic through UXP's clipboard API with a compatibility fallback.
  async function copyDiagnostics(rootNode) {
    const text = state.log.join("\n");
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(text);
      } else if (navigator.clipboard && typeof navigator.clipboard.setContent === "function") {
        await navigator.clipboard.setContent({ "text/plain": text });
      } else {
        throw new Error("API presse-papiers indisponible");
      }
      addLog("Diagnostic copié dans le presse-papiers.");
    } catch (error) {
      addLog("Copie impossible : " + (error && error.message ? error.message : String(error)));
    }
    render(rootNode);
  }

  // Connect the freshly rendered buttons to their Premiere diagnostics.
  function bindEvents(rootNode) {
    const sourceButton = rootNode.querySelector("#pmt-capture-source");
    const rangeButton = rootNode.querySelector("#pmt-read-range");
    const transformButton = rootNode.querySelector("#pmt-test-transform");
    const copyButton = rootNode.querySelector("#pmt-copy-log");
    if (sourceButton) {
      sourceButton.addEventListener("click", () => captureSource(rootNode));
    }
    if (rangeButton) {
      rangeButton.addEventListener("click", () => readRange(rootNode));
    }
    if (transformButton) {
      transformButton.addEventListener("click", () => testTransform(rootNode));
    }
    if (copyButton) {
      copyButton.addEventListener("click", () => copyDiagnostics(rootNode));
    }
  }

  // Mount the panel once and let later actions update the same root node.
  function mount(rootNode) {
    render(rootNode);
  }

  root.PMT_UI = { mount };
}(window));
