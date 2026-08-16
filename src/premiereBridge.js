(function (root) {
  "use strict";

  const handles = {
    source: null,
    target: null
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
    while (current && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, "value") && depth < 3) {
      current = current.value;
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
    return { app, project, sequence, item: videoItems[0], selectedCount: videoItems.length };
  }

  // Convert a selected track item into durable metadata and retain its live proxy for this panel session.
  async function captureSelectedClip(role) {
    if (role !== "source" && role !== "target") {
      throw new Error("Le rôle du clip doit être source ou cible.");
    }
    const context = await getSelectionContext();
    const item = context.item;
    const projectItem = await item.getProjectItem();
    const clipProjectItem = context.app.ClipProjectItem && typeof context.app.ClipProjectItem.cast === "function"
      ? context.app.ClipProjectItem.cast(projectItem)
      : projectItem;
    const name = await readMethod(item, "getName", projectItem && projectItem.name ? projectItem.name : "Clip vidéo");
    const mediaPath = role === "source" ? await readMethod(clipProjectItem, "getMediaFilePath", "") : "";
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
    handles[role] = { app: context.app, project: context.project, sequence: context.sequence, item, descriptor };
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
    return {
      sequenceId: String(sequence.guid || sequence.name || ""),
      inPoint: describeTime(await readMethod(sequence, "getInPoint", null)),
      outPoint: describeTime(await readMethod(sequence, "getOutPoint", null)),
      frameSize: await readMethod(sequence, "getFrameSize", null),
      timebase: String(await readMethod(sequence, "getTimebase", ""))
    };
  }

  // Expose whether both fragile Premiere proxies are still available for the current panel session.
  function getHandleStatus() {
    return {
      source: Boolean(handles.source && handles.source.item),
      target: Boolean(handles.target && handles.target.item),
      sameSequence: Boolean(handles.source && handles.target && handles.source.descriptor.sequenceId === handles.target.descriptor.sequenceId),
      sameItem: Boolean(handles.source && handles.target && handles.source.descriptor.id === handles.target.descriptor.id)
    };
  }

  // Add a separate Transform effect and two visible Position keys to validate the Premiere write path.
  async function applyTransformTest() {
    const status = getHandleStatus();
    if (!status.source || !status.target || !status.sameSequence) {
      throw new Error("Capturez deux clips vidéo de la même séquence.");
    }
    if (status.sameItem) {
      throw new Error("Le clip source et le clip cible doivent être différents.");
    }
    const target = handles.target;
    const item = target.item;
    const chain = await item.getComponentChain();
    const transform = await createTransformComponent(target.app);
    const positionResult = findPositionParam(transform.component);
    if (!positionResult.param) {
      throw new Error("Le paramètre Position de Transform est introuvable. Paramètres exposés : " + positionResult.names.join(", "));
    }
    const positionParam = positionResult.param;
    const startValue = await positionParam.getStartValue();
    const initialPoint = readPointValue(startValue);
    if (!initialPoint) {
      throw new Error("Premiere n’a pas renvoyé une valeur Position compatible.");
    }
    const looksNormalized = Math.abs(initialPoint.x) <= 1.5 && Math.abs(initialPoint.y) <= 1.5;
    const deltaX = looksNormalized ? 0.05 : 100;
    const inPoint = await item.getInPoint();
    const outPoint = await item.getOutPoint();

    executeActions(target.project, [() => {
      if (typeof chain.createInsertComponentAction === "function") {
        return chain.createInsertComponentAction(transform.component, 0);
      }
      return chain.createAppendComponentAction(transform.component);
    }], "Motion Tracker : ajouter Transform test");
    await waitForHostPaint();

    executeActions(target.project, [() => positionParam.createSetTimeVaryingAction(true)], "Motion Tracker : activer Position");
    await waitForHostPaint();

    const firstKey = positionParam.createKeyframe(createPoint(target.app, initialPoint.x, initialPoint.y));
    firstKey.position = inPoint;
    const lastPoint = createPoint(target.app, initialPoint.x + deltaX, initialPoint.y);
    const lastKey = positionParam.createKeyframe(lastPoint);
    lastKey.position = outPoint;
    executeActions(target.project, [
      () => positionParam.createAddKeyframeAction(firstKey),
      () => positionParam.createAddKeyframeAction(lastKey)
    ], "Motion Tracker : keyframes Transform test");

    return {
      matchName: transform.matchName,
      initialPoint,
      finalPoint: { x: initialPoint.x + deltaX, y: initialPoint.y },
      normalized: looksNormalized
    };
  }

  root.PMT_PREMIERE = {
    captureSelectedClip,
    getActiveRange,
    getHandleStatus,
    applyTransformTest
  };
}(window));
