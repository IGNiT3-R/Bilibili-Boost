/**
 * Bilibili-Boost
 *
 * @author IgniteRan
 * @license MIT
 * @description Bilibili-Boost：增强 Bilibili 浏览体验，支持标记看过与播放列表增强
 *
 * Copyright (c) 2024 IgniteRan
 */

const extensionApi = globalThis.browser || globalThis.chrome;

const MESSAGE_TYPES = {
  GET_SETTINGS: 'GET_SETTINGS',
  GET_WATCH_RECORD: 'GET_WATCH_RECORD',
  GET_WATCH_RECORDS: 'GET_WATCH_RECORDS',
  UPSERT_WATCH_PROGRESS: 'UPSERT_WATCH_PROGRESS',
  MARK_WATCHED_COMPLETE: 'MARK_WATCHED_COMPLETE',
  RESTORE_WATCH_RECORD: 'RESTORE_WATCH_RECORD',
  CLEAR_WATCH_RECORD: 'CLEAR_WATCH_RECORD',
  WATCH_RECORD_UPDATED: 'WATCH_RECORD_UPDATED',
  WATCH_RECORDS_UPDATED: 'WATCH_RECORDS_UPDATED'
};

const SETTINGS_KEY = 'settings';
const DEFAULT_COMPLETE_THRESHOLD = 98;
const COMPLETE_THRESHOLD_MIN = 90;
const COMPLETE_THRESHOLD_MAX = 100;
const MAX_INCOMPLETE_PROGRESS = 99;

const DEFAULT_SETTINGS = {
  watchMarkerEnabled: true,
  collectionBoostEnabled: true,
  completionThreshold: DEFAULT_COMPLETE_THRESHOLD
};

const PLAYLIST_HEADER_SELECTOR = '.video-sections-head, .video-pod__header';
const VIDEO_LIST_BODY_SELECTOR = '.video-pod__body';
const VIDEO_ITEM_SELECTOR = '.video-pod__item';
const WATCH_PANEL_TARGET_SELECTOR = 'h1.video-title, h1[class*="video-title"], h1[class*="title"], .video-info-title, #viewbox_report h1, .playlist-container--left h1';
const WATCH_PANEL_META_SELECTOR = '.video-info-detail, .video-info-detail-list, .video-meta-container, .video-data, [class*="video-info-detail"], [class*="video-info-meta"]';
const WATCH_PANEL_META_FALLBACK_SELECTOR = '.pubdate-ip-text, [class*="pubdate"]';
const WATCH_PANEL_PLAYER_BOUNDARY_SELECTOR = '#bilibili-player, .bpx-player-container, .bilibili-player, .player-wrap, .player-container';
const WATCH_PANEL_LEFT_COLUMN_SELECTOR = '#viewbox_report, .video-info-container, .video-info, .left-container, .playlist-container--left';
const VIDEO_LINK_SELECTOR = 'a[href*="/video/BV"], a[href*="bvid="]';
const CARD_CONTAINER_SELECTOR = '.bili-video-card, .feed-card, .video-card, .fav-video-card, .media-card, .small-item, .recommend-video-card, .video-page-card-small, .bili-cover-card, .vui_video_card, .bili-dyn-card-video, .video-pod__item, .list-item';
const CARD_HOST_SELECTOR = '.upload-video-card, upload-video-card, .bili-video-card, bili-video-card, .feed-card, .video-card, .fav-video-card, .media-card, .small-item, .recommend-video-card, .video-page-card-small, .bili-cover-card, .vui_video_card, .bili-dyn-card-video, .video-pod__item, .list-item';
const CARD_META_ROW_SELECTOR = '.bili-video-card__info--bottom, .bili-video-card__stats, .video-card__stats, .meta, .bili-video-card__subtitle, [class*="video-card__stats"], [class*="info--bottom"], [class*="info-bottom"], [class*="video-meta"], [class*="subtitle"]';
const CARD_META_TEXT_SELECTOR = '.time, [class*="date"], [class*="pubdate"], [class*="publish"], [class*="time"], [class*="subtitle"]';
const CARD_TITLE_SELECTOR = '.bili-video-card__info--tit, .bili-video-card__title, .title, [class*="title"], [class*="tit"]';
const CARD_COVER_SELECTOR = '.bili-video-card__image, .bili-video-card__cover, .video-card__cover, .recommend-video-card__cover, .bili-cover-card__image, .vui_video_card__cover, .cover, .pic, .image, [class*="cover"], [class*="image"], [class*="thumb"], [class*="thumbnail"]';
const CARD_COVER_MEDIA_SELECTOR = 'img, picture, video, canvas, source';
const LIST_PAGE_CARD_HOST_SELECTOR = '.watchlater-list .video-card, .watchlater-list-container .video-card, .fav-video-list .small-item, .favlist-main .small-item, .fav-main .small-item, .fav-list .small-item, .fav-video-card, .media-card';
const LIST_PAGE_CARD_ROW_SELECTOR = '.info__bottom, .bili-video-card__subtitle, .video-card__stats, .fav-video-card__meta, .media-card__meta, .meta';

const WATCH_PANEL_ID = 'bb-watch-panel';
const COLLECTION_CONTROLS_CLASS = 'bb-collection-controls';
const THUMBNAIL_BADGE_CLASS = 'bb-watch-badge';
const THUMBNAIL_BADGE_HOST_CLASS = 'bb-watch-badge-host';
const CARD_WATCH_TOGGLE_CLASS = 'bb-watch-card-toggle';
const CARD_WATCH_TOGGLE_ROW_CLASS = 'bb-watch-card-row';
const CARD_WATCH_TOGGLE_ROW_GENERATED_CLASS = 'bb-watch-card-row--generated';
const WATCH_PANEL_INLINE_FALLBACK_WIDTH = 388;
const WATCH_PANEL_INLINE_GAP = 24;
const WATCH_PANEL_INLINE_EDGE_PADDING = 8;
const WATCH_PANEL_META_MAX_INLINE_OCCUPANCY = 0.58;
const BADGE_HOST_MIN_WIDTH = 96;
const BADGE_HOST_MIN_HEIGHT = 54;

const MIN_VISIBLE_PROGRESS = 5;
const AUTO_SAVE_PROGRESS_STEP = 5;
const AUTO_SAVE_INTERVAL_MS = 15000;

const state = {
  settings: { ...DEFAULT_SETTINGS },
  lastUrl: location.href,
  refreshTimer: null,
  routeTimer: null,
  bootstrapTimer: null,
  bootstrapStartTimer: null,
  bootstrapAttempts: 0,
  isRefreshing: false,
  needsRefresh: false,
  collection: {
    isExpanded: false,
    isListExpanded: false
  },
  watch: {
    recordCache: new Map(),
    currentBvid: '',
    currentTitle: '',
    currentRecord: null,
    player: null,
    lastSyncedProgress: 0,
    lastSyncAt: 0,
    saveInFlight: false,
    needsResync: false,
    pendingForceComplete: false
  }
};

function normalizeBvid(rawValue) {
  if (typeof rawValue !== 'string') {
    return '';
  }

  const match = rawValue.toUpperCase().match(/BV[0-9A-Z]+/);
  return match ? match[0] : '';
}

function parseBvidFromUrl(url) {
  if (typeof url !== 'string') {
    return '';
  }

  const videoPathMatch = url.match(/\/video\/(BV[0-9A-Za-z]+)/);

  if (videoPathMatch) {
    return normalizeBvid(videoPathMatch[1]);
  }

  try {
    const parsedUrl = new URL(url, location.href);
    const queryBvid = parsedUrl.searchParams.get('bvid');

    if (queryBvid) {
      return normalizeBvid(queryBvid);
    }
  } catch (error) {
    // 相对路径或异常链接继续走兜底正则。
  }

  const queryMatch = url.match(/[?&#]bvid=(BV[0-9A-Za-z]+)/i);
  return normalizeBvid(queryMatch ? queryMatch[1] : '');
}

function clampProgress(progress) {
  const numericValue = Number(progress);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function sanitizeCompletionThreshold(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return DEFAULT_COMPLETE_THRESHOLD;
  }

  return Math.max(
    COMPLETE_THRESHOLD_MIN,
    Math.min(COMPLETE_THRESHOLD_MAX, Math.round(numericValue))
  );
}

function normalizeSettings(settings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    watchMarkerEnabled: settings && Object.prototype.hasOwnProperty.call(settings, 'watchMarkerEnabled')
      ? Boolean(settings.watchMarkerEnabled)
      : DEFAULT_SETTINGS.watchMarkerEnabled,
    collectionBoostEnabled: settings && Object.prototype.hasOwnProperty.call(settings, 'collectionBoostEnabled')
      ? Boolean(settings.collectionBoostEnabled)
      : DEFAULT_SETTINGS.collectionBoostEnabled,
    completionThreshold: sanitizeCompletionThreshold(settings && settings.completionThreshold)
  };
}

function getCompletionThreshold(settings = state.settings) {
  return sanitizeCompletionThreshold(settings && settings.completionThreshold);
}

function getRecordPlaybackProgress(record) {
  if (!record || typeof record !== 'object') {
    return 0;
  }

  const duration = Number(record.duration);
  const lastPosition = Number(record.lastPosition);

  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(lastPosition) || lastPosition <= 0) {
    return 0;
  }

  return clampProgress((lastPosition / duration) * 100);
}

