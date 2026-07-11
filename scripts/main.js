const MODULE_ID = "character-art-drawer";
const FLAG_AVATARS = "avatars";
const FLAG_TOKENS = "tokens";
const MODES = new Set(["avatar", "token"]);
const SUPPORTED_ACTOR_TYPES = new Set(["character", "npc"]);
const DEFAULT_SIZE = Object.freeze({ width: 260, height: 420 });
const MIN_SIZE = Object.freeze({ width: 180, height: 220 });
const MAX_VIEWPORT = Object.freeze({ width: 0.8, height: 0.85 });

const drawerBySheet = new Map();
const warnedSelectors = new Set();

Hooks.once("init", () => {
  registerSettings();
});

Hooks.on("ready", () => {
  if ( game.system?.id !== "dnd5e" ) return;
  registerSheetHooks();
});

Hooks.on("updateActor", (actor, changed, options, userId) => {
  void onUpdateActor(actor, changed, options, userId);
});

function registerSettings() {
  game.settings.register(MODULE_ID, "defaultMode", {
    name: "CAD.Settings.DefaultMode.Name",
    hint: "CAD.Settings.DefaultMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      avatar: "CAD.ModeAvatar",
      token: "CAD.ModeToken"
    },
    default: "avatar"
  });

  game.settings.register(MODULE_ID, "autoCaptureExternalChanges", {
    name: "CAD.Settings.AutoCapture.Name",
    hint: "CAD.Settings.AutoCapture.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "updateActiveSceneTokens", {
    name: "CAD.Settings.UpdateSceneTokens.Name",
    hint: "CAD.Settings.UpdateSceneTokens.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "hardDeleteByDefault", {
    name: "CAD.Settings.HardDeleteByDefault.Name",
    hint: "CAD.Settings.HardDeleteByDefault.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "uiState", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
}

function registerSheetHooks() {
  const renderHooks = [
    "renderApplicationV2",
    "renderDocumentSheetV2",
    "renderActorSheet",
    "renderActorSheetV2",
    "renderBaseActorSheet",
    "renderCharacterActorSheet",
    "renderCharacterActorSheet5e",
    "renderActorSheet5eNPC",
    "renderActorSheet5eNPC2",
    "renderNPCActorSheet",
    "renderNPCActorSheet5e"
  ];
  const closeHooks = [
    "closeApplicationV2",
    "closeDocumentSheetV2",
    "closeActorSheet",
    "closeActorSheetV2",
    "closeBaseActorSheet",
    "closeCharacterActorSheet",
    "closeCharacterActorSheet5e",
    "closeActorSheet5eNPC",
    "closeActorSheet5eNPC2",
    "closeNPCActorSheet",
    "closeNPCActorSheet5e"
  ];

  for ( const hook of renderHooks ) Hooks.on(hook, (app, element) => injectButton(app, element));
  for ( const hook of closeHooks ) Hooks.on(hook, app => closeDrawerForSheet(app));
}

function getActorFromSheet(app) {
  const actor = app?.document ?? app?.actor;
  if ( !actor ) return null;
  if ( typeof Actor !== "undefined" && !(actor instanceof Actor) ) return null;
  if ( actor.documentName && actor.documentName !== "Actor" ) return null;
  return actor;
}

function canEditActor(actor) {
  if ( !actor ) return false;
  if ( typeof actor.canUserModify === "function" ) return actor.canUserModify(game.user, "update");
  return Boolean(actor.isOwner);
}

function isSupportedActor(actor) {
  return Boolean(actor && SUPPORTED_ACTOR_TYPES.has(actor.type));
}

function normalizeElement(element) {
  if ( !element ) return null;
  if ( element instanceof HTMLElement ) return element;
  if ( Array.isArray(element) ) return normalizeElement(element[0]);
  if ( element.jquery ) return element[0] ?? null;
  if ( element[0] instanceof HTMLElement ) return element[0];
  return null;
}

function injectButton(app, element) {
  if ( game.system?.id !== "dnd5e" ) return;
  if ( app instanceof CharacterArtDrawer ) return;
  const actor = getActorFromSheet(app);
  if ( !isSupportedActor(actor) ) return;

  const html = normalizeElement(element) ?? normalizeElement(app?.element);
  if ( !html || html.querySelector("[data-character-art-drawer-button]") ) return;

  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("cad-drawer-button");
  button.dataset.characterArtDrawerButton = "true";
  button.dataset.tooltip = "CAD.OpenDrawer";
  button.title = game.i18n.localize("CAD.OpenDrawer");
  button.setAttribute("aria-label", game.i18n.localize("CAD.OpenDrawer"));
  button.innerHTML = '<i class="fa-solid fa-chevron-left" inert></i>';
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    void renderDrawerForSheet(app, actor);
  });

  const portrait = findPortraitContainer(html);
  if ( portrait ) {
    if ( getComputedStyle(portrait).position === "static" ) portrait.style.position = "relative";
    portrait.append(button);
    return;
  }

  const header = findHeaderContainer(html);
  if ( header ) {
    button.classList.add("cad-header-button");
    header.prepend(button);
    warnOnce("fallback-header", "Portrait container not found; inserted Character Art Drawer button in the sheet header.");
    return;
  }

  warnOnce("missing-container", "Could not find a safe container for the Character Art Drawer button.");
}

