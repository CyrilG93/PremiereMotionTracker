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

  // Read a scalar or two-axis percentage returned by Premiere's Motion Scale parameter.
  function readScaleValue(value) {
    let current = value;
    let depth = 0;
    while (current && typeof current === "object" && depth < 4) {
      let nestedValue;
      try {
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
    const scalar = Number(current);
    return Number.isFinite(scalar) ? { x: scalar, y: scalar } : null;
  }

  // Create a clip-relative TickTime for every native frame instead of retaining only both endpoints.
  function createTimeAtProgress(app, inPoint, outPoint, progress) {
    const safeProgress = Math.min(1, Math.max(0, Number(progress) || 0));
    const startSeconds = Number(describeTime(inPoint).seconds);
    const endSeconds = Number(describeTime(outPoint).seconds);
    if (app && app.TickTime && typeof app.TickTime.createWithSeconds === "function" && Number.isFinite(startSeconds) && Number.isFinite(endSeconds)) {
      return app.TickTime.createWithSeconds(startSeconds + (endSeconds - startSeconds) * safeProgress);
    }
    if (safeProgress === 0) {
      return inPoint;
    }
    if (safeProgress === 1) {
      return outPoint;
    }
    throw new Error("Premiere n’expose pas TickTime.createWithSeconds(), nécessaire pour écrire chaque image clé.");
  }

  // Convert normalized tracker motion into the Position unit used by the inserted Transform effect.
  function getPositionScale(context, normalized, targetFrame, motionScale) {
    if (normalized) {
      if (!root.PMT_TRAJECTORY || typeof root.PMT_TRAJECTORY.computeTargetPositionScale !== "function") {
        throw new Error("Le convertisseur de coordonnées de trajectoire est indisponible.");
      }
      return root.PMT_TRAJECTORY.computeTargetPositionScale(context.frameSize, targetFrame, motionScale);
    }
    const width = Number(context.frameSize && context.frameSize.width);
    const height = Number(context.frameSize && context.frameSize.height);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error("Premiere n’a pas renvoyé la taille de séquence nécessaire aux clés Position.");
    }
    return { x: width, y: height };
  }

  // Read a file target's dimensions, or use the sequence canvas for Graphics Layers without a media path.
  async function getTargetMediaFrame(context, item) {
    let mediaPath = "";
    try {
      const projectItem = await item.getProjectItem();
      const clipProjectItem = context.app && context.app.ClipProjectItem && typeof context.app.ClipProjectItem.cast === "function"
        ? context.app.ClipProjectItem.cast(projectItem)
        : projectItem;
      mediaPath = await readMethod(clipProjectItem, "getMediaFilePath", "");
    } catch (error) {
      // Graphics Layers can expose a project item but no readable media proxy.
    }
    if (!mediaPath) {
      const width = Number(context.frameSize && context.frameSize.width);
      const height = Number(context.frameSize && context.frameSize.height);
      if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        throw new Error("La Graphics Layer ne fournit pas de média et la taille de séquence est indisponible.");
      }
      return { width, height, coordinateSpace: "sequence" };
    }
    if (!root.PMT_NATIVE || typeof root.PMT_NATIVE.inspectMedia !== "function") {
      throw new Error("Le moteur OpenCV est requis pour mesurer le média cible.");
    }
    const inspection = await root.PMT_NATIVE.inspectMedia(mediaPath);
    const width = Number(inspection && inspection.width);
    const height = Number(inspection && inspection.height);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error("Le média cible ne fournit pas de dimensions exploitables.");
    }
    return { width, height, coordinateSpace: "media" };
  }

  // Read the intrinsic Motion Scale so a manually resized target keeps the correct sequence amplitude.
  async function getTargetMotionScale(item, time) {
    const chain = await item.getComponentChain();
    const componentCount = chain && typeof chain.getComponentCount === "function" ? chain.getComponentCount() : 0;
    for (let componentIndex = 0; componentIndex < componentCount; componentIndex += 1) {
      const component = chain.getComponentAtIndex(componentIndex);
      const matchName = component && typeof component.getMatchName === "function" ? await component.getMatchName() : "";
      const displayName = component && typeof component.getDisplayName === "function" ? await component.getDisplayName() : "";
      const componentLabel = normalizeLabel(matchName) + " " + normalizeLabel(displayName);
      if (!componentLabel.includes("motion") && !componentLabel.includes("mouvement")) {
        continue;
      }
      const paramCount = component && typeof component.getParamCount === "function" ? component.getParamCount() : 0;
      for (let paramIndex = 0; paramIndex < paramCount; paramIndex += 1) {
        const param = component.getParam(paramIndex);
        const paramName = normalizeLabel(param && param.displayName);
        if (!paramName.includes("scale") && !paramName.includes("chelle")) {
          continue;
        }
        let value = null;
        if (param && typeof param.getValueAtTime === "function") {
          value = await param.getValueAtTime(time);
        }
        if (value === null && param && typeof param.getStartValue === "function") {
          value = await param.getStartValue();
        }
        const scale = readScaleValue(value);
        if (scale && scale.x > 0 && scale.y > 0) {
          return scale;
        }
      }
    }
    // Premiere's intrinsic Motion defaults to 100 percent when no readable Scale parameter is exposed.
    return { x: 100, y: 100 };
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

  // Use compact sequence renders for the image-based tracking preview so cached frames remain lightweight.
  function getTrackingPreviewDimensions(frameSize) {
    const sourceWidth = Number(frameSize && frameSize.width) || 1920;
    const sourceHeight = Number(frameSize && frameSize.height) || 1080;
    const scale = Math.min(1, 640 / sourceWidth, 360 / sourceHeight);
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

  // Wait for a native or Premiere export to flush into UXP's private temporary folder.
  async function resolveExportedFile(temporaryFolder, fileStem, extension, maxAttempts) {
    const nativeFileSystem = require("fs");
    const expectedExtension = String(extension || "").toLowerCase();
    let detectedNames = [];
    const attempts = Math.max(1, Number(maxAttempts) || 20);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const entries = await temporaryFolder.getEntries();
      const entryMatch = entries.find((entry) => entry.isFile && entry.name.toLowerCase().startsWith(fileStem.toLowerCase()) && entry.name.toLowerCase().endsWith(expectedExtension));
      if (entryMatch) {
        return { url: entryMatch.url, name: entryMatch.name, nativePath: entryMatch.nativePath };
      }
      try {
        // The path-based API sees newly flushed files earlier than Folder.getEntries on some hosts.
        const nativeNames = await nativeFileSystem.readdir(temporaryFolder.nativePath);
        detectedNames = nativeNames.map(getPathName);
        const nativeMatch = detectedNames.find((name) => name.toLowerCase().startsWith(fileStem.toLowerCase()) && name.toLowerCase().endsWith(expectedExtension));
        if (nativeMatch) {
          const folderUrl = String(temporaryFolder.url || "plugin-temp:/").replace(/\/?$/, "/");
          return { url: folderUrl + nativeMatch, name: nativeMatch, nativePath: joinNativePath(temporaryFolder.nativePath, nativeMatch) };
        }
      } catch (error) {
        // Folder.getEntries remains the fallback when path-based sandbox access is unavailable.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const detail = detectedNames.length ? " Fichiers détectés : " + detectedNames.slice(-8).join(", ") + "." : " Aucun fichier détecté.";
    throw new Error("Le fichier de prévisualisation reste introuvable après attente." + detail);
  }

  // Preserve the existing Premiere PNG export call while sharing its robust filesystem wait.
  function resolveExportedPreview(temporaryFolder, fileStem) {
    return resolveExportedFile(temporaryFolder, fileStem, ".png");
  }

  // Wait longer for a direct Premiere video render while still keeping the panel responsive.
  function resolveExportedPreviewVideo(temporaryFolder, fileStem) {
    return resolveExportedFile(temporaryFolder, fileStem, ".mp4", 1200);
  }

  // Join native file paths without assuming whether Premiere is running on macOS or Windows.
  function joinNativePath(folderPath, fileName) {
    const folder = String(folderPath || "");
    return folder + (/[\\/]$/.test(folder) ? "" : "/") + String(fileName || "");
  }

  // Convert a native path to UXP's documented file:/ URL form for HTML media elements.
  function createUxpFileUrl(nativePath) {
    const normalizedPath = String(nativePath || "").replace(/\\/g, "/");
    if (!normalizedPath) {
      throw new Error("Le proxy vidéo ne fournit pas de chemin local.");
    }
    return normalizedPath.startsWith("/") ? "file:" + encodeURI(normalizedPath) : "file:/" + encodeURI(normalizedPath);
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

  // Resolve Corner Pin from Premiere's live effect catalog instead of relying on a locale-specific display name.
  async function createCornerPinComponent(app) {
    const candidates = ["AE.ADBE Corner Pin", "AE.ADBE Corner Pin2"];
    try {
      const matchNames = await app.VideoFilterFactory.getMatchNames();
      const displayNames = await app.VideoFilterFactory.getDisplayNames();
      const catalogIndex = (matchNames || []).findIndex((name, index) => {
        const label = normalizeLabel(name) + normalizeLabel(displayNames && displayNames[index]);
        return label.includes("cornerpin") || label.includes("epingledecoin");
      });
      if (catalogIndex >= 0 && matchNames[catalogIndex]) {
        candidates.unshift(matchNames[catalogIndex]);
      }
    } catch (error) {
      // The known match-name candidates below still allow hosts without a readable effect catalog.
    }
    let lastError = null;
    for (const matchName of candidates.filter((value, index, list) => list.indexOf(value) === index)) {
      try {
        return { component: await app.VideoFilterFactory.createComponent(matchName), matchName };
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error("Impossible de créer l’effet Corner Pin : " + (lastError && lastError.message ? lastError.message : "effet introuvable"));
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
    const rawFrameSize = await readMethod(sequence, "getFrameSize", null);
    const frameSize = rawFrameSize ? { width: Number(rawFrameSize.width), height: Number(rawFrameSize.height) } : null;
    return { app, project, sequence, item: videoItems[0], videoItems, selectedCount: videoItems.length, frameSize };
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

  // Convert a tracked source-media time into its matching sequence time for a rendered review image.
  function getSequenceSecondsForMediaSample(mediaSeconds) {
    if (!handles.source || !handles.source.descriptor) {
      throw new Error("Capturez d’abord le clip source.");
    }
    const descriptor = handles.source.descriptor;
    const speed = Number(descriptor.speed) === 100 ? 1 : Number(descriptor.speed);
    if (descriptor.reversed || !Number.isFinite(speed) || speed <= 0) {
      throw new Error("L’aperçu animé ne prend pas encore en charge le remappage temporel de cette source.");
    }
    return Number(descriptor.start.seconds) + (Number(mediaSeconds) - Number(descriptor.inPoint.seconds)) / speed;
  }

  // Export one PNG at a tracked sample so the panel can replay Premiere-rendered images without HTML video.
  async function exportTrackingPreviewFrame(mediaSeconds, frameIndex) {
    if (!handles.source || !handles.source.sequence) {
      throw new Error("Capturez d’abord le clip source.");
    }
    const app = handles.source.app;
    if (!app || !app.Exporter || typeof app.Exporter.exportSequenceFrame !== "function" || !app.TickTime || typeof app.TickTime.createWithSeconds !== "function") {
      throw new Error("Cette version de Premiere n’expose pas l’export d’image requis pour l’aperçu animé.");
    }
    const storage = require("uxp").storage.localFileSystem;
    const temporaryFolder = await storage.getTemporaryFolder();
    const dimensions = getTrackingPreviewDimensions(await handles.source.sequence.getFrameSize());
    const fileStem = "pmt-track-preview-" + Date.now() + "-" + Number(frameIndex);
    const exported = await app.Exporter.exportSequenceFrame(
      handles.source.sequence,
      app.TickTime.createWithSeconds(getSequenceSecondsForMediaSample(mediaSeconds)),
      fileStem + ".png",
      temporaryFolder.nativePath,
      dimensions.width,
      dimensions.height
    );
    if (!exported) {
      throw new Error("Premiere a refusé l’export d’une image pour l’aperçu animé.");
    }
    const imageEntry = await resolveExportedPreview(temporaryFolder, fileStem);
    return { url: imageEntry.url, fileName: imageEntry.name, width: dimensions.width, height: dimensions.height };
  }

  // Render the active sequence range directly in Premiere, avoiding an Adobe Media Encoder queue.
  async function exportPreviewVideo() {
    if (!handles.source || !handles.source.sequence) {
      throw new Error("Capturez d’abord le clip source.");
    }
    const app = handles.source.app;
    if (!app.EncoderManager || typeof app.EncoderManager.getManager !== "function") {
      throw new Error("Cette version de Premiere n’expose pas le rendu vidéo direct.");
    }
    const exportType = app.Constants && app.Constants.ExportType ? app.Constants.ExportType.IMMEDIATELY : undefined;
    if (exportType === undefined) {
      throw new Error("Premiere n’expose pas le mode d’export immédiat requis pour la prévisualisation vidéo.");
    }
    const encoderManager = await app.EncoderManager.getManager();
    if (!encoderManager || typeof encoderManager.exportSequence !== "function") {
      throw new Error("Le gestionnaire d’export Premiere est indisponible.");
    }
    const storage = require("uxp").storage.localFileSystem;
    const temporaryFolder = await storage.getTemporaryFolder();
    const pluginFolder = await storage.getPluginFolder();
    const fileStem = "pmt-preview-video-" + Date.now();
    const fileName = fileStem + ".mp4";
    const outputPath = joinNativePath(temporaryFolder.nativePath, fileName);
    const presetPath = joinNativePath(pluginFolder.nativePath, "assets/presets/pmt-preview-h264.epr");
    // The bundled H.264 preset is required by Premiere even for an immediate in-app export.
    const accepted = await encoderManager.exportSequence(handles.source.sequence, exportType, outputPath, presetPath, false);
    if (!accepted) {
      throw new Error("Premiere a refusé le rendu vidéo direct.");
    }
    const rendered = await resolveExportedPreviewVideo(temporaryFolder, fileStem);
    return {
      url: createUxpFileUrl(rendered.nativePath),
      fileName: rendered.name,
      nativePath: rendered.nativePath
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

  // Find the four-corner effect after attachment because VideoFilterFactory components expose no params beforehand.
  async function resolveInsertedCornerPin(chain, preferredIndex, matchName) {
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
      const label = normalizeLabel(componentMatchName) + normalizeLabel(displayName);
      if ((index === preferredIndex || componentMatchName === matchName || label.includes("cornerpin") || label.includes("epingledecoin"))
        && component && typeof component.getParamCount === "function" && component.getParamCount() > 0) {
        return component;
      }
    }
    return null;
  }

  // Match Corner Pin's four point controls in English or French while retaining the exposed labels for diagnostics.
  function findCornerPinParams(component) {
    const matches = { topLeft: null, topRight: null, bottomRight: null, bottomLeft: null };
    const names = [];
    const count = component && typeof component.getParamCount === "function" ? component.getParamCount() : 0;
    const aliases = {
      topLeft: ["upperleft", "topleft", "hautgauche", "coinsuperieurgauche"],
      topRight: ["upperright", "topright", "hautdroit", "coinsuperieurdroit"],
      bottomRight: ["lowerright", "bottomright", "basdroit", "coininferieurdroit"],
      bottomLeft: ["lowerleft", "bottomleft", "basgauche", "coininferieurgauche"]
    };
    for (let index = 0; index < count; index += 1) {
      const param = component.getParam(index);
      const name = String(param && param.displayName ? param.displayName : "");
      const normalized = normalizeLabel(name);
      names.push(name || ("Param " + index));
      Object.keys(aliases).forEach((key) => {
        if (!matches[key] && aliases[key].some((alias) => normalized.includes(alias))) {
          matches[key] = param;
        }
      });
    }
    return { params: [matches.topLeft, matches.topRight, matches.bottomRight, matches.bottomLeft], names };
  }

  // Convert a normalized tracked corner to the coordinate convention exposed by this Corner Pin instance.
  function getCornerPinValue(context, corner, normalized) {
    if (normalized) {
      return { x: Number(corner.x), y: Number(corner.y) };
    }
    const width = Number(context.frameSize && context.frameSize.width);
    const height = Number(context.frameSize && context.frameSize.height);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
      throw new Error("Premiere n’a pas renvoyé la taille de séquence nécessaire à Corner Pin.");
    }
    return { x: Number(corner.x) * width, y: Number(corner.y) * height };
  }

  // Add a Transform effect and write every valid native sample to one destination clip.
  async function applyTrackingToItem(context, item, keyframes) {
    const chain = await item.getComponentChain();
    const previousCount = chain && typeof chain.getComponentCount === "function" ? chain.getComponentCount() : 0;
    const transform = await createTransformComponent(context.app);
    const canInsert = chain && typeof chain.createInsertComponentAction === "function";
    const preferredIndex = canInsert ? 0 : previousCount;
    executeActions(context.project, [() => canInsert
      ? chain.createInsertComponentAction(transform.component, preferredIndex)
      : chain.createAppendComponentAction(transform.component)], "Motion Tracker : ajouter Transform");
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
    const targetFrame = looksNormalized ? await getTargetMediaFrame(context, item) : null;
    const motionScale = looksNormalized ? await getTargetMotionScale(item, inPoint) : null;
    const positionScale = getPositionScale(context, looksNormalized, targetFrame, motionScale);
    executeActions(context.project, [() => positionParam.createSetTimeVaryingAction(true)], "Motion Tracker : activer Position");
    await waitForHostPaint();
    // Create the keyframe and its action inside Premiere's locked transaction to avoid stale proxies.
    executeActions(context.project, keyframes.map((sample) => () => {
      const value = createPoint(
        context.app,
        initialPoint.x + Number(sample.dx) * positionScale.x,
        initialPoint.y + Number(sample.dy) * positionScale.y
      );
      const keyframe = positionParam.createKeyframe(value);
      keyframe.position = createTimeAtProgress(context.app, inPoint, outPoint, sample.progress);
      return positionParam.createAddKeyframeAction(keyframe);
    }), "Motion Tracker : appliquer la trajectoire");
    const clipName = await readMethod(item, "getName", "Clip cible");
    const finalSample = keyframes[keyframes.length - 1];
    return {
      clipName: String(clipName),
      matchName: transform.matchName,
      initialPoint,
      finalPoint: {
        x: initialPoint.x + Number(finalSample.dx) * positionScale.x,
        y: initialPoint.y + Number(finalSample.dy) * positionScale.y
      },
      normalized: looksNormalized,
      positionScale,
      targetCoordinateSpace: targetFrame ? targetFrame.coordinateSpace : "pixels",
      keyframeCount: keyframes.length
    };
  }

  // Add Corner Pin and keyframe its four vertices so the selected target fills the tracked planar surface.
  async function applySurfaceTrackingToItem(context, item, keyframes) {
    const chain = await item.getComponentChain();
    const previousCount = chain && typeof chain.getComponentCount === "function" ? chain.getComponentCount() : 0;
    const cornerPin = await createCornerPinComponent(context.app);
    const canInsert = chain && typeof chain.createInsertComponentAction === "function";
    const preferredIndex = canInsert ? 0 : previousCount;
    executeActions(context.project, [() => canInsert
      ? chain.createInsertComponentAction(cornerPin.component, preferredIndex)
      : chain.createAppendComponentAction(cornerPin.component)], "Motion Tracker : ajouter Corner Pin");
    await waitForHostPaint();
    const updatedChain = await item.getComponentChain();
    const insertedComponent = await resolveInsertedCornerPin(updatedChain, preferredIndex, cornerPin.matchName);
    if (!insertedComponent) {
      throw new Error("L’effet Corner Pin a été ajouté mais son composant attaché reste introuvable.");
    }
    const parameterResult = findCornerPinParams(insertedComponent);
    if (parameterResult.params.some((param) => !param)) {
      throw new Error("Les quatre paramètres Corner Pin sont introuvables. Paramètres exposés : " + (parameterResult.names.join(", ") || "aucun"));
    }
    const params = parameterResult.params;
    const inPoint = await item.getInPoint();
    const outPoint = await item.getOutPoint();
    const initialCorners = [];
    for (const param of params) {
      let point = readPointValue(await param.getStartValue());
      if (!point && typeof param.getValueAtTime === "function") {
        point = readPointValue(await param.getValueAtTime(inPoint));
      }
      if (!point) {
        throw new Error("Premiere n’a pas renvoyé une valeur Corner Pin compatible.");
      }
      initialCorners.push(point);
    }
    const normalized = initialCorners.every((corner) => Math.abs(corner.x) <= 1.5 && Math.abs(corner.y) <= 1.5);
    executeActions(context.project, params.map((param) => () => param.createSetTimeVaryingAction(true)), "Motion Tracker : activer Corner Pin");
    await waitForHostPaint();
    const actions = [];
    keyframes.forEach((sample) => {
      sample.corners.forEach((corner, index) => {
        actions.push(() => {
          const value = getCornerPinValue(context, corner, normalized);
          const keyframe = params[index].createKeyframe(createPoint(context.app, value.x, value.y));
          keyframe.position = createTimeAtProgress(context.app, inPoint, outPoint, sample.progress);
          return params[index].createAddKeyframeAction(keyframe);
        });
      });
    });
    executeActions(context.project, actions, "Motion Tracker : appliquer Surface Corner Pin");
    const clipName = await readMethod(item, "getName", "Clip cible");
    return { clipName: String(clipName), matchName: cornerPin.matchName, keyframeCount: keyframes.length, normalized, initialCorners };
  }

  // Apply the analysed frame-by-frame trajectory to every selected destination clip.
  async function applyTracking(keyframes) {
    if (!getHandleStatus().source) {
      throw new Error("Capturez d’abord le clip source.");
    }
    if (!Array.isArray(keyframes) || keyframes.length < 2) {
      throw new Error("Analysez au moins deux images valides avant d’appliquer la trajectoire.");
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
      results.push(await applyTrackingToItem(context, item, keyframes));
    }
    return results;
  }

  // Apply the completed planar trajectory only to destination items in the captured source sequence.
  async function applySurfaceTracking(keyframes) {
    if (!getHandleStatus().source) {
      throw new Error("Capturez d’abord le clip source.");
    }
    if (!Array.isArray(keyframes) || keyframes.length < 2) {
      throw new Error("Analysez au moins deux images de surface valides avant d’appliquer Corner Pin.");
    }
    const context = await getSelectionContext();
    if (String(context.sequence.guid || context.sequence.name || "") !== handles.source.descriptor.sequenceId) {
      throw new Error("Les clips de destination doivent appartenir à la séquence du tracking.");
    }
    const targets = [];
    for (const item of context.videoItems) {
      if (await getItemIdentity(context.sequence, item) !== handles.source.descriptor.id) {
        targets.push(item);
      }
    }
    if (!targets.length) {
      throw new Error("Sélectionnez au moins un clip de destination différent du clip source.");
    }
    const results = [];
    for (const item of targets) {
      results.push(await applySurfaceTrackingToItem(context, item, keyframes));
    }
    return results;
  }

  root.PMT_PREMIERE = {
    captureSelectedClip,
    getActiveRange,
    exportPreviewFrame,
    exportTrackingPreviewFrame,
    exportPreviewVideo,
    getHandleStatus,
    applyTracking,
    applySurfaceTracking
  };
}(window));