function isPlaybackCompletionAtEnd(record) {
  if (!record || typeof record !== 'object') {
    return false;
  }

  const duration = Number(record.duration);
  const lastPosition = Number(record.lastPosition);

  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(lastPosition) || lastPosition <= 0) {
    return false;
  }

  return lastPosition >= Math.max(Math.round(duration) - 1, 0) || getRecordPlaybackProgress(record) >= 99;
}

function getRecordCompletionKind(record) {
  if (!record || !record.completed) {
    return null;
  }

  if (
    record.completionSource === 'manual' ||
    record.completionSource === 'ended' ||
    record.completionSource === 'threshold'
  ) {
    return record.completionSource;
  }

  return isPlaybackCompletionAtEnd(record) ? 'ended' : 'threshold';
}

function getRecordProgress(record) {
  if (!record || typeof record !== 'object') {
    return 0;
  }

  const rawMaxProgress = clampProgress(record.maxProgress);
  const storedIncompleteProgress = Math.min(
    MAX_INCOMPLETE_PROGRESS,
    clampProgress(record.lastIncompleteProgress)
  );
  const playbackProgress = Math.min(MAX_INCOMPLETE_PROGRESS, getRecordPlaybackProgress(record));

  if (record.completed) {
    const completionKind = getRecordCompletionKind(record);

    if (completionKind === 'manual' || completionKind === 'ended') {
      return 100;
    }

    return Math.max(
      storedIncompleteProgress,
      playbackProgress,
      rawMaxProgress >= 100 ? 0 : Math.min(MAX_INCOMPLETE_PROGRESS, rawMaxProgress)
    );
  }

  return Math.max(
    rawMaxProgress,
    storedIncompleteProgress,
    playbackProgress
  );
}

function isListPlaybackPage() {
  if (location.hostname !== 'www.bilibili.com') {
    return false;
  }

  return (
    /^\/list\/(?:watchlater|ml\d+)/.test(location.pathname) ||
    /^\/medialist\/play\/(?:watchlater|ml\d+)/.test(location.pathname)
  );
}

function isVideoPage() {
  return /\/video\/BV[0-9A-Za-z]+/.test(location.href) || (
    isListPlaybackPage() && Boolean(getCurrentVideoBvid())
  );
}

function isSpacePage() {
  return location.hostname === 'space.bilibili.com';
}

function isSearchPage() {
  return location.hostname === 'search.bilibili.com';
}

function isSpaceFavoritePage() {
  return location.hostname === 'space.bilibili.com' && /\/favlist\/?$/.test(location.pathname);
}

function isWatchLaterPage() {
  return location.hostname === 'www.bilibili.com' && (
    location.pathname === '/watchlater/list' ||
    location.pathname === '/watchlater/list/' ||
    location.pathname === '/list/watchlater' ||
    location.pathname === '/list/watchlater/' ||
    location.pathname === '/medialist/play/watchlater' ||
    location.pathname === '/medialist/play/watchlater/'
  );
}

function isFavoritePage() {
  return location.hostname === 'www.bilibili.com' && (
    /^\/list\/ml\d+\/?$/.test(location.pathname) ||
    /^\/medialist\/play\/ml\d+\/?$/.test(location.pathname)
  );
}

function isListCardPage() {
  return isWatchLaterPage() || isFavoritePage() || isSpaceFavoritePage();
}

function supportsCardWatchToggle() {
  return isSpacePage() || isSearchPage() || isListCardPage();
}

function getCurrentVideoBvid() {
  return parseBvidFromUrl(location.href);
}

function getCurrentVideoTitle() {
  if (!isVideoPage()) {
    return '';
  }

  const titleElement = document.querySelector(WATCH_PANEL_TARGET_SELECTOR);
  const titleText = titleElement && titleElement.textContent ? titleElement.textContent.trim() : '';

  if (titleText) {
    return titleText;
  }

  return document.title.replace(/_哔哩哔哩.*$/, '').trim();
}

function formatWatchStatus(record) {
  if (!record) {
    return {
      text: '未记录',
      status: 'empty'
    };
  }

  const progress = getRecordProgress(record);
  const completionThreshold = getCompletionThreshold();

  if (isCompletedRecord(record, completionThreshold)) {
    return {
      text: '已看完',
      status: 'complete'
    };
  }

  if (progress < MIN_VISIBLE_PROGRESS) {
    return {
      text: '未记录',
      status: 'empty'
    };
  }

  return {
    text: `已看 ${progress}%`,
    status: 'progress'
  };
}

function isCompletedRecord(record, completionThreshold = getCompletionThreshold()) {
  if (!record) {
    return false;
  }

  if (record.completed) {
    const completionKind = getRecordCompletionKind(record);

    if (completionKind === 'manual' || completionKind === 'ended') {
      return true;
    }
  }

  return getRecordProgress(record) >= completionThreshold;
}

async function sendMessage(type, payload) {
  const response = await extensionApi.runtime.sendMessage({
    type,
    payload
  });

  if (!response || !response.ok) {
    throw new Error(response && response.error ? response.error : '扩展通信失败');
  }

  return response.data;
}

function normalizeInlineText(text) {
  return typeof text === 'string' ? text.replace(/\s+/g, '').trim() : '';
}

async function loadSettings() {
  try {
    const settings = await sendMessage(MESSAGE_TYPES.GET_SETTINGS);
    state.settings = normalizeSettings(settings);
  } catch (error) {
    console.warn('[Bilibili-Boost] 读取设置失败，已回退到默认配置', error);
    state.settings = { ...DEFAULT_SETTINGS };
  }
}

function updateCachedRecord(bvid, record) {
  updateCachedRecords({
    [bvid]: record || null
  });
}

function updateCachedRecords(records) {
  const entries = Object.entries(records || {});
  let currentVideoChanged = false;

  entries.forEach(([rawBvid, record]) => {
    const normalizedBvid = normalizeBvid(rawBvid);

    if (!normalizedBvid) {
      return;
    }

    state.watch.recordCache.set(normalizedBvid, record || null);

    if (normalizedBvid === state.watch.currentBvid) {
      state.watch.currentRecord = record || null;
      state.watch.lastSyncedProgress = record ? getRecordProgress(record) : 0;
      currentVideoChanged = true;
    }
  });

  if (currentVideoChanged) {
    renderWatchPanel();
  }
}

async function ensureCachedWatchRecords(bvids) {
  const missingBvids = Array.from(
    new Set((Array.isArray(bvids) ? bvids : []).map(normalizeBvid).filter(Boolean))
  ).filter((bvid) => !state.watch.recordCache.has(bvid));

  if (missingBvids.length === 0) {
    return;
  }

  try {
    const records = await sendMessage(MESSAGE_TYPES.GET_WATCH_RECORDS, {
      bvids: missingBvids
    });

    missingBvids.forEach((bvid) => {
      state.watch.recordCache.set(bvid, records && Object.prototype.hasOwnProperty.call(records, bvid) ? records[bvid] : null);
    });
  } catch (error) {
    console.warn('[Bilibili-Boost] 批量读取已看记录失败', error);
  }
}

async function syncCurrentVideoContext() {
  const nextBvid = getCurrentVideoBvid();
  const nextTitle = getCurrentVideoTitle();
  const bvidChanged = nextBvid !== state.watch.currentBvid;

  if (bvidChanged) {
    detachVideoListeners();
    state.watch.currentRecord = null;
    state.watch.lastSyncedProgress = 0;
    state.watch.lastSyncAt = 0;
    state.watch.saveInFlight = false;
    state.watch.needsResync = false;
    state.watch.pendingForceComplete = false;
  }

  state.watch.currentBvid = nextBvid;
  state.watch.currentTitle = nextTitle;

  if (!nextBvid) {
    state.watch.currentRecord = null;
    return;
  }

  if (!state.watch.recordCache.has(nextBvid) || bvidChanged) {
    try {
      const record = await sendMessage(MESSAGE_TYPES.GET_WATCH_RECORD, {
        bvid: nextBvid
      });

      state.watch.recordCache.set(nextBvid, record || null);
    } catch (error) {
      console.warn('[Bilibili-Boost] 读取当前视频已看记录失败', error);
    }
  }

  state.watch.currentRecord = state.watch.recordCache.get(nextBvid) || null;
  state.watch.lastSyncedProgress = state.watch.currentRecord ? getRecordProgress(state.watch.currentRecord) : 0;
}