function findPortraitContainer(html) {
  const selectors = [
    ".sheet-body .sidebar .card .portrait",
    ".sidebar .card .portrait",
    ".portrait:has([data-edit='img'])",
    ".portrait",
    ".sheet-header img.profile",
    "img.profile",
    "[data-edit='img']"
  ];
  for ( const selector of selectors ) {
    let found = null;
    try {
      found = html.querySelector(selector);
    } catch (_err) {
      continue;
    }
    if ( !found ) continue;
    if ( found instanceof HTMLImageElement || found instanceof HTMLVideoElement ) return found.parentElement;
    return found;
  }
  return null;
}

function findHeaderContainer(html) {
  return html.querySelector(".window-header .window-controls")
    ?? html.querySelector(".window-header")
    ?? html.querySelector(".sheet-header");
}

function warnOnce(key, message) {
  if ( warnedSelectors.has(key) ) return;
  warnedSelectors.add(key);
  console.warn(`${MODULE_ID} | ${message}`);
}

function normalizePath(path) {
  return typeof path === "string" ? path.trim() : "";
}

function imageNameFromPath(path) {
  const cleaned = normalizePath(path).split(/[?#]/)[0];
  const file = cleaned.split("/").filter(Boolean).pop() ?? cleaned;
  try {
    return decodeURIComponent(file);
  } catch (_err) {
    return file;
  }
}

function flagKeyForMode(mode) {
  return mode === "token" ? FLAG_TOKENS : FLAG_AVATARS;
}

function getDefaultMode() {
  const mode = game.settings.get(MODULE_ID, "defaultMode");
  return MODES.has(mode) ? mode : "avatar";
}

function getCurrentPath(actor, mode) {
  if ( mode === "token" ) {
    return normalizePath(foundry.utils.getProperty(actor, "prototypeToken.texture.src"));
  }
  return normalizePath(actor?.img);
}

function getStoredGallery(actor, mode) {
  const raw = actor.getFlag(MODULE_ID, flagKeyForMode(mode));
  return dedupeImages(Array.isArray(raw) ? raw : []);
}

async function getGallery(actor, mode, { includeSources=true }={}) {
  const images = getStoredGallery(actor, mode);
  if ( includeSources ) {
    const paths = [getCurrentPath(actor, mode)];
    if ( mode === "token" ) paths.push(...await collectTokenImages(actor));
    for ( const path of paths ) addImageEntry(images, path);
  }
  return dedupeImages(images);
}

async function setGallery(actor, mode, images) {
  if ( !canEditActor(actor) ) return false;
  const key = flagKeyForMode(mode);
  await actor.update({ [`flags.${MODULE_ID}.${key}`]: dedupeImages(images) });
  return true;
}

async function ensureImage(actor, mode, path) {
  return ensureImages(actor, mode, [path]);
}

async function ensureImages(actor, mode, paths) {
  if ( !canEditActor(actor) ) return false;
  const images = getStoredGallery(actor, mode);
  let changed = false;
  for ( const path of paths ) changed = addImageEntry(images, path) || changed;
  if ( !changed ) return false;
  return setGallery(actor, mode, images);
}

async function ensureCurrentImages(actor) {
  if ( !canEditActor(actor) ) return;
  const avatarPath = getCurrentPath(actor, "avatar");
  const tokenPaths = [getCurrentPath(actor, "token"), ...await collectTokenImages(actor)];
  await ensureImages(actor, "avatar", [avatarPath]);
  await ensureImages(actor, "token", tokenPaths);
}

async function collectTokenImages(actor) {
  if ( typeof actor?.getTokenImages !== "function" ) return [];
  try {
    const images = await actor.getTokenImages();
    return Array.isArray(images) ? images.filter(path => normalizePath(path)) : [];
  } catch (err) {
    console.warn(`${MODULE_ID} | actor.getTokenImages() failed for ${actor?.uuid ?? actor?.id}.`, err);
    return [];
  }
}

function addImageEntry(images, path) {
  const normalized = normalizePath(path);
  if ( !normalized ) return false;
  if ( images.some(image => normalizePath(image?.path) === normalized) ) return false;
  images.push({
    id: makeId(),
    path,
    name: imageNameFromPath(path),
    addedAt: Date.now(),
    addedBy: game.user?.id ?? ""
  });
  return true;
}

function dedupeImages(images) {
  const seen = new Set();
  const deduped = [];
  for ( const image of images ) {
    const path = typeof image === "string" ? image : image?.path;
    const normalized = normalizePath(path);
    if ( !normalized || seen.has(normalized) ) continue;
    seen.add(normalized);
    deduped.push({
      id: typeof image === "object" && image?.id ? image.id : makeId(),
      path,
      name: typeof image === "object" && image?.name ? image.name : imageNameFromPath(path),
      addedAt: Number.isFinite(image?.addedAt) ? image.addedAt : Date.now(),
      addedBy: typeof image?.addedBy === "string" ? image.addedBy : (game.user?.id ?? "")
    });
  }
  return deduped;
}

function makeId() {
  if ( foundry.utils.randomID ) return foundry.utils.randomID();
  if ( globalThis.crypto?.randomUUID ) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function setActiveImage(actor, mode, path) {
  if ( !canEditActor(actor) ) {
    ui.notifications.warn(game.i18n.localize("CAD.NoPermission"));
    return false;
  }

  const selectedPath = normalizePath(path);
  if ( !selectedPath ) return false;

  try {
    if ( mode === "token" ) {
      await actor.update({ "prototypeToken.texture.src": path });
      await ensureImage(actor, mode, path);
      if ( game.settings.get(MODULE_ID, "updateActiveSceneTokens") ) {
        await updateActiveSceneLinkedTokens(actor, path);
      }
      ui.notifications.info(game.i18n.localize("CAD.SetTokenSuccess"));
    } else {
      await actor.update({ img: path });
      await ensureImage(actor, mode, path);
      ui.notifications.info(game.i18n.localize("CAD.SetAvatarSuccess"));
    }
    return true;
  } catch (err) {
    console.error(`${MODULE_ID} | Failed to update active image.`, err);
    ui.notifications.error(err?.message ?? game.i18n.localize("CAD.ImageLoadError"));
    return false;
  }
}

async function updateActiveSceneLinkedTokens(actor, path) {
  const scene = globalThis.canvas?.scene ?? game.scenes?.active;
  const result = {
    current: 0,
    failed: 0,
    hasScene: Boolean(scene),
    matched: 0,
    updated: 0
  };
  const normalized = normalizePath(path);
  if ( !scene?.tokens || !normalized ) return result;

  for ( const token of scene.tokens ) {
    if ( !token.actorLink ) continue;
    const actorMatches = token.actor?.id === actor.id || token.actorId === actor.id;
    if ( !actorMatches ) continue;
    result.matched += 1;

    if ( normalizePath(foundry.utils.getProperty(token, "texture.src")) === normalized ) {
      result.current += 1;
      continue;
    }

    try {
      await token.update({ "texture.src": path });
      result.updated += 1;
    } catch (err) {
      result.failed += 1;
      console.warn(`${MODULE_ID} | Failed to update active scene token ${token.id}.`, err);
    }
  }

  return result;
}

async function renderDrawerForSheet(app, actor) {
  const key = sheetKey(app, actor);
  const existing = drawerBySheet.get(key);
  if ( existing?.rendered ) {
    await existing.close();
    return;
  }

  const drawer = existing ?? new CharacterArtDrawer(actor, app, key);
  drawerBySheet.set(key, drawer);
  await drawer.render(true);
  await drawer.waitForRender();
  drawer.positionNearSheet();
  drawer.bringToFront();
}

function closeDrawerForSheet(app) {
  if ( app instanceof CharacterArtDrawer ) return;
  const actor = getActorFromSheet(app);
  if ( !actor ) return;
  const key = sheetKey(app, actor);
  const drawer = drawerBySheet.get(key);
  if ( drawer ) void drawer.close();
}

function sheetKey(app, actor) {
  const appId = app?.id ?? app?.appId ?? app?._id ?? "sheet";
  return `${actor.uuid}.${appId}`;
}

function sanitizeId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getUiState() {
  const state = game.settings.get(MODULE_ID, "uiState");
  return state && typeof state === "object" && !Array.isArray(state) ? foundry.utils.deepClone(state) : {};
}

function getActorUiState(actor) {
  const state = getUiState();
  const actorState = state[actor.uuid];
  return actorState && typeof actorState === "object" && !Array.isArray(actorState) ? actorState : {};
}

async function updateActorUiState(actor, patch) {
  const state = getUiState();
  const current = state[actor.uuid] && typeof state[actor.uuid] === "object" ? state[actor.uuid] : {};
  state[actor.uuid] = { ...current, ...patch };
  await game.settings.set(MODULE_ID, "uiState", state);
}

function imageKind(path) {
  const clean = normalizePath(path).split(/[?#]/)[0].toLowerCase();
  if ( /\.(webp|png|jpe?g|gif|svg|avif)$/i.test(clean) ) return "image";
  if ( /\.(webm|mp4|m4v|ogv|mov)$/i.test(clean) ) return "video";
  return "unknown";
}

function getFilePickerImplementation() {
  const applicationV2Picker = foundry.applications?.apps?.FilePicker?.implementation;
  if ( applicationV2Picker ) return applicationV2Picker;
  if ( globalThis.FilePicker ) return globalThis.FilePicker;
  try {
    if ( typeof FilePicker === "function" ) return FilePicker;
  } catch (_err) {
    // Foundry v12 exposes FilePicker as a global lexical binding, not always as globalThis.FilePicker.
  }
  return null;
}

function isExternalUrl(path) {
  if ( typeof URL.parseSafe === "function" ) return Boolean(URL.parseSafe(path));
  try {
    const url = new URL(path);
    return ["http:", "https:", "s3:"].includes(url.protocol);
  } catch (_err) {
    return false;
  }
}

function isPathActive(actor, path) {
  const normalized = normalizePath(path);
  return ["avatar", "token"].some(mode => normalizePath(getCurrentPath(actor, mode)) === normalized);
}

function getHardDeleteUnavailableReason() {
  if ( !game.user?.isGM ) return game.i18n.localize("CAD.HardDeleteGMOnly");
  const FilePicker = getFilePickerImplementation();
  const hasDeleteApi = ["delete", "deleteFile", "remove"].some(method => typeof FilePicker?.[method] === "function");
  return hasDeleteApi ? "" : game.i18n.localize("CAD.HardDeleteUnsupported");
}

async function deletePhysicalFile(path) {
  const target = normalizePath(path);
  const reason = getHardDeleteUnavailableReason();
  if ( reason ) throw new Error(reason);
  if ( isExternalUrl(target) ) throw new Error(game.i18n.localize("CAD.HardDeleteRemoteUnsupported"));
  if ( target.startsWith("/") || target.includes("..") ) throw new Error(game.i18n.localize("CAD.HardDeleteUnsafePath"));

  const FilePicker = getFilePickerImplementation();
  if ( typeof FilePicker.delete === "function" ) return FilePicker.delete("data", target, { notify: true });
  if ( typeof FilePicker.deleteFile === "function" ) return FilePicker.deleteFile("data", target, { notify: true });
  if ( typeof FilePicker.remove === "function" ) return FilePicker.remove("data", target, { notify: true });
  throw new Error(game.i18n.localize("CAD.HardDeleteUnsupported"));
}

async function removeGalleryPath(actor, mode, path, { allModes=false }={}) {
  const modes = allModes ? ["avatar", "token"] : [mode];
  let changed = false;
  for ( const currentMode of modes ) {
    const images = getStoredGallery(actor, currentMode)
      .filter(image => normalizePath(image.path) !== normalizePath(path));
    changed = await setGallery(actor, currentMode, images) || changed;
  }
  return changed;
}

async function onUpdateActor(actor, changed, _options, userId) {
  if ( game.system?.id !== "dnd5e" ) return;
  if ( !isSupportedActor(actor) ) return;
  if ( !game.settings.get(MODULE_ID, "autoCaptureExternalChanges") ) return;
  if ( userId && userId !== game.user?.id ) return;
  if ( isOnlyModuleFlagsChange(changed) ) return;

  const promises = [];
  if ( Object.prototype.hasOwnProperty.call(changed ?? {}, "img") ) {
    const path = normalizePath(changed.img);
    if ( path ) promises.push(ensureImage(actor, "avatar", path));
  }

  const tokenPath = normalizePath(foundry.utils.getProperty(changed, "prototypeToken.texture.src"));
  if ( tokenPath ) promises.push(ensureImage(actor, "token", tokenPath));

  if ( promises.length ) {
    await Promise.allSettled(promises);
    rerenderDrawersForActor(actor);
  }
}

function isOnlyModuleFlagsChange(changed) {
  const flat = foundry.utils.flattenObject(changed ?? {});
  const keys = Object.keys(flat);
  return keys.length > 0 && keys.every(key => key.startsWith(`flags.${MODULE_ID}.`));
}

function rerenderDrawersForActor(actor) {
  for ( const drawer of drawerBySheet.values() ) {
    if ( drawer.actor.uuid === actor.uuid && drawer.rendered ) void drawer.render(false);
  }
}

class CharacterArtDrawer extends Application {
  constructor(actor, sheet, key) {
    const state = getActorUiState(actor);
    const width = Number.isFinite(state.width) ? state.width : DEFAULT_SIZE.width;
    const height = Number.isFinite(state.height) ? state.height : DEFAULT_SIZE.height;
    super({
      id: `${MODULE_ID}-${sanitizeId(key)}`,
      title: `${game.i18n.localize("CAD.Title")}: ${actor.name}`,
      template: `modules/${MODULE_ID}/templates/art-drawer.hbs`,
      width,
      height,
      resizable: true,
      minimizable: false
    });
    this.actor = actor;
    this.sheet = sheet;
    this.key = key;
    this.mode = MODES.has(state.lastMode) ? state.lastMode : getDefaultMode();
    this.hardDelete = Boolean(game.settings.get(MODULE_ID, "hardDeleteByDefault"));
    this._currentRenderReady = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ["character-art-drawer"],
      template: `modules/${MODULE_ID}/templates/art-drawer.hbs`,
      width: DEFAULT_SIZE.width,
      height: DEFAULT_SIZE.height,
      resizable: true,
      minimizable: false
    });
  }

  async getData(options={}) {
    await ensureCurrentImages(this.actor);
    const context = await super.getData(options);
    const images = await this.prepareImages();
    const readOnly = !canEditActor(this.actor);
    return {
      ...context,
      actorName: this.actor.name,
      hardDelete: this.hardDelete,
      hardDeleteTitle: game.i18n.localize(this.hardDelete ? "CAD.HardDeleteOn" : "CAD.HardDeleteOff"),
      images,
      isAvatarMode: this.mode === "avatar",
      isTokenMode: this.mode === "token",
      mode: this.mode,
      readOnly
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const element = normalizeElement(html);
    if ( !element ) return;

    element.addEventListener("click", event => {
      const target = event.target.closest("[data-action]");
      if ( !target || !element.contains(target) || target.disabled ) return;
      const action = target.dataset.action;
      switch ( action ) {
        case "addImage":
          void this.onAddImage(event);
          break;
        case "refresh":
          void this.onRefresh(event);
          break;
        case "toggleHardDelete":
          void this.onToggleHardDelete(event);
          break;
        case "removeImage":
          void this.onRemoveImage(event, target);
          break;
        case "selectImage":
          void this.onSelectImage(event, target);
          break;
        case "switchMode":
          void this.onSwitchMode(event, target);
          break;
        default:
          break;
      }
    });

    this.activateLeftResizeHandle();
    this.activateMediaFallbacks();
  }

  render(force=false, options={}) {
    const rendered = super.render(force, options);
    this._currentRenderReady = this.waitForElement();
    return rendered;
  }

  async waitForRender() {
    await this._currentRenderReady;
  }

  async waitForElement() {
    for ( let i = 0; i < 30; i += 1 ) {
      if ( normalizeElement(this.element) ) return;
      await new Promise(resolve => window.requestAnimationFrame(resolve));
    }
  }

  setPosition(position={}) {
    const result = super.setPosition(position);
    const width = Number(this.position?.width ?? position?.width);
    const height = Number(this.position?.height ?? position?.height);
    if ( Number.isFinite(width) && Number.isFinite(height) ) {
      void updateActorUiState(this.actor, {
        width: Math.max(MIN_SIZE.width, Math.round(width)),
        height: Math.max(MIN_SIZE.height, Math.round(height))
      });
    }
    return result;
  }

  async close(options={}) {
    const result = await super.close(options);
    if ( drawerBySheet.get(this.key) === this ) drawerBySheet.delete(this.key);
    return result;
  }

  bringToFront() {
    if ( typeof this.bringToTop === "function" ) return this.bringToTop();
    return this;
  }

  positionNearSheet() {
    const sheetElement = normalizeElement(this.sheet?.element);
    const rect = sheetElement?.getBoundingClientRect();
    const width = Math.max(
      MIN_SIZE.width,
      Math.min(Number(this.position?.width) || DEFAULT_SIZE.width, Math.floor(window.innerWidth * MAX_VIEWPORT.width))
    );
    const height = Math.max(
      MIN_SIZE.height,
      Math.min(Number(this.position?.height) || DEFAULT_SIZE.height, Math.floor(window.innerHeight * MAX_VIEWPORT.height))
    );
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const maxTop = Math.max(8, window.innerHeight - height - 8);

    let left = rect ? rect.left - width - 8 : 120;
    if ( left < 8 && rect ) left = Math.min(maxLeft, Math.max(8, rect.left + 16));
    left = Math.min(maxLeft, Math.max(8, left));

    let top = rect ? rect.top : 120;
    top = Math.min(maxTop, Math.max(8, top));

    this.setPosition({ left, top, width, height });
  }

  async prepareImages() {
    const activePath = normalizePath(getCurrentPath(this.actor, this.mode));
    const gallery = await getGallery(this.actor, this.mode);
    return gallery.map(image => {
      const kind = imageKind(image.path);
      const active = normalizePath(image.path) === activePath;
      const activeAnywhere = isPathActive(this.actor, image.path);
      return {
        ...image,
        active,
        canRemove: !active && !(this.hardDelete && activeAnywhere),
        isImage: kind === "image",
        isVideo: kind === "video",
        removeTitle: game.i18n.localize(this.hardDelete ? "CAD.HardDeleteImage" : "CAD.RemoveImage")
      };
    });
  }

  activateMediaFallbacks() {
    const element = normalizeElement(this.element);
    if ( !element ) return;
    for ( const media of element.querySelectorAll(".cad-preview") ) {
      media.addEventListener("error", () => {
        const button = media.closest(".cad-thumbnail-button");
        const fallback = button?.querySelector(".cad-load-fallback");
        media.hidden = true;
        if ( fallback ) fallback.hidden = false;
        ui.notifications.warn(game.i18n.localize("CAD.ImageLoadError"));
      }, { once: true });

      if ( media instanceof HTMLVideoElement ) {
        media.addEventListener("mouseenter", () => media.play().catch(() => {}));
        media.addEventListener("mouseleave", () => {
          media.pause();
          media.currentTime = 0;
        });
      }
    }
  }

  activateLeftResizeHandle() {
    const element = normalizeElement(this.element);
    const handle = element?.querySelector(".window-resize-handle, .window-resizable-handle");
    if ( !handle || handle.dataset.cadLeftResizeBound ) return;
    handle.dataset.cadLeftResizeBound = "true";
    handle.addEventListener("pointerdown", event => this.onLeftResizeStart(event), { capture: true });
    handle.addEventListener("mousedown", event => this.onLeftResizeStart(event), { capture: true });
  }

  onLeftResizeStart(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if ( this._resizingFromLeft ) return;
    this._resizingFromLeft = true;
    this.bringToFront();

    const position = this.position ?? {};
    const element = normalizeElement(this.element);
    const rect = element?.getBoundingClientRect();
    if ( !rect ) {
      this._resizingFromLeft = false;
      return;
    }
    const scale = Number(position.scale) || 1;
    const width = Number(position.width) || rect.width;
    const height = Number(position.height) || rect.height;
    const left = Number(position.left) || rect.left;
    const top = Number(position.top) || rect.top;
    const start = {
      x: event.clientX,
      y: event.clientY,
      left,
      top,
      width,
      height,
      right: left + width,
      scale
    };

    const move = moveEvent => {
      moveEvent.preventDefault();
      const deltaX = (moveEvent.clientX - start.x) / start.scale;
      const deltaY = (moveEvent.clientY - start.y) / start.scale;
      const maxWidth = Math.max(MIN_SIZE.width, Math.floor(window.innerWidth * MAX_VIEWPORT.width));
      const maxHeight = Math.max(MIN_SIZE.height, Math.floor(window.innerHeight * MAX_VIEWPORT.height));
      let width = clampNumber(start.width - deltaX, MIN_SIZE.width, maxWidth);
      let left = start.right - width;

      if ( left < 8 ) {
        left = 8;
        width = Math.max(MIN_SIZE.width, start.right - left);
      }

      const height = clampNumber(start.height + deltaY, MIN_SIZE.height, maxHeight);
      this.setPosition({ left, top: start.top, width, height });
    };

    const end = endEvent => {
      endEvent.preventDefault();
      this._resizingFromLeft = false;
      window.removeEventListener(moveEventName, move);
      window.removeEventListener(upEventName, end);
      window.removeEventListener(cancelEventName, end);
    };

    const useMouseEvents = event.type === "mousedown";
    const moveEventName = useMouseEvents ? "mousemove" : "pointermove";
    const upEventName = useMouseEvents ? "mouseup" : "pointerup";
    const cancelEventName = useMouseEvents ? "mouseup" : "pointercancel";
    window.addEventListener(moveEventName, move);
    window.addEventListener(upEventName, end);
    window.addEventListener(cancelEventName, end);
  }

  async onSwitchMode(event, target) {
    event.preventDefault();
    const mode = target.dataset.mode;
    if ( !MODES.has(mode) || mode === this.mode ) return;
    this.mode = mode;
    await updateActorUiState(this.actor, { lastMode: mode });
    await this.render(false);
  }

  async onAddImage(event) {
    event.preventDefault();
    if ( !canEditActor(this.actor) ) {
      ui.notifications.warn(game.i18n.localize("CAD.NoPermission"));
      return;
    }

    const current = getCurrentPath(this.actor, this.mode);
    const FilePicker = getFilePickerImplementation();
    if ( !FilePicker ) {
      ui.notifications.error(game.i18n.localize("CAD.FilePickerUnavailable"));
      return;
    }
    new FilePicker({
      current,
      type: "image",
      callback: async path => {
        await ensureImage(this.actor, this.mode, path);
        await this.render(false);
      }
    }).render(true);
  }

  async onRefresh(event) {
    event.preventDefault();
    if ( !canEditActor(this.actor) ) {
      ui.notifications.warn(game.i18n.localize("CAD.NoPermission"));
      return;
    }

    const tokenPath = getCurrentPath(this.actor, "token");
    if ( !tokenPath ) {
      ui.notifications.warn(game.i18n.localize("CAD.NoTokenImage"));
      return;
    }

    const result = await updateActiveSceneLinkedTokens(this.actor, tokenPath);
    if ( !result.hasScene ) {
      ui.notifications.warn(game.i18n.localize("CAD.NoActiveScene"));
    } else if ( !result.matched ) {
      ui.notifications.warn(game.i18n.localize("CAD.NoSceneTokens"));
    } else if ( result.failed && !result.updated ) {
      ui.notifications.error(game.i18n.localize("CAD.SceneTokensUpdateFailed"));
    } else if ( result.failed ) {
      ui.notifications.warn(game.i18n.format("CAD.SceneTokensPartiallyUpdated", {
        count: result.updated,
        failed: result.failed
      }));
    } else if ( result.updated ) {
      ui.notifications.info(game.i18n.format("CAD.SceneTokensUpdated", { count: result.updated }));
    } else {
      ui.notifications.info(game.i18n.localize("CAD.SceneTokensAlreadyCurrent"));
    }
  }

  async onToggleHardDelete(event) {
    event.preventDefault();
    this.hardDelete = !this.hardDelete;
    if ( this.hardDelete ) ui.notifications.warn(game.i18n.localize("CAD.HardDeleteEnabled"));
    await this.render(false);
  }

  async onSelectImage(event, target) {
    event.preventDefault();
    const path = target.dataset.path;
    if ( await setActiveImage(this.actor, this.mode, path) ) await this.render(false);
  }

  async onRemoveImage(event, target) {
    event.preventDefault();
    if ( !canEditActor(this.actor) ) {
      ui.notifications.warn(game.i18n.localize("CAD.NoPermission"));
      return;
    }

    const path = target.dataset.path;
    if ( normalizePath(path) === normalizePath(getCurrentPath(this.actor, this.mode)) ) {
      ui.notifications.warn(game.i18n.localize("CAD.ActiveImageCannotDelete"));
      await this.render(false);
      return;
    }

    if ( this.hardDelete && isPathActive(this.actor, path) ) {
      ui.notifications.warn(game.i18n.localize("CAD.HardDeleteActiveElsewhere"));
      await this.render(false);
      return;
    }

    if ( this.hardDelete ) {
      try {
        await deletePhysicalFile(path);
      } catch (err) {
        console.warn(`${MODULE_ID} | Physical file deletion failed for ${path}.`, err);
        ui.notifications.error(err?.message ?? game.i18n.localize("CAD.HardDeleteFailed"));
        return;
      }

      await removeGalleryPath(this.actor, this.mode, path, { allModes: true });
      ui.notifications.info(game.i18n.localize("CAD.HardDeleteSuccess"));
      await this.render(false);
      return;
    }

    await removeGalleryPath(this.actor, this.mode, path);
    ui.notifications.info(game.i18n.localize("CAD.RemoveSuccess"));
    await this.render(false);
  }
}
