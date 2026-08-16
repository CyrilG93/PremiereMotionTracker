(function (root) {
  "use strict";

  const handles = {
    source: null
  };

  // Load Premiere's UXP module only inside the host application.
  function getPremiere() {
    try {
      return require("premierepro");
    } catch (error) {
      return null;
    }
  }

  // Read an optional asynchronous Premiere method without crashing the whole diagnostic.
  async function readMethod(target, methodName, fallback) {
    try {
      if (target && typeof target[methodName] === "function") {
        const value = await target[methodName]();
        return value === undefined || value === null ? fallback : value;
      }
    } catch (error) {
      return fallback;
    }
    return fallback;
  }

  // Convert Premiere TickTime proxies to plain values that can be stored in a session.
  function describeTime(time) {
    if (!time) {
      return { ticks: "0", seconds: 0 };
    }
    let ticks = "0";
    let seconds = 0;
    try {
      ticks = String(time.ticks === undefined ? "0" : time.ticks);
    } catch (error) {
      ticks = "0";
    }
    try {
      seconds = Number(time.seconds || 0);
    } catch (error) {
      seconds = 0;
    }
    return { ticks, seconds };
  }

  // Execute Premiere actions under the project edit lock and create each action inside the transaction.
  function executeActions(project, actionFactories, undoName) {
    if (!project || !Array.isArray(actionFactories) || !actionFactories.length) {
      throw new Error("Aucune action Premiere à exécuter.");
    }
    const runTransaction = () => project.executeTransaction((compoundAction) => {
      actionFactories.forEach((factory) => compoundAction.addAction(factory()));
    }, undoName);
    if (typeof project.lockedAccess === "function") {
      let result = null;
      project.lockedAccess(() => {
        result = runTransaction();
      });
      return result;
    }
    return runTransaction();
  }

  // Let Premiere attach a newly added effect before its parameters are edited.
  function waitForHostPaint() {
    return new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Normalize host labels for reliable English/French parameter matching.
  function normalizeLabel(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // Read the point stored inside a Premiere Keyframe or PointF-shaped value.
  function readPointValue(value) {
    let current = value;
    let depth = 0;
    while (current && typeof current === "object" && depth < 4) {
      let nestedValue;
      try {
        // Premiere proxy properties are not always reported as own JavaScript properties.
        nestedValue = current.value;
      } catch (error) {
        break;
      }
      if (nestedValue === undefined || nestedValue === current) {
        break;
      }
      current = nestedValue;
      depth += 1;
    }
    if (Array.isArray(current) && current.length >= 2) {
      return { x: Number(current[0]), y: Number(current[1]) };
    }
    if (current && Number.isFinite(Number(current.x)) && Number.isFinite(Number(current.y))) {
      return { x: Number(current.x), y: Number(current.y) };
    }
    return null;
  }

  // Convert Premiere's RectF frame size into safe export dimensions.
  function getPreviewDimensions(frameSize) {
    const sourceWidth = Number(frameSize && frameSize.width) || 1920;
    const sourceHeight = Number(frameSize && frameSize.height) || 1080;
    const scale = Math.min(1, 960 / sourceWidth, 540 / sourceHeight);
    return {
      width: Math.max(1, Math.round(sourceWidth * scale)),
      height: Math.max(1, Math.round(sourceHeight * scale))
    };
  }

  // Extract a filename from either a native Windows path or a UXP directory entry name.
  function getPathName(value) {
    const parts = String(value || "").split(/[\\/]/);
    return parts[parts.length - 1];
  }

  // Wait for Premiere's asynchronous disk flush and tolerate its duplicated PNG extension.
  async function resolveExportedPreview(temporaryFolder, fileStem) {
    const nativeFileSystem = require("fs");
    let detectedNames = [];
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const entries = await temporaryFolder.getEntries();
      const entryMatch = entries.find((entry) => entry.isFile && entry.name.toLowerCase().startsWith(fileStem.toLowerCase()) && entry.name.toLowerCase().endsWith(".png"));
      if (entryMatch) {
        return { url: entryMatch.url, name: entryMatch.name };
      }
      try {
        // The path-based API sees newly flushed files earlier than Folder.getEntries on some hosts.
        const nativeNames = await nativeFileSystem.readdir(temporaryFolder.nativePath);
        detectedNames = nativeNames.map(getPathName);
        const nativeMatch = detectedNames.find((name) => name.toLowerCase().startsWith(fileStem.toLowerCase()) && name.toLowerCase().endsWith(".png"));
        if (nativeMatch) {
          const folderUrl = String(temporaryFolder.url || "plugin-temp:/").replace(/\/?$/, "/");
          return { url: folderUrl + nativeMatch, name: nativeMatch };
        }
      } catch (error) {
        // Folder.getEntries remains the fallback when path-based sandbox access is unavailable.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const detail = detectedNames.length ? " Fichiers détectés : " + detectedNames.slice(-8).join(", ") + "." : " Aucun fichier détecté.";
    throw new Error("L’image a été exportée mais reste introuvable après attente." + detail);
  }

  // Build an explicit PointF because UXP constructors can ignore positional arguments.
  function createPoint(app, x, y) {
    try {
      const point = new app.PointF();
      point.x = Number(x);
      point.y = Number(y);
      return point;
    } catch (error) {
      return { x: Number(x), y: Number(y) };
    }
  }

  // Find Transform's Position parameter and return useful diagnostics if Premiere localizes other labels.
  function findPositionParam(component) {
    const names = [];
    const count = component && typeof component.getParamCount === "function" ? component.getParamCount() : 0;
    for (let index = 0; index < count; index += 1) {
      const param = component.getParam(index);
      const name = String(param && param.displayName ? param.displayName : "");
      names.push(name || ("Param " + index));
      if (normalizeLabel(name).includes("position")) {
        return { param, names };
      }
    }
    return { param: null, names };
  }

  // Create Premiere's Transform effect using the runtime catalog and known match-name aliases.
  async function createTransformComponent(app) {
    const candidates = ["AE.ADBE Geometry2", "AE.ADBE Geometry", "AE.ADBE Transform"];
    try {
      const matchNames = await app.VideoFilterFactory.getMatchNames();
      const displayNames = await app.VideoFilterFactory.getDisplayNames();
      const catalogIndex = (displayNames || []).findIndex((name) => normalizeLabel(name) === "transform");
      if (catalogIndex >= 0 && matchNames[catalogIndex]) {
        candidates.unshift(matchNames[catalogIndex]);
      }
    } catch (error) {
      // Known aliases below remain available if Premiere's catalog cannot be read.
    }
    let lastError = null;
    for (const matchName of candidates.filter((value, index, list) => list.indexOf(value) === index)) {
      try {
        return { component: await app.VideoFilterFactory.createComponent(matchName), matchName };
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error("Impossible de créer l’effet Transform : " + (lastError && lastError.message ? lastError.message : "effet introuvable"));
  }

  // Return the active project, sequence, and currently selected video items.
  async function getSelectionContext() {
    const app = getPremiere();
    if (!app) {
      throw new Error("L’API Premiere n’est disponible que dans le panneau UXP chargé par Premiere Pro.");
    }
    const project = await app.Project.getActiveProject();
    const sequence = project ? await project.getActiveSequence() : null;
    if (!sequence) {
      throw new Error("Ouvrez une séquence Premiere avant de continuer.");
    }
    const selection = await sequence.getSelection();
    const selectedItems = selection ? await selection.getTrackItems() : [];
    // Video clips expose the video-transition action while audio clips can also expose a component chain.
    const videoItems = (selectedItems || []).filter((item) => item && typeof item.createAddVideoTransitionAction === "function");
    if (!videoItems.length) {
      throw new Error("Sélectionnez un clip vidéo dans la timeline.");
    }
    return { app, project, sequence, item: videoItems[0], videoItems, selectedCount: videoItems.length };
  }

  // Convert the selected source item into durable metadata and retain its live proxy for this panel session.
  async function captureSelectedClip() {
    const context = await getSelectionContext();
    const item = context.item;
    const projectItem = await item.getProjectItem();
    const clipProjectItem = context.app.ClipProjectItem && typeof context.app.ClipProjectItem.cast === "function"
      ? context.app.ClipProjectItem.cast(projectItem)
      : projectItem;
    const name = await readMethod(item, "getName", projectItem && projectItem.name ? projectItem.name : "Clip vidéo");
    const mediaPath = await readMethod(clipProjectItem, "getMediaFilePath", "");
    const start = describeTime(await readMethod(item, "getStartTime", null));
    const end = describeTime(await readMethod(item, "getEndTime", null));
    const inPoint = describeTime(await readMethod(item, "getInPoint", null));
    const outPoint = describeTime(await readMethod(item, "getOutPoint", null));
    const speed = Number(await readMethod(item, "getSpeed", 1));
    const reversed = Boolean(await readMethod(item, "isSpeedReversed", false));
    const trackIndex = Number(await readMethod(item, "getTrackIndex", -1));
    const projectItemId = projectItem && typeof projectItem.getId === "function" ? String(projectItem.getId()) : "";
    const sequenceId = String(context.sequence.guid || context.sequence.name || "");
    const descriptor = {
      id: [sequenceId, trackIndex, start.ticks, projectItemId].join(":"),
      projectItemId,
      name: String(name),
      mediaPath: String(mediaPath || ""),
      sequenceId,
      trackIndex,
      start,
      end,
      inPoint,
      outPoint,
      speed,
      reversed,
      selectedCount: context.selectedCount
    };
    handles.source = { app: context.app, project: context.project, sequence: context.sequence, item, descriptor };
    return descriptor;
  }

  // Read the active sequence range so the tracker can later intersect it with the source clip.
  async function getActiveRange() {
    const app = getPremiere();
    if (!app) {
      throw new Error("L’API Premiere n’est pas disponible.");
    }
    const project = await app.Project.getActiveProject();
    const sequence = project ? await project.getActiveSequence() : null;
    if (!sequence) {
      throw new Error("Aucune séquence active.");
    }
    const rawFrameSize = await readMethod(sequence, "getFrameSize", null);
    return {
      sequenceId: String(sequence.guid || sequence.name || ""),
      inPoint: describeTime(await readMethod(sequence, "getInPoint", null)),
      outPoint: describeTime(await readMethod(sequence, "getOutPoint", null)),
      frameSize: rawFrameSize ? { width: Number(rawFrameSize.width), height: Number(rawFrameSize.height) } : null,
      timebase: String(await readMethod(sequence, "getTimebase", ""))
    };
  }

  // Export the sequence frame at its In point into UXP's private temporary folder.
  async function exportPreviewFrame() {
    if (!handles.source || !handles.source.sequence) {
      throw new Error("Capturez d’abord le clip source.");
    }
    const app = handles.source.app;
    if (!app.Exporter || typeof app.Exporter.exportSequenceFrame !== "function") {
      throw new Error("Cette version de Premiere n’expose pas l’export d’image de séquence.");
    }
    const storage = require("uxp").storage.localFileSystem;
    const temporaryFolder = await storage.getTemporaryFolder();
    const frameTime = await handles.source.sequence.getInPoint();
    const frameSize = await handles.source.sequence.getFrameSize();
    const dimensions = getPreviewDimensions(frameSize);
    const fileStem = "pmt-preview-" + Date.now();
    const fileName = fileStem + ".png";
    const exported = await app.Exporter.exportSequenceFrame(
      handles.source.sequence,
      frameTime,
      fileName,
      temporaryFolder.nativePath,
      dimensions.width,
      dimensions.height
    );
    if (!exported) {
      throw new Error("Premiere a refusé l’export de l’image au point In.");
    }
    const imageEntry = await resolveExportedPreview(temporaryFolder, fileStem);
    return {
      url: imageEntry.url,
      fileName: imageEntry.name,
      width: dimensions.width,
      height: dimensions.height,
      time: describeTime(frameTime)
    };
  }

  // Expose whether the fragile source proxy is still available for the current panel session.
  function getHandleStatus() {
    return {
      source: Boolean(handles.source && handles.source.item)
    };
  }

  // Build the same stable timeline identity used by the captured source descriptor.
  async function getItemIdentity(sequence, item) {
    const projectItem = await item.getProjectItem();
    const trackIndex = Number(await readMethod(item, "getTrackIndex", -1));
    const start = describeTime(await readMethod(item, "getStartTime", null));
    const projectItemId = projectItem && typeof projectItem.getId === "function" ? String(projectItem.getId()) : "";
    const sequenceId = String(sequence.guid || sequence.name || "");
    return [sequenceId, trackIndex, start.ticks, projectItemId].join(":");
  }

  // Resolve the effect after insertion because factory components expose no parameters before attachment.
  async function resolveInsertedTransform(chain, preferredIndex, matchName) {
    const count = chain && typeof chain.getComponentCount === "function" ? chain.getComponentCount() : 0;
    const indexes = [];
    if (preferredIndex >= 0 && preferredIndex < count) {
      indexes.push(preferredIndex);
    }
    for (let index = 0; index < count; index += 1) {
      if (!indexes.includes(index)) {
        indexes.push(index);
      }
    }
    for (const index of indexes) {
      const component = chain.getComponentAtIndex(index);
      const componentMatchName = component && typeof component.getMatchName === "function" ? await component.getMatchName() : "";
      const displayName = component && typeof component.getDisplayName === "function" ? await component.getDisplayName() : "";
      const isPreferred = index === preferredIndex;
      const isTransform = componentMatchName === matchName || normalizeLabel(displayName) === "transform";
      if ((isPreferred || isTransform) && component && typeof component.getParamCount === "function" && component.getParamCount() > 0) {
        return component;
      }
    }
    return null;
  }

  // Add one Transform test to one destination clip and return a compact result for diagnostics.
  async function applyTransformTestToItem(context, item) {
    const chain = await item.getComponentChain();
    const previousCount = chain && typeof chain.getComponentCount === "function" ? chain.getComponentCount() : 0;
    const transform = await createTransformComponent(context.app);
    const canInsert = chain && typeof chain.createInsertComponentAction === "function";
    const preferredIndex = canInsert ? 0 : previousCount;
    executeActions(context.project, [() => canInsert
      ? chain.createInsertComponentAction(transform.component, preferredIndex)
      : chain.createAppendComponentAction(transform.component)], "Motion Tracker : ajouter Transform test");
    await waitForHostPaint();

    const updatedChain = await item.getComponentChain();
    const insertedComponent = await resolveInsertedTransform(updatedChain, preferredIndex, transform.matchName);
    if (!insertedComponent) {
      throw new Error("L’effet Transform a été ajouté mais son composant attaché reste introuvable.");
    }
    const positionResult = findPositionParam(insertedComponent);
    if (!positionResult.param) {
      throw new Error("Le paramètre Position est introuvable. Paramètres exposés : " + (positionResult.names.join(", ") || "aucun"));
    }
    const positionParam = positionResult.param;
    const inPoint = await item.getInPoint();
    const outPoint = await item.getOutPoint();
    const startValue = await positionParam.getStartValue();
    let initialPoint = readPointValue(startValue);
    if (!initialPoint && typeof positionParam.getValueAtTime === "function") {
      // getValueAtTime returns PointF directly on hosts where getStartValue wraps it differently.
      initialPoint = readPointValue(await positionParam.getValueAtTime(inPoint));
    }
    if (!initialPoint) {
      throw new Error("Premiere n’a pas renvoyé une valeur Position compatible.");
    }
    const looksNormalized = Math.abs(initialPoint.x) <= 1.5 && Math.abs(initialPoint.y) <= 1.5;
    const deltaX = looksNormalized ? 0.05 : 100;
    executeActions(context.project, [() => positionParam.createSetTimeVaryingAction(true)], "Motion Tracker : activer Position");
    await waitForHostPaint();

    const firstKey = positionParam.createKeyframe(createPoint(context.app, initialPoint.x, initialPoint.y));
    firstKey.position = inPoint;
    const lastKey = positionParam.createKeyframe(createPoint(context.app, initialPoint.x + deltaX, initialPoint.y));
    lastKey.position = outPoint;
    executeActions(context.project, [
      () => positionParam.createAddKeyframeAction(firstKey),
      () => positionParam.createAddKeyframeAction(lastKey)
    ], "Motion Tracker : keyframes Transform test");
    const clipName = await readMethod(item, "getName", "Clip cible");
    return {
      clipName: String(clipName),
      matchName: transform.matchName,
      initialPoint,
      finalPoint: { x: initialPoint.x + deltaX, y: initialPoint.y },
      normalized: looksNormalized
    };
  }

  // Apply the same test motion to every selected destination after the source session is prepared.
  async function applyTransformTest() {
    if (!getHandleStatus().source) {
      throw new Error("Capturez d’abord le clip source.");
    }
    const context = await getSelectionContext();
    if (String(context.sequence.guid || context.sequence.name || "") !== handles.source.descriptor.sequenceId) {
      throw new Error("Les clips de destination doivent appartenir à la séquence du tracking.");
    }
    const targets = [];
    for (const item of context.videoItems) {
      const identity = await getItemIdentity(context.sequence, item);
      if (identity !== handles.source.descriptor.id) {
        targets.push(item);
      }
    }
    if (!targets.length) {
      throw new Error("Sélectionnez au moins un clip de destination différent du clip source.");
    }
    const results = [];
    for (const item of targets) {
      results.push(await applyTransformTestToItem(context, item));
    }
    return results;
  }

  root.PMT_PREMIERE = {
    captureSelectedClip,
    getActiveRange,
    exportPreviewFrame,
    getHandleStatus,
    applyTransformTest
  };
}(window));