function getCollectionControls() {
  return document.querySelector(`.${COLLECTION_CONTROLS_CLASS}`);
}

function clearCollectionStyles() {
  const videoItems = document.querySelectorAll(VIDEO_ITEM_SELECTOR);

  videoItems.forEach((item) => {
    const titleElements = item.querySelectorAll('[class*="title"], a');

    titleElements.forEach((titleElement) => {
      titleElement.style.whiteSpace = '';
      titleElement.style.overflow = '';
      titleElement.style.textOverflow = '';
      titleElement.style.webkitLineClamp = '';
      titleElement.style.display = '';
      titleElement.style.height = '';
      titleElement.style.maxHeight = '';
      titleElement.style.lineClamp = '';
    });

    item.classList.remove('title-expanded');
    item.style.height = '';
    item.style.minHeight = '';
  });

  const listBody = document.querySelector(VIDEO_LIST_BODY_SELECTOR);

  if (listBody) {
    listBody.style.maxHeight = '';
    listBody.style.overflowY = '';
    listBody.style.overflowX = '';
  }
}

function removeCollectionControls() {
  const controls = getCollectionControls();

  if (controls) {
    controls.remove();
  }
}

function resetCollectionBoost() {
  clearCollectionStyles();
  removeCollectionControls();
  state.collection.isExpanded = false;
  state.collection.isListExpanded = false;
}

function applyCollectionState() {
  if (!state.settings.collectionBoostEnabled || !isVideoPage()) {
    return;
  }

  const controls = getCollectionControls();
  const titleButton = controls && controls.querySelector('[data-role="toggle-title"]');
  const listButton = controls && controls.querySelector('[data-role="toggle-list"]');
  const videoItems = document.querySelectorAll(VIDEO_ITEM_SELECTOR);

  videoItems.forEach((item) => {
    const titleElements = item.querySelectorAll('[class*="title"], a');

    titleElements.forEach((titleElement) => {
      if (state.collection.isExpanded) {
        titleElement.style.whiteSpace = 'normal';
        titleElement.style.overflow = 'visible';
        titleElement.style.textOverflow = 'clip';
        titleElement.style.webkitLineClamp = 'unset';
        titleElement.style.display = 'block';
        titleElement.style.height = 'auto';
        titleElement.style.maxHeight = 'none';
        titleElement.style.lineClamp = 'unset';
      } else {
        titleElement.style.whiteSpace = '';
        titleElement.style.overflow = '';
        titleElement.style.textOverflow = '';
        titleElement.style.webkitLineClamp = '';
        titleElement.style.display = '';
        titleElement.style.height = '';
        titleElement.style.maxHeight = '';
        titleElement.style.lineClamp = '';
      }
    });

    if (state.collection.isExpanded) {
      item.classList.add('title-expanded');
      item.style.height = 'auto';
      item.style.minHeight = 'auto';
    } else {
      item.classList.remove('title-expanded');
      item.style.height = '';
      item.style.minHeight = '';
    }
  });

  const listBody = document.querySelector(VIDEO_LIST_BODY_SELECTOR);

  if (listBody) {
    if (state.collection.isListExpanded) {
      listBody.style.maxHeight = '600px';
      listBody.style.overflowY = 'auto';
      listBody.style.overflowX = 'hidden';
    } else {
      listBody.style.maxHeight = '';
      listBody.style.overflowY = '';
      listBody.style.overflowX = '';
    }
  }

  if (titleButton) {
    titleButton.textContent = state.collection.isExpanded ? '折叠标题' : '展开标题';
  }

  if (listButton) {
    listButton.textContent = state.collection.isListExpanded ? '折叠列表' : '展开列表';
  }
}

function ensureCollectionControls() {
  if (!state.settings.collectionBoostEnabled || !isVideoPage()) {
    resetCollectionBoost();
    return;
  }

  const header = document.querySelector(PLAYLIST_HEADER_SELECTOR);

  if (!header) {
    removeCollectionControls();
    return;
  }

  let controls = header.querySelector(`.${COLLECTION_CONTROLS_CLASS}`);

  if (!controls) {
    controls = document.createElement('div');
    controls.className = COLLECTION_CONTROLS_CLASS;

    const titleButton = document.createElement('div');
    titleButton.className = 'title-expander-btn';
    titleButton.dataset.role = 'toggle-title';
    titleButton.setAttribute('role', 'button');
    titleButton.tabIndex = 0;
    titleButton.addEventListener('click', () => {
      state.collection.isExpanded = !state.collection.isExpanded;
      applyCollectionState();
    });
    titleButton.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        titleButton.click();
      }
    });

    const listButton = document.createElement('div');
    listButton.className = 'title-expander-btn';
    listButton.dataset.role = 'toggle-list';
    listButton.setAttribute('role', 'button');
    listButton.tabIndex = 0;
    listButton.addEventListener('click', () => {
      state.collection.isListExpanded = !state.collection.isListExpanded;
      applyCollectionState();
    });
    listButton.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        listButton.click();
      }
    });

    controls.appendChild(titleButton);
    controls.appendChild(listButton);
    header.appendChild(controls);
  }

  applyCollectionState();
}

async function markWatchRecordComplete(bvid, title = '') {
  const normalizedBvid = normalizeBvid(bvid);

  if (!normalizedBvid) {
    return null;
  }

  const record = await sendMessage(MESSAGE_TYPES.MARK_WATCHED_COMPLETE, {
    bvid: normalizedBvid,
    title
  });

  updateCachedRecord(normalizedBvid, record);
  return record || null;
}

async function clearWatchRecordByBvid(bvid) {
  const normalizedBvid = normalizeBvid(bvid);

  if (!normalizedBvid) {
    return;
  }

  await sendMessage(MESSAGE_TYPES.CLEAR_WATCH_RECORD, {
    bvid: normalizedBvid
  });

  updateCachedRecord(normalizedBvid, null);
}

async function restoreWatchRecordByBvid(bvid) {
  const normalizedBvid = normalizeBvid(bvid);

  if (!normalizedBvid) {
    return null;
  }

  const record = await sendMessage(MESSAGE_TYPES.RESTORE_WATCH_RECORD, {
    bvid: normalizedBvid
  });

  updateCachedRecord(normalizedBvid, record || null);
  return record || null;
}

async function markCurrentVideoComplete() {
  if (!state.watch.currentBvid) {
    return;
  }

  try {
    if (isCompletedRecord(state.watch.currentRecord)) {
      await restoreWatchRecordByBvid(state.watch.currentBvid);
    } else {
      await markWatchRecordComplete(state.watch.currentBvid, state.watch.currentTitle);
    }

    scheduleRefresh(60);
  } catch (error) {
    console.warn('[Bilibili-Boost] 手动标记已看完失败', error);
  }
}

async function clearCurrentVideoRecord() {
  if (!state.watch.currentBvid) {
    return;
  }

  try {
    await clearWatchRecordByBvid(state.watch.currentBvid);
    scheduleRefresh(60);
  } catch (error) {
    console.warn('[Bilibili-Boost] 清除已看记录失败', error);
  }
}

function getRecordSeekPosition(record) {
  if (!record || typeof record !== 'object') {
    return 0;
  }

  const lastPosition = Number(record.lastPosition);

  if (!Number.isFinite(lastPosition) || lastPosition <= 0) {
    return 0;
  }

  const duration = Number(record.duration);

  if (!Number.isFinite(duration) || duration <= 0) {
    return Math.round(lastPosition);
  }

  return Math.round(Math.min(lastPosition, Math.max(duration - 1, 0)));
}

function formatWatchTime(seconds) {
  const normalizedSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const remainingSeconds = normalizedSeconds % 60;
  const paddedMinutes = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const paddedSeconds = String(remainingSeconds).padStart(2, '0');

  return hours > 0
    ? `${hours}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`;
}

function getCurrentPlayerSeekPosition(record = state.watch.currentRecord) {
  const player = state.watch.player || getCurrentVideoElement();
  const seekPosition = getRecordSeekPosition(record);

  if (!player || seekPosition <= 0) {
    return 0;
  }

  const duration = Number(player.duration);

  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return Math.min(seekPosition, Math.max(duration - 1, 0));
}

function jumpToCurrentWatchProgress() {
  const player = state.watch.player || getCurrentVideoElement();
  const seekPosition = getCurrentPlayerSeekPosition();

  if (!player || seekPosition <= 0) {
    return;
  }

  try {
    player.currentTime = seekPosition;
  } catch (error) {
    console.warn('[Bilibili-Boost] 跳转到已看进度失败', error);
  }
}

