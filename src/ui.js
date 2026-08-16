(function (root) {
  "use strict";

  const state = {
    source: null,
    target: null,
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

  // Add a short diagnostic line while keeping the panel log bounded.
  function addLog(message) {
    state.log.push(String(message));
    state.log = state.log.slice(-12);
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
    const handles = root.PMT_PREMIERE.getHandleStatus();
    if (!state.source || !state.target) {
      return { tone: "warning", text: "Sélectionnez puis capturez un clip source et un clip cible." };
    }
    if (!handles.sameSequence) {
      return { tone: "danger", text: "Les deux clips doivent appartenir à la même séquence." };
    }
    if (handles.sameItem) {
      return { tone: "danger", text: "Vous avez capturé le même clip deux fois. Choisissez un autre clip cible." };
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
    const handles = root.PMT_PREMIERE.getHandleStatus();
    const canPrepare = Boolean(state.source && state.target && handles.sameSequence && !handles.sameItem && !state.busy);
    const canTestTransform = Boolean(canPrepare && state.range && state.source && state.range.sequenceId === state.source.sequenceId);
    rootNode.innerHTML = [
      '<div class="pmt-shell">',
      '  <div class="pmt-header">',
      '    <h1 class="pmt-title">Motion Tracker</h1>',
      '    <span class="pmt-version">v' + escapeHtml(root.PMT_VERSION) + '</span>',
      '  </div>',
      '  <div class="pmt-banner" data-tone="' + banner.tone + '">' + escapeHtml(banner.text) + '</div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">1. Clips</h2>',
      '    <div class="pmt-slot">',
      '      <div class="pmt-slot-copy"><div class="pmt-label">Clip à analyser</div><div class="pmt-value">' + escapeHtml(clipLabel(state.source, "Aucun clip source")) + '</div></div>',
      '      <button class="pmt-button" id="pmt-capture-source"' + (state.busy ? " disabled" : "") + '>Capturer</button>',
      '    </div>',
      '    <div class="pmt-slot">',
      '      <div class="pmt-slot-copy"><div class="pmt-label">Clip qui recevra Transform</div><div class="pmt-value">' + escapeHtml(clipLabel(state.target, "Aucun clip cible")) + '</div></div>',
      '      <button class="pmt-button" id="pmt-capture-target"' + (state.busy ? " disabled" : "") + '>Capturer</button>',
      '    </div>',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">2. Prévisualisation</h2>',
      '    <div class="pmt-preview"><div class="pmt-preview-grid"></div><div class="pmt-preview-copy">L’image du clip et le point de tracking apparaîtront ici après connexion du moteur natif.</div></div>',
      '    <div class="pmt-actions">',
      '      <button class="pmt-button" id="pmt-read-range"' + (!canPrepare ? " disabled" : "") + '>Lire les In/Out</button>',
      '      <button class="pmt-button pmt-button-primary" disabled>Analyser</button>',
      '    </div>',
      '    <button class="pmt-button pmt-button-full" id="pmt-test-transform"' + (!canTestTransform ? " disabled" : "") + '>Tester Transform (+ déplacement horizontal)</button>',
      '  </div>',
      '  <div class="pmt-card">',
      '    <h2 class="pmt-card-title">Diagnostic</h2>',
      '    <div class="pmt-label">Moteur natif : ' + escapeHtml(nativeStatus.available ? nativeStatus.version : "non intégré") + '</div>',
      '    <pre class="pmt-log">' + escapeHtml(state.log.join("\n")) + '</pre>',
      '  </div>',
      '</div>'
    ].join("");
    bindEvents(rootNode);
  }

  // Capture one role from the current timeline selection and refresh the panel.
  async function capture(rootNode, role) {
    state.busy = true;
    render(rootNode);
    try {
      const clip = await root.PMT_PREMIERE.captureSelectedClip(role);
      state[role] = clip;
      // A newly captured clip invalidates the previously prepared sequence range.
      state.range = null;
      addLog((role === "source" ? "Source" : "Cible") + " capturée : " + clip.name);
      if (role === "source" && !clip.mediaPath) {
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
        target: state.target,
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
      const result = await root.PMT_PREMIERE.applyTransformTest();
      addLog("Transform test ajouté avec deux keyframes Position.");
      addLog("Position : " + result.initialPoint.x + ", " + result.initialPoint.y + " → " + result.finalPoint.x + ", " + result.finalPoint.y);
    } catch (error) {
      addLog("Erreur Transform : " + (error && error.message ? error.message : String(error)));
    } finally {
      state.busy = false;
      render(rootNode);
    }
  }

  // Connect the freshly rendered buttons to their Premiere diagnostics.
  function bindEvents(rootNode) {
    const sourceButton = rootNode.querySelector("#pmt-capture-source");
    const targetButton = rootNode.querySelector("#pmt-capture-target");
    const rangeButton = rootNode.querySelector("#pmt-read-range");
    const transformButton = rootNode.querySelector("#pmt-test-transform");
    if (sourceButton) {
      sourceButton.addEventListener("click", () => capture(rootNode, "source"));
    }
    if (targetButton) {
      targetButton.addEventListener("click", () => capture(rootNode, "target"));
    }
    if (rangeButton) {
      rangeButton.addEventListener("click", () => readRange(rootNode));
    }
    if (transformButton) {
      transformButton.addEventListener("click", () => testTransform(rootNode));
    }
  }

  // Mount the panel once and let later actions update the same root node.
  function mount(rootNode) {
    render(rootNode);
  }

  root.PMT_UI = { mount };
}(window));