function renderWatchPanel(panelElement = document.getElementById(WATCH_PANEL_ID)) {
  const panel = panelElement;

  if (!panel) {
    return;
  }

  const statusElement = panel.querySelector('.bb-watch-panel__status');
  const jumpButton = panel.querySelector('[data-role="jump-progress"]');
  const markButton = panel.querySelector('[data-role="mark-complete"]');
  const clearButton = panel.querySelector('[data-role="clear-record"]');
  const status = formatWatchStatus(state.watch.currentRecord);
  const seekPosition = getCurrentPlayerSeekPosition();

  if (statusElement) {
    statusElement.textContent = status.text;
    statusElement.dataset.status = status.status;
  }

  if (jumpButton) {
    jumpButton.disabled = seekPosition <= 0;
    jumpButton.title = seekPosition > 0
      ? `跳转到上次已看位置 ${formatWatchTime(seekPosition)}`
      : '暂无可跳转的已看进度';
  }

  if (markButton) {
    markButton.textContent = status.status === 'complete' ? '取消已看完' : '标记已看完';
    markButton.disabled = false;
  }

  if (clearButton) {
    clearButton.disabled = !state.watch.currentRecord;
  }
}

function removeWatchPanel() {
  const panel = document.getElementById(WATCH_PANEL_ID);

  if (panel) {
    panel.remove();
  }
}

function isStableWatchTitleElement(element) {
  if (!(element instanceof HTMLElement) || !element.isConnected) {
    return false;
  }

  if (element.closest(`#${WATCH_PANEL_ID}`)) {
    return false;
  }

  if (element.closest('[class*="popover"], [class*="tooltip"], [class*="dropdown"], [class*="dialog"]')) {
    return false;
  }

  return Boolean(normalizeInlineText(element.textContent || element.getAttribute('title') || ''));
}

function isVisibleWatchElement(element) {
  if (!(element instanceof HTMLElement) || !element.isConnected) {
    return false;
  }

  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0;
}

function isWatchPanelMetaCandidate(element, titleElement) {
  if (!(element instanceof HTMLElement) || !isVisibleWatchElement(element)) {
    return false;
  }

  if (element.closest(`#${WATCH_PANEL_ID}`)) {
    return false;
  }

  if (element.closest('[class*="popover"], [class*="tooltip"], [class*="dropdown"], [class*="dialog"]')) {
    return false;
  }

  if (titleElement && (element === titleElement || element.contains(titleElement))) {
    return false;
  }

  if (element.querySelector(WATCH_PANEL_TARGET_SELECTOR)) {
    return false;
  }

  if (!normalizeInlineText(element.textContent || '')) {
    return false;
  }

  if (titleElement instanceof HTMLElement && isVisibleWatchElement(titleElement)) {
    const titleRect = titleElement.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    if (elementRect.bottom < titleRect.bottom - 2) {
      return false;
    }
  }

  return true;
}

function collectWatchPanelMetaCandidates(containerElement) {
  if (!(containerElement instanceof HTMLElement)) {
    return [];
  }

  const candidates = [
    ...Array.from(containerElement.querySelectorAll(WATCH_PANEL_META_SELECTOR)),
    ...Array.from(containerElement.querySelectorAll(WATCH_PANEL_META_FALLBACK_SELECTOR)).flatMap((fallbackElement) => [
      fallbackElement.closest(WATCH_PANEL_META_SELECTOR),
      fallbackElement.parentElement,
      fallbackElement
    ])
  ].filter((candidate) => candidate instanceof HTMLElement);

  return Array.from(new Set(candidates));
}

function findWatchPanelMetaElement(containerElement, titleElement) {
  const titleRect = titleElement instanceof HTMLElement && isVisibleWatchElement(titleElement)
    ? titleElement.getBoundingClientRect()
    : null;

  return collectWatchPanelMetaCandidates(containerElement)
    .filter((candidate) => isWatchPanelMetaCandidate(candidate, titleElement))
    .sort((firstCandidate, secondCandidate) => {
      if (!titleRect) {
        return 0;
      }

      const firstRect = firstCandidate.getBoundingClientRect();
      const secondRect = secondCandidate.getBoundingClientRect();
      const firstDistance = Math.abs(firstRect.top - titleRect.bottom);
      const secondDistance = Math.abs(secondRect.top - titleRect.bottom);

      return firstDistance - secondDistance;
    })[0] || null;
}

function findWatchPanelContextInContainer(containerElement) {
  if (!(containerElement instanceof HTMLElement) || !isVisibleWatchElement(containerElement)) {
    return null;
  }

  const titleElement = Array.from(containerElement.querySelectorAll(WATCH_PANEL_TARGET_SELECTOR))
    .find((candidate) => isStableWatchTitleElement(candidate) && isVisibleWatchElement(candidate));
  const resolvedMetaElement = findWatchPanelMetaElement(containerElement, titleElement);

  if (!titleElement && !resolvedMetaElement) {
    return null;
  }

  return {
    containerElement,
    titleElement: titleElement || null,
    metaElement: resolvedMetaElement || null
  };
}

function findWatchPanelTitleElement() {
  const stableSelectors = [
    '#viewbox_report h1',
    '.video-info-title',
    'h1.video-title',
    '.video-info-container h1[class*="title"]',
    '.left-container h1[class*="title"]',
    '.playlist-container--left h1'
  ];

  for (const selector of stableSelectors) {
    const titleElement = document.querySelector(selector);

    if (isStableWatchTitleElement(titleElement)) {
      return titleElement;
    }
  }

  return Array.from(document.querySelectorAll(WATCH_PANEL_TARGET_SELECTOR))
    .find((titleElement) => isStableWatchTitleElement(titleElement)) || null;
}

function findWatchPanelContext() {
  const stableContainerSelectors = [
    '#viewbox_report',
    '.video-info-container',
    '.video-info',
    '.left-container',
    '.playlist-container--left'
  ];

  for (const selector of stableContainerSelectors) {
    const containerContext = findWatchPanelContextInContainer(document.querySelector(selector));

    if (containerContext && containerContext.titleElement) {
      return containerContext;
    }
  }

  const titleElement = findWatchPanelTitleElement();

  if (titleElement && titleElement.parentElement) {
    const titleContainer = titleElement.closest('#viewbox_report') || titleElement.parentElement;
    const scopedMeta = findWatchPanelMetaElement(titleContainer, titleElement);

    if (scopedMeta && scopedMeta !== titleElement) {
      return {
        containerElement: titleContainer,
        titleElement,
        metaElement: scopedMeta
      };
    }

    return {
      containerElement: titleContainer,
      titleElement,
      metaElement: null
    };
  }

  const globalMeta = document.querySelector(WATCH_PANEL_META_SELECTOR);

  if (globalMeta) {
    return {
      containerElement: globalMeta.closest('#viewbox_report') || globalMeta.parentElement || globalMeta,
      titleElement: null,
      metaElement: globalMeta
    };
  }

  const globalFallback = document.querySelector(WATCH_PANEL_META_FALLBACK_SELECTOR);

  if (globalFallback) {
    return {
      containerElement: globalFallback.parentElement || globalFallback,
      titleElement: null,
      metaElement: globalFallback
    };
  }

  return null;
}

function getDocumentVideoTitle() {
  return normalizeInlineText(document.title.replace(/_哔哩哔哩.*$/, ''));
}

function getTextVisualWeight(text) {
  return Array.from(normalizeInlineText(text || '')).reduce((weight, char) => (
    weight + (/[\u3000-\u9fff\uff00-\uffef]/.test(char) ? 2 : 1)
  ), 0);
}

function isWatchPanelTitleElement(element) {
  return element instanceof HTMLElement && (
    element.matches(WATCH_PANEL_TARGET_SELECTOR) ||
    element.tagName === 'H1'
  );
}

function getWatchPanelTitleText(element) {
  if (!isWatchPanelTitleElement(element)) {
    return '';
  }

  const titleCandidates = [
    element.getAttribute('title'),
    element.getAttribute('aria-label'),
    element.textContent,
    getDocumentVideoTitle()
  ].map((text) => normalizeInlineText(text || ''));

  return titleCandidates.reduce((longestText, currentText) => (
    getTextVisualWeight(currentText) > getTextVisualWeight(longestText) ? currentText : longestText
  ), '');
}

function measureWatchPanelTextWidth(element) {
  if (!(element instanceof HTMLElement)) {
    return 0;
  }

  const clonedElement = element.cloneNode(true);
  const panel = clonedElement.querySelector && clonedElement.querySelector(`#${WATCH_PANEL_ID}`);

  if (panel) {
    panel.remove();
  }

  const textCandidates = [
    element.getAttribute('title'),
    element.getAttribute('aria-label'),
    clonedElement.textContent,
    isWatchPanelTitleElement(element) ? getWatchPanelTitleText(element) : ''
  ].map((text) => normalizeInlineText(text || ''));
  const text = textCandidates.reduce((longestText, currentText) => (
    currentText.length > longestText.length ? currentText : longestText
  ), '');

  if (!text) {
    return 0;
  }

  const style = window.getComputedStyle(element);
  const measuringElement = document.createElement('span');
  measuringElement.textContent = text;
  measuringElement.style.position = 'fixed';
  measuringElement.style.left = '-9999px';
  measuringElement.style.top = '-9999px';
  measuringElement.style.visibility = 'hidden';
  measuringElement.style.whiteSpace = 'nowrap';
  measuringElement.style.fontFamily = style.fontFamily;
  measuringElement.style.fontSize = style.fontSize;
  measuringElement.style.fontWeight = style.fontWeight;
  measuringElement.style.fontStyle = style.fontStyle;
  measuringElement.style.letterSpacing = style.letterSpacing;
  document.body.appendChild(measuringElement);

  try {
    return Math.ceil(measuringElement.getBoundingClientRect().width);
  } finally {
    measuringElement.remove();
  }
}

function getWatchPanelMeasuredSize(panel) {
  if (!(panel instanceof HTMLElement)) {
    return {
      width: WATCH_PANEL_INLINE_FALLBACK_WIDTH,
      height: 32
    };
  }

  const clonedPanel = panel.cloneNode(true);
  clonedPanel.removeAttribute('id');
  clonedPanel.className = 'bb-watch-panel bb-watch-panel--inline';
  clonedPanel.style.position = 'fixed';
  clonedPanel.style.left = '-9999px';
  clonedPanel.style.top = '-9999px';
  clonedPanel.style.visibility = 'hidden';
  clonedPanel.style.width = 'max-content';
  clonedPanel.style.maxWidth = 'none';
  clonedPanel.style.pointerEvents = 'none';
  document.body.appendChild(clonedPanel);

  try {
    const rect = clonedPanel.getBoundingClientRect();

    return {
      width: Math.ceil(rect.width) || WATCH_PANEL_INLINE_FALLBACK_WIDTH,
      height: Math.ceil(rect.height) || 32
    };
  } finally {
    clonedPanel.remove();
  }
}

function getTextNodeContentRight(textNode) {
  if (!textNode || !normalizeInlineText(textNode.textContent)) {
    return 0;
  }

  const range = document.createRange();
  range.selectNodeContents(textNode);
  let contentRight = 0;

  Array.from(range.getClientRects()).forEach((rect) => {
    if (rect.width > 0 && rect.height > 0) {
      contentRight = Math.max(contentRight, rect.right);
    }
  });

  if (range.detach) {
    range.detach();
  }

  return contentRight;
}

function shouldMeasureElementOwnRect(element, rootElement) {
  if (!(element instanceof Element) || element === rootElement || element.id === WATCH_PANEL_ID) {
    return false;
  }

  if (element.closest(`#${WATCH_PANEL_ID}`)) {
    return false;
  }

  const normalizedText = normalizeInlineText(element.textContent);

  if (normalizedText) {
    return false;
  }

  return element.getClientRects().length > 0;
}

function getWatchPanelLineContentRight(element) {
  if (!(element instanceof HTMLElement)) {
    return 0;
  }

  const elementRect = element.getBoundingClientRect();
  let contentRight = 0;
  const walker = document.createTreeWalker(
    element,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node instanceof HTMLElement && (node.id === WATCH_PANEL_ID || node.closest(`#${WATCH_PANEL_ID}`))) {
          return NodeFilter.FILTER_REJECT;
        }

        if (node.nodeType === Node.TEXT_NODE && !normalizeInlineText(node.textContent)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  let currentNode = walker.nextNode();

  while (currentNode) {
    if (currentNode.nodeType === Node.TEXT_NODE) {
      contentRight = Math.max(contentRight, getTextNodeContentRight(currentNode));
    } else if (shouldMeasureElementOwnRect(currentNode, element)) {
      Array.from(currentNode.getClientRects()).forEach((rect) => {
        if (rect.width > 0 && rect.height > 0) {
          contentRight = Math.max(contentRight, rect.right);
        }
      });
    }

    currentNode = walker.nextNode();
  }

  if (contentRight > 0) {
    return contentRight;
  }

  return elementRect.left + measureWatchPanelTextWidth(element);
}

function getWatchPanelFullTextContentRight(element) {
  if (!(element instanceof HTMLElement)) {
    return 0;
  }

  const elementRect = element.getBoundingClientRect();
  const textWidth = measureWatchPanelTextWidth(element);

  return textWidth ? elementRect.left + textWidth : 0;
}

function getVisibleElementRect(element) {
  if (!(element instanceof HTMLElement) || !element.isConnected) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  return rect.width > 0 && rect.height > 0 ? rect : null;
}

function getWatchPanelPlayerBoundaryRect() {
  const playerElement = getCurrentVideoElement();

  if (!(playerElement instanceof HTMLElement)) {
    return null;
  }

  const playerBoundaryElement = playerElement.closest(WATCH_PANEL_PLAYER_BOUNDARY_SELECTOR);
  return getVisibleElementRect(playerBoundaryElement) || getVisibleElementRect(playerElement);
}

function getWatchPanelInlineRightLimit(context, element, panelSize) {
  const elementRect = element.getBoundingClientRect();
  const viewportRight = Math.max(0, window.innerWidth - WATCH_PANEL_INLINE_EDGE_PADDING);
  const minRight = elementRect.left + WATCH_PANEL_INLINE_GAP + panelSize.width;
  const candidates = [];
  const addCandidate = (rect) => {
    if (!rect) {
      return;
    }

    const right = Math.min(rect.right, viewportRight);

    if (right > minRight) {
      candidates.push(right);
    }
  };

  addCandidate(getWatchPanelPlayerBoundaryRect());
  addCandidate(getVisibleElementRect(element.closest(WATCH_PANEL_LEFT_COLUMN_SELECTOR)));
  addCandidate(getVisibleElementRect(context.containerElement));

  if (candidates.length === 0) {
    return 0;
  }

  return Math.min(...candidates);
}

function getWatchPanelInlinePlacement(element, context, panelSize, options = {}) {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const elementRects = Array.from(element.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  const elementRect = elementRects[0] || element.getBoundingClientRect();
  const rightLimit = getWatchPanelInlineRightLimit(context, element, panelSize);
  const contentRight = options.useFullTextWidth
    ? getWatchPanelFullTextContentRight(element)
    : getWatchPanelLineContentRight(element);
  const lineLeft = Math.max(0, elementRect.left);
  const lineWidth = Math.max(0, rightLimit - lineLeft);
  const contentWidth = Math.max(0, contentRight - lineLeft);

  if (!elementRect.width || !elementRect.height || !rightLimit || !contentRight || !lineWidth) {
    return null;
  }

  if (contentRight + WATCH_PANEL_INLINE_GAP + panelSize.width > rightLimit) {
    return null;
  }

  if (typeof options.maxOccupancy === 'number' && contentWidth / lineWidth > options.maxOccupancy) {
    return null;
  }

  return {
    left: Math.round(window.scrollX + rightLimit - panelSize.width),
    top: Math.round(window.scrollY + elementRect.top + ((elementRect.height - panelSize.height) / 2))
  };
}

function getWatchPanelPlacement(panel, context) {
  const panelSize = getWatchPanelMeasuredSize(panel);

  const metaPlacement = getWatchPanelInlinePlacement(
    context.metaElement,
    context,
    panelSize,
    { maxOccupancy: WATCH_PANEL_META_MAX_INLINE_OCCUPANCY }
  );

  if (metaPlacement) {
    return {
      ...metaPlacement,
      mode: 'meta'
    };
  }

  const titlePlacement = getWatchPanelInlinePlacement(
    context.titleElement,
    context,
    panelSize,
    { useFullTextWidth: true }
  );

  if (titlePlacement) {
    return {
      ...titlePlacement,
      mode: 'title'
    };
  }

  return {
    mode: 'block'
  };
}

function resetWatchPanelPosition(panel) {
  panel.style.left = '';
  panel.style.top = '';
  panel.style.width = '';
}

function getWatchPanelBlockAnchor(context) {
  return context.containerElement || context.metaElement || context.titleElement;
}

function placeWatchPanel(panel, context) {
  const placement = getWatchPanelPlacement(panel, context);

  if (placement.mode !== 'block') {
    panel.className = `bb-watch-panel bb-watch-panel--inline bb-watch-panel--${placement.mode}`;
    panel.style.left = `${placement.left}px`;
    panel.style.top = `${placement.top}px`;
    panel.style.width = 'max-content';

    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }

    return;
  }

  const blockAnchor = getWatchPanelBlockAnchor(context);
  resetWatchPanelPosition(panel);
  panel.className = 'bb-watch-panel bb-watch-panel--block';

  if (!blockAnchor || !blockAnchor.parentElement) {
    return;
  }

  if (panel.parentElement !== blockAnchor.parentElement || panel.previousElementSibling !== blockAnchor) {
    blockAnchor.parentElement.insertBefore(panel, blockAnchor.nextSibling);
  }
}

function ensureWatchPanel() {
  if (!state.settings.watchMarkerEnabled || !isVideoPage() || !state.watch.currentBvid) {
    removeWatchPanel();
    return;
  }

  const panelContext = findWatchPanelContext();

  if (!panelContext || !panelContext.containerElement) {
    return;
  }

  let panel = document.getElementById(WATCH_PANEL_ID);

  if (!panel) {
    panel = document.createElement('div');
    panel.id = WATCH_PANEL_ID;
    panel.className = 'bb-watch-panel';

    const statusElement = document.createElement('span');
    statusElement.className = 'bb-watch-panel__status';

    const actions = document.createElement('div');
    actions.className = 'bb-watch-panel__actions';

    const jumpButton = document.createElement('button');
    jumpButton.type = 'button';
    jumpButton.className = 'bb-watch-panel__button';
    jumpButton.dataset.role = 'jump-progress';
    jumpButton.textContent = '跳到进度';
    jumpButton.addEventListener('click', jumpToCurrentWatchProgress);

    const markButton = document.createElement('button');
    markButton.type = 'button';
    markButton.className = 'bb-watch-panel__button';
    markButton.dataset.role = 'mark-complete';
    markButton.addEventListener('click', () => {
      void markCurrentVideoComplete();
    });

    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'bb-watch-panel__button bb-watch-panel__button--ghost';
    clearButton.dataset.role = 'clear-record';
    clearButton.textContent = '清除记录';
    clearButton.addEventListener('click', () => {
      void clearCurrentVideoRecord();
    });

    actions.appendChild(jumpButton);
    actions.appendChild(markButton);
    actions.appendChild(clearButton);
    panel.appendChild(statusElement);
    panel.appendChild(actions);
  }

  renderWatchPanel(panel);
  placeWatchPanel(panel, panelContext);
}

function getCurrentVideoElement() {
  return document.querySelector('video');
}

function detachVideoListeners() {
  if (!state.watch.player) {
    return;
  }

  state.watch.player.removeEventListener('timeupdate', handleVideoTimeUpdate);
  state.watch.player.removeEventListener('ended', handleVideoEnded);
  state.watch.player.removeEventListener('loadedmetadata', handleVideoLoadedMetadata);
  state.watch.player.removeEventListener('seeked', handleVideoSeeked);
  state.watch.player = null;
}

function attachVideoListeners() {
  if (!state.settings.watchMarkerEnabled || !isVideoPage() || !state.watch.currentBvid) {
    detachVideoListeners();
    return;
  }

  const player = getCurrentVideoElement();

  if (!player) {
    detachVideoListeners();
    return;
  }

  if (state.watch.player === player) {
    return;
  }

  detachVideoListeners();
  state.watch.player = player;
  player.addEventListener('timeupdate', handleVideoTimeUpdate);
  player.addEventListener('ended', handleVideoEnded);
  player.addEventListener('loadedmetadata', handleVideoLoadedMetadata);
  player.addEventListener('seeked', handleVideoSeeked);
}

async function persistWatchProgress(forceComplete = false, forceSync = false) {
  if (!state.settings.watchMarkerEnabled || !state.watch.currentBvid) {
    return;
  }

  const player = state.watch.player || getCurrentVideoElement();

  if (!player) {
    return;
  }

  const duration = Number(player.duration);

  if (!Number.isFinite(duration) || duration <= 0) {
    return;
  }

  const progress = forceComplete ? 100 : clampProgress((player.currentTime / duration) * 100);

  if (!forceComplete && progress < MIN_VISIBLE_PROGRESS) {
    return;
  }

  const now = Date.now();
  const completionThreshold = getCompletionThreshold();
  const existingProgress = state.watch.currentRecord ? getRecordProgress(state.watch.currentRecord) : 0;
  const maxKnownProgress = Math.max(existingProgress, state.watch.lastSyncedProgress);
  const shouldSyncByProgress = progress >= maxKnownProgress + AUTO_SAVE_PROGRESS_STEP;
  const shouldSyncByTime = progress > state.watch.lastSyncedProgress && now - state.watch.lastSyncAt >= AUTO_SAVE_INTERVAL_MS;
  const shouldComplete = forceComplete || progress >= completionThreshold;

  if (!forceSync && !shouldComplete && !shouldSyncByProgress && !shouldSyncByTime) {
    return;
  }

  if (state.watch.saveInFlight) {
    state.watch.needsResync = true;
    state.watch.pendingForceComplete = state.watch.pendingForceComplete || forceComplete;
    return;
  }

  state.watch.saveInFlight = true;

  try {
    const record = await sendMessage(MESSAGE_TYPES.UPSERT_WATCH_PROGRESS, {
      bvid: state.watch.currentBvid,
      title: state.watch.currentTitle,
      progress,
      duration: Math.round(duration),
      currentTime: Math.round(player.currentTime),
      completed: forceComplete,
      source: 'auto'
    });

    updateCachedRecord(state.watch.currentBvid, record);
    state.watch.lastSyncAt = now;
    state.watch.lastSyncedProgress = record ? getRecordProgress(record) : progress;
  } catch (error) {
    console.warn('[Bilibili-Boost] 自动保存观看进度失败', error);
  } finally {
    state.watch.saveInFlight = false;

    if (state.watch.needsResync) {
      const pendingForceComplete = state.watch.pendingForceComplete;
      state.watch.needsResync = false;
      state.watch.pendingForceComplete = false;
      void persistWatchProgress(pendingForceComplete, true);
    }
  }
}

function handleVideoTimeUpdate() {
  void persistWatchProgress(false, false);
}

function handleVideoEnded() {
  void persistWatchProgress(true, true);
}

function handleVideoLoadedMetadata() {
  renderWatchPanel();
  void persistWatchProgress(false, true);
}

function handleVideoSeeked() {
  void persistWatchProgress(false, false);
}

function handlePageHide() {
  void persistWatchProgress(false, true);
}

function handleVisibilityChange() {
  if (document.hidden) {
    void persistWatchProgress(false, true);
  }
}

function handleWindowResize() {
  scheduleRefresh(80);
}

function resolveBadgeHost(anchorElement) {
  const cardHostElement = anchorElement.closest(CARD_HOST_SELECTOR) || anchorElement.closest(CARD_CONTAINER_SELECTOR);

  if (cardHostElement) {
    const coverLink = Array.from(cardHostElement.querySelectorAll(VIDEO_LINK_SELECTOR)).find((linkElement) => {
      if (!(linkElement instanceof HTMLElement)) {
        return false;
      }

      return (
        linkElement.matches(CARD_COVER_SELECTOR) ||
        Boolean(linkElement.querySelector(CARD_COVER_MEDIA_SELECTOR)) ||
        Boolean(linkElement.querySelector(CARD_COVER_SELECTOR))
      );
    });

    const directCoverHost = findBadgeCoverHost(coverLink || cardHostElement, cardHostElement);

    if (directCoverHost) {
      return directCoverHost;
    }
  }

  return findBadgeCoverHost(anchorElement, null);
}

function resolveCardHost(anchorElement) {
  if (isListCardPage()) {
    const listPageCardHost = anchorElement.closest(LIST_PAGE_CARD_HOST_SELECTOR);

    if (listPageCardHost) {
      return listPageCardHost;
    }
  }

  return anchorElement.closest(CARD_HOST_SELECTOR) || anchorElement.closest(CARD_CONTAINER_SELECTOR) || anchorElement;
}

function findBadgeCoverHost(rootElement, cardHostElement) {
  if (!(rootElement instanceof HTMLElement)) {
    return null;
  }

  const candidateElements = [];
  const seenElements = new Set();
  const collectCandidate = (candidateElement) => {
    if (!(candidateElement instanceof HTMLElement) || seenElements.has(candidateElement)) {
      return;
    }

    seenElements.add(candidateElement);

    if (isValidBadgeHost(candidateElement, cardHostElement)) {
      candidateElements.push(candidateElement);
    }
  };

  collectCandidate(rootElement);
  Array.from(rootElement.querySelectorAll(CARD_COVER_SELECTOR)).forEach(collectCandidate);

  const mediaElement = rootElement.querySelector(CARD_COVER_MEDIA_SELECTOR);

  if (mediaElement instanceof HTMLElement) {
    let ancestorElement = mediaElement.parentElement;

    while (ancestorElement instanceof HTMLElement && ancestorElement !== cardHostElement) {
      collectCandidate(ancestorElement);
      ancestorElement = ancestorElement.parentElement;
    }

    collectCandidate(cardHostElement);
  }

  return pickBadgeHostCandidate(candidateElements);
}

function pickBadgeHostCandidate(candidateElements) {
  if (!Array.isArray(candidateElements) || candidateElements.length === 0) {
    return null;
  }

  return candidateElements.reduce((bestElement, currentElement) => {
    if (!(bestElement instanceof HTMLElement)) {
      return currentElement;
    }

    return getBadgeHostScore(currentElement) > getBadgeHostScore(bestElement)
      ? currentElement
      : bestElement;
  }, null);
}

function getBadgeHostScore(candidateElement) {
  if (!(candidateElement instanceof HTMLElement)) {
    return Number.NEGATIVE_INFINITY;
  }

  const rect = candidateElement.getBoundingClientRect();
  const classText = typeof candidateElement.className === 'string'
    ? candidateElement.className.toLowerCase()
    : '';
  let score = rect.width * rect.height;

  if (candidateElement.querySelector(CARD_COVER_MEDIA_SELECTOR)) {
    score += 20000;
  }

  if (/(cover|image|pic|thumb|thumbnail)/.test(classText)) {
    score += 10000;
  }

  if (candidateElement.tagName === 'A') {
    score += 4000;
  }

  return score;
}

function isValidBadgeHost(candidateElement, cardHostElement) {
  if (!(candidateElement instanceof HTMLElement) || !candidateElement.isConnected) {
    return false;
  }

  if (cardHostElement && !cardHostElement.contains(candidateElement)) {
    return false;
  }

  if (candidateElement.matches(CARD_COVER_MEDIA_SELECTOR)) {
    return false;
  }

  const rect = candidateElement.getBoundingClientRect();

  if (rect.width < BADGE_HOST_MIN_WIDTH || rect.height < BADGE_HOST_MIN_HEIGHT) {
    return false;
  }

  const classText = typeof candidateElement.className === 'string'
    ? candidateElement.className.toLowerCase()
    : '';
  const hasCoverHint = /(cover|image|pic|thumb|thumbnail)/.test(classText);
  const hasMedia = Boolean(candidateElement.querySelector(CARD_COVER_MEDIA_SELECTOR));
  const containsTitle = candidateElement !== cardHostElement && Boolean(candidateElement.querySelector(CARD_TITLE_SELECTOR));

  if (containsTitle) {
    return false;
  }

  return hasCoverHint || hasMedia;
}

function collectWatchCardTargets() {
  const anchors = Array.from(document.querySelectorAll(VIDEO_LINK_SELECTOR));
  const seenHosts = new Set();
  const targets = [];

  anchors.forEach((anchorElement) => {
    const bvid = parseBvidFromUrl(anchorElement.href);

    if (!bvid) {
      return;
    }

    const cardHostElement = resolveCardHost(anchorElement);
    const badgeHostElement = resolveBadgeHost(anchorElement);

    if (!badgeHostElement) {
      return;
    }

    if (seenHosts.has(cardHostElement)) {
      return;
    }

    seenHosts.add(cardHostElement);
    targets.push({
      anchorElement,
      badgeHostElement,
      cardHostElement,
      bvid,
      title: getCardVideoTitle(cardHostElement, anchorElement)
    });
  });

  return targets;
}

function removeThumbnailBadge(hostElement) {
  const badge = hostElement.querySelector(`.${THUMBNAIL_BADGE_CLASS}`);

  if (badge) {
    badge.remove();
  }

  hostElement.classList.remove(THUMBNAIL_BADGE_HOST_CLASS);
}

function clearAllThumbnailBadges() {
  document.querySelectorAll(`.${THUMBNAIL_BADGE_HOST_CLASS}`).forEach((hostElement) => {
    removeThumbnailBadge(hostElement);
  });
}

function getCardVideoTitle(hostElement, anchorElement) {
  const titleCandidates = [
    anchorElement && anchorElement.getAttribute('title'),
    hostElement && hostElement.querySelector(CARD_TITLE_SELECTOR) && hostElement.querySelector(CARD_TITLE_SELECTOR).getAttribute('title'),
    hostElement && hostElement.querySelector(CARD_TITLE_SELECTOR) && hostElement.querySelector(CARD_TITLE_SELECTOR).textContent,
    anchorElement && anchorElement.textContent
  ];

  const title = titleCandidates.find((candidate) => typeof candidate === 'string' && candidate.trim());
  return title ? title.replace(/\s+/g, ' ').trim() : '';
}

function looksLikeCardMetaText(text) {
  const normalizedText = normalizeInlineText(text).replace(/^[·•・|/\\-]+/, '');

  if (!normalizedText) {
    return false;
  }

  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(normalizedText)) {
    return false;
  }

  return (
    /^\d{2}-\d{2}$/.test(normalizedText) ||
    /^\d{4}-\d{2}-\d{2}$/.test(normalizedText) ||
    /^\d{1,2}月\d{1,2}日$/.test(normalizedText) ||
    /^\d{2}-\d{2}\d{2}:\d{2}$/.test(normalizedText) ||
    /^\d{4}-\d{2}-\d{2}\d{2}:\d{2}$/.test(normalizedText) ||
    /^(今天|昨天|前天)$/.test(normalizedText) ||
    /^\d+分钟前$/.test(normalizedText) ||
    /^\d+小时前$/.test(normalizedText) ||
    /^\d+天前$/.test(normalizedText)
  );
}

function createCardMetaRowWrapper(metaElement) {
  if (!metaElement || !metaElement.parentElement) {
    return null;
  }

  if (metaElement.parentElement.classList.contains(CARD_WATCH_TOGGLE_ROW_GENERATED_CLASS)) {
    return metaElement.parentElement;
  }

  const wrapper = document.createElement('div');
  wrapper.className = `${CARD_WATCH_TOGGLE_ROW_CLASS} ${CARD_WATCH_TOGGLE_ROW_GENERATED_CLASS}`;
  metaElement.insertAdjacentElement('beforebegin', wrapper);
  wrapper.appendChild(metaElement);
  return wrapper;
}

function findCardWatchToggleRow(hostElement) {
  if (!hostElement) {
    return null;
  }

  const existingRow = hostElement.querySelector(`.${CARD_WATCH_TOGGLE_ROW_CLASS}`);

  if (existingRow) {
    return existingRow;
  }

  if (isListCardPage()) {
    const listPageRow = hostElement.querySelector(LIST_PAGE_CARD_ROW_SELECTOR);

    if (listPageRow) {
      return listPageRow;
    }
  }

  const rowCandidates = Array.from(hostElement.querySelectorAll(CARD_META_ROW_SELECTOR));

  for (const candidate of rowCandidates) {
    const normalizedText = normalizeInlineText(candidate.textContent);

    if (!normalizedText) {
      continue;
    }

    if (looksLikeCardMetaText(normalizedText)) {
      return candidate;
    }

    const innerMetaElement = candidate.querySelector(CARD_META_TEXT_SELECTOR);

    if (innerMetaElement && looksLikeCardMetaText(innerMetaElement.textContent)) {
      return candidate;
    }
  }

  const metaLeafElements = Array.from(hostElement.querySelectorAll(CARD_META_TEXT_SELECTOR));

  for (const metaElement of metaLeafElements) {
    if (metaElement.closest('[class*="cover"]')) {
      continue;
    }

    if (!looksLikeCardMetaText(metaElement.textContent)) {
      continue;
    }

    const parentElement = metaElement.parentElement;

    if (parentElement && parentElement !== hostElement && !parentElement.querySelector(CARD_TITLE_SELECTOR)) {
      return parentElement;
    }

    return createCardMetaRowWrapper(metaElement);
  }

  return null;
}

function removeCardWatchToggle(rowElement) {
  if (!rowElement) {
    return;
  }

  const toggleButton = rowElement.querySelector(`.${CARD_WATCH_TOGGLE_CLASS}`);

  if (toggleButton) {
    toggleButton.remove();
  }

  rowElement.classList.remove(CARD_WATCH_TOGGLE_ROW_CLASS);

  if (!rowElement.classList.contains(CARD_WATCH_TOGGLE_ROW_GENERATED_CLASS)) {
    return;
  }

  const parentElement = rowElement.parentElement;

  if (!parentElement) {
    rowElement.remove();
    return;
  }

  while (rowElement.firstChild) {
    parentElement.insertBefore(rowElement.firstChild, rowElement);
  }

  rowElement.remove();
}

function clearAllCardWatchToggles() {
  document.querySelectorAll(`.${CARD_WATCH_TOGGLE_ROW_CLASS}`).forEach((rowElement) => {
    removeCardWatchToggle(rowElement);
  });
}

function renderCardWatchToggleState(toggleButton, record) {
  const status = formatWatchStatus(record);
  const isComplete = status.status === 'complete';
  const toggleTitle = isComplete
    ? '取消已看完标记，恢复之前进度'
    : status.status === 'progress'
      ? `${status.text}，点击标记为已看完`
      : '标记为已看完';

  toggleButton.dataset.status = isComplete ? 'complete' : 'empty';
  toggleButton.textContent = '';
  toggleButton.title = toggleTitle;
  toggleButton.setAttribute('aria-label', toggleTitle);
  toggleButton.setAttribute('aria-pressed', isComplete ? 'true' : 'false');
}

async function handleCardWatchToggleClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const toggleButton = event.currentTarget;
  const bvid = normalizeBvid(toggleButton.dataset.bvid);

  if (!bvid || toggleButton.dataset.loading === 'true') {
    return;
  }

  toggleButton.dataset.loading = 'true';
  toggleButton.disabled = true;

  try {
    if (toggleButton.dataset.status === 'complete') {
      await restoreWatchRecordByBvid(bvid);
    } else {
      await markWatchRecordComplete(bvid, toggleButton.dataset.title || '');
    }

    scheduleRefresh(30);
  } catch (error) {
    console.warn('[Bilibili-Boost] 卡片快捷标记失败', error);
  } finally {
    delete toggleButton.dataset.loading;
    toggleButton.disabled = false;
    renderCardWatchToggleState(toggleButton, state.watch.recordCache.get(bvid) || null);
  }
}

function renderCardWatchToggle(rowElement, target, record) {
  if (!rowElement || !target) {
    return;
  }

  rowElement.classList.add(CARD_WATCH_TOGGLE_ROW_CLASS);

  let toggleButton = rowElement.querySelector(`.${CARD_WATCH_TOGGLE_CLASS}`);

  if (!toggleButton) {
    toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = CARD_WATCH_TOGGLE_CLASS;
    toggleButton.addEventListener('click', (event) => {
      void handleCardWatchToggleClick(event);
    });
    rowElement.appendChild(toggleButton);
  }

  if (rowElement.lastElementChild !== toggleButton) {
    rowElement.appendChild(toggleButton);
  }

  toggleButton.dataset.bvid = target.bvid;
  toggleButton.dataset.title = target.title || '';
  toggleButton.disabled = toggleButton.dataset.loading === 'true';
  renderCardWatchToggleState(toggleButton, record);
}

function renderThumbnailBadge(hostElement, record) {
  const status = formatWatchStatus(record);

  if (status.status === 'empty') {
    removeThumbnailBadge(hostElement);
    return;
  }

  let badge = hostElement.querySelector(`.${THUMBNAIL_BADGE_CLASS}`);

  if (!badge) {
    badge = document.createElement('div');
    badge.className = THUMBNAIL_BADGE_CLASS;
    hostElement.appendChild(badge);
  }

  hostElement.classList.add(THUMBNAIL_BADGE_HOST_CLASS);
  badge.textContent = status.text;
  badge.dataset.status = status.status;
}

function renderCardWatchToggles(targets) {
  if (!state.settings.watchMarkerEnabled || !supportsCardWatchToggle()) {
    clearAllCardWatchToggles();
    return;
  }

  const activeRows = new Set();

  targets.forEach((target) => {
    const rowElement = findCardWatchToggleRow(target.cardHostElement);

    if (!rowElement) {
      return;
    }

    activeRows.add(rowElement);
    renderCardWatchToggle(rowElement, target, state.watch.recordCache.get(target.bvid) || null);
  });

  document.querySelectorAll(`.${CARD_WATCH_TOGGLE_ROW_CLASS}`).forEach((rowElement) => {
    if (!activeRows.has(rowElement)) {
      removeCardWatchToggle(rowElement);
    }
  });
}

async function renderThumbnailBadges() {
  if (!state.settings.watchMarkerEnabled) {
    clearAllThumbnailBadges();
    clearAllCardWatchToggles();
    return;
  }

  const badgeTargets = collectWatchCardTargets();

  if (badgeTargets.length === 0) {
    clearAllThumbnailBadges();
    clearAllCardWatchToggles();
    return;
  }

  const bvids = badgeTargets.map((target) => target.bvid);
  await ensureCachedWatchRecords(bvids);

  const activeHosts = new Set(badgeTargets.map((target) => target.badgeHostElement));

  badgeTargets.forEach((target) => {
    renderThumbnailBadge(target.badgeHostElement, state.watch.recordCache.get(target.bvid) || null);
  });

  document.querySelectorAll(`.${THUMBNAIL_BADGE_HOST_CLASS}`).forEach((hostElement) => {
    if (!activeHosts.has(hostElement)) {
      removeThumbnailBadge(hostElement);
    }
  });

  renderCardWatchToggles(badgeTargets);
}

function cleanupWatchUi() {
  removeWatchPanel();
  clearAllThumbnailBadges();
  clearAllCardWatchToggles();
  detachVideoListeners();
}

async function applyWatchFeatures() {
  if (!state.settings.watchMarkerEnabled) {
    cleanupWatchUi();
    return;
  }

  ensureWatchPanel();
  attachVideoListeners();
  await renderThumbnailBadges();
}

async function refreshPageFeatures() {
  if (document.readyState !== 'complete') {
    return;
  }

  if (state.isRefreshing) {
    state.needsRefresh = true;
    return;
  }

  state.isRefreshing = true;

  try {
    do {
      state.needsRefresh = false;

      await syncCurrentVideoContext();

      if (state.settings.collectionBoostEnabled && isVideoPage()) {
        ensureCollectionControls();
      } else {
        resetCollectionBoost();
      }

      await applyWatchFeatures();
    } while (state.needsRefresh);
  } finally {
    state.isRefreshing = false;
  }
}

function scheduleRefresh(delay = 120) {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = window.setTimeout(() => {
    void refreshPageFeatures();
  }, delay);
}

function stopBootstrapRefresh() {
  if (state.bootstrapStartTimer) {
    window.clearTimeout(state.bootstrapStartTimer);
    state.bootstrapStartTimer = null;
  }

  if (state.bootstrapTimer) {
    window.clearInterval(state.bootstrapTimer);
    state.bootstrapTimer = null;
  }

  state.bootstrapAttempts = 0;
}

function startBootstrapRefresh(initialDelay = 0) {
  stopBootstrapRefresh();

  const beginRefresh = () => {
    state.bootstrapStartTimer = null;
    scheduleRefresh(0);

    state.bootstrapAttempts = 0;
    state.bootstrapTimer = window.setInterval(() => {
      state.bootstrapAttempts += 1;
      void refreshPageFeatures();

      if (state.bootstrapAttempts >= 16) {
        stopBootstrapRefresh();
      }
    }, 1000);
  };

  if (initialDelay > 0) {
    state.bootstrapStartTimer = window.setTimeout(beginRefresh, initialDelay);
    return;
  }

  beginRefresh();
}

function handleRouteChange() {
  if (location.href === state.lastUrl) {
    return;
  }

  state.lastUrl = location.href;
  startBootstrapRefresh(400);
}

function startRouteWatcher() {
  if (state.routeTimer) {
    return;
  }

  state.routeTimer = window.setInterval(() => {
    handleRouteChange();
  }, 600);
}

function registerRuntimeListeners() {
  extensionApi.runtime.onMessage.addListener((message) => {
    if (!message || typeof message.type !== 'string') {
      return false;
    }

    if (message.type === MESSAGE_TYPES.WATCH_RECORD_UPDATED) {
      const payload = message.payload || {};
      const bvid = normalizeBvid(payload.bvid);

      if (!bvid) {
        return false;
      }

      updateCachedRecord(bvid, payload.record || null);
      startBootstrapRefresh(60);
      return false;
    }

    if (message.type === MESSAGE_TYPES.WATCH_RECORDS_UPDATED) {
      updateCachedRecords((message.payload && message.payload.records) || {});
      startBootstrapRefresh(60);
    }

    return false;
  });

  extensionApi.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[SETTINGS_KEY]) {
      return;
    }

    state.settings = normalizeSettings(changes[SETTINGS_KEY].newValue || {});

    if (!state.settings.collectionBoostEnabled) {
      resetCollectionBoost();
    }

    if (!state.settings.watchMarkerEnabled) {
      cleanupWatchUi();
    }

    startBootstrapRefresh(60);
  });

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('resize', handleWindowResize);
}

async function init() {
  await loadSettings();
  startRouteWatcher();
  registerRuntimeListeners();

  if (document.readyState === 'complete') {
    startBootstrapRefresh(1200);
  } else {
    window.addEventListener('load', () => {
      startBootstrapRefresh(1200);
    }, { once: true });
  }
}

init().catch((error) => {
  console.error('[Bilibili-Boost] 内容脚本初始化失败', error);
});
