/**
 * Bilibili-Boost
 *
 * @author IgniteRan
 * @license MIT
 * @description Bilibili-Boost：增强 Bilibili 浏览体验，支持标记看过与播放列表增强
 *
 * Copyright (c) 2024 IgniteRan
 */

const MESSAGE_TYPES = {
  GET_SETTINGS: 'GET_SETTINGS',
  GET_WATCH_RECORD: 'GET_WATCH_RECORD',
  GET_WATCH_RECORDS: 'GET_WATCH_RECORDS',
  UPSERT_WATCH_PROGRESS: 'UPSERT_WATCH_PROGRESS',
  MARK_WATCHED_COMPLETE: 'MARK_WATCHED_COMPLETE',
  CLEAR_WATCH_RECORD: 'CLEAR_WATCH_RECORD',
  WATCH_RECORD_UPDATED: 'WATCH_RECORD_UPDATED'
};

const SETTINGS_KEY = 'settings';

const DEFAULT_SETTINGS = {
  watchMarkerEnabled: true,
  collectionBoostEnabled: true
};

const PLAYLIST_HEADER_SELECTOR = '.video-sections-head, .video-pod__header';
const VIDEO_LIST_BODY_SELECTOR = '.video-pod__body';
const VIDEO_ITEM_SELECTOR = '.video-pod__item';
const WATCH_PANEL_TARGET_SELECTOR = 'h1.video-title, h1[class*="video-title"], h1[class*="title"], .video-info-title';
const WATCH_PANEL_META_SELECTOR = '.video-info-detail, .video-info-detail-list, .video-meta-container, [class*="video-info-detail"], [class*="video-info-meta"]';
const WATCH_PANEL_META_FALLBACK_SELECTOR = '.pubdate-ip-text, [class*="pubdate"]';
const VIDEO_LINK_SELECTOR = 'a[href*="/video/BV"]';
const CARD_CONTAINER_SELECTOR = '.bili-video-card, .feed-card, .video-card, .small-item, .recommend-video-card, .video-page-card-small, .bili-cover-card, .vui_video_card, .bili-dyn-card-video, .video-pod__item, .list-item';
const CARD_HOST_SELECTOR = '.upload-video-card, upload-video-card, .bili-video-card, bili-video-card, .feed-card, .video-card, .small-item, .recommend-video-card, .video-page-card-small, .bili-cover-card, .vui_video_card, .bili-dyn-card-video, .video-pod__item, .list-item';
const CARD_META_ROW_SELECTOR = '.bili-video-card__info--bottom, .bili-video-card__stats, .video-card__stats, .meta, .bili-video-card__subtitle, [class*="video-card__stats"], [class*="info--bottom"], [class*="info-bottom"], [class*="video-meta"], [class*="subtitle"]';
const CARD_META_TEXT_SELECTOR = '.time, [class*="date"], [class*="pubdate"], [class*="publish"], [class*="time"], [class*="subtitle"]';
const CARD_TITLE_SELECTOR = '.bili-video-card__info--tit, .bili-video-card__title, .title, [class*="title"], [class*="tit"]';

const WATCH_PANEL_ID = 'bb-watch-panel';
const COLLECTION_CONTROLS_CLASS = 'bb-collection-controls';
const THUMBNAIL_BADGE_CLASS = 'bb-watch-badge';
const THUMBNAIL_BADGE_HOST_CLASS = 'bb-watch-badge-host';
const CARD_WATCH_TOGGLE_CLASS = 'bb-watch-card-toggle';
const CARD_WATCH_TOGGLE_ROW_CLASS = 'bb-watch-card-row';
const CARD_WATCH_TOGGLE_ROW_GENERATED_CLASS = 'bb-watch-card-row--generated';

const MIN_VISIBLE_PROGRESS = 5;
const COMPLETE_PROGRESS = 95;
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
    pendingComplete: false
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

  const match = url.match(/\/video\/(BV[0-9A-Za-z]+)/);
  return normalizeBvid(match ? match[1] : '');
}

function clampProgress(progress) {
  const numericValue = Number(progress);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function isVideoPage() {
  return /\/video\/BV[0-9A-Za-z]+/.test(location.href);
}

function isSpacePage() {
  return location.hostname === 'space.bilibili.com';
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

  const progress = clampProgress(record.maxProgress);

  if (record.completed || progress >= COMPLETE_PROGRESS) {
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

async function sendMessage(type, payload) {
  const response = await chrome.runtime.sendMessage({
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
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...(settings || {})
    };
  } catch (error) {
    console.warn('[Bilibili-Boost] 读取设置失败，已回退到默认配置', error);
    state.settings = { ...DEFAULT_SETTINGS };
  }
}

function updateCachedRecord(bvid, record) {
  const normalizedBvid = normalizeBvid(bvid);

  if (!normalizedBvid) {
    return;
  }

  state.watch.recordCache.set(normalizedBvid, record || null);

  if (normalizedBvid === state.watch.currentBvid) {
    state.watch.currentRecord = record || null;
    state.watch.lastSyncedProgress = record ? clampProgress(record.maxProgress) : 0;
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
    state.watch.pendingComplete = false;
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
  state.watch.lastSyncedProgress = state.watch.currentRecord ? clampProgress(state.watch.currentRecord.maxProgress) : 0;
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

async function markCurrentVideoComplete() {
  if (!state.watch.currentBvid) {
    return;
  }

  try {
    await markWatchRecordComplete(state.watch.currentBvid, state.watch.currentTitle);
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

function renderWatchPanel() {
  const panel = document.getElementById(WATCH_PANEL_ID);

  if (!panel) {
    return;
  }

  const statusElement = panel.querySelector('.bb-watch-panel__status');
  const markButton = panel.querySelector('[data-role="mark-complete"]');
  const clearButton = panel.querySelector('[data-role="clear-record"]');
  const status = formatWatchStatus(state.watch.currentRecord);

  if (statusElement) {
    statusElement.textContent = status.text;
    statusElement.dataset.status = status.status;
  }

  if (markButton) {
    markButton.textContent = status.status === 'complete' ? '已标记已看完' : '标记已看完';
    markButton.disabled = status.status === 'complete';
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

function findWatchPanelAnchor() {
  const titleElement = document.querySelector(WATCH_PANEL_TARGET_SELECTOR);

  if (titleElement && titleElement.parentElement) {
    const scopedMeta = titleElement.parentElement.querySelector(WATCH_PANEL_META_SELECTOR);

    if (scopedMeta && scopedMeta !== titleElement) {
      return scopedMeta;
    }

    const scopedFallback = titleElement.parentElement.querySelector(WATCH_PANEL_META_FALLBACK_SELECTOR);

    if (scopedFallback) {
      return scopedFallback.closest(WATCH_PANEL_META_SELECTOR) || scopedFallback.parentElement || scopedFallback;
    }
  }

  const globalMeta = document.querySelector(WATCH_PANEL_META_SELECTOR);

  if (globalMeta) {
    return globalMeta;
  }

  const globalFallback = document.querySelector(WATCH_PANEL_META_FALLBACK_SELECTOR);
  return globalFallback ? globalFallback.parentElement || globalFallback : null;
}

function ensureWatchPanel() {
  if (!state.settings.watchMarkerEnabled || !isVideoPage() || !state.watch.currentBvid) {
    removeWatchPanel();
    return;
  }

  const targetAnchor = findWatchPanelAnchor();

  if (!targetAnchor) {
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

    actions.appendChild(markButton);
    actions.appendChild(clearButton);
    panel.appendChild(statusElement);
    panel.appendChild(actions);
  }

  if (panel.parentElement !== targetAnchor || targetAnchor.lastElementChild !== panel) {
    targetAnchor.appendChild(panel);
  }

  renderWatchPanel();
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
  const existingProgress = state.watch.currentRecord ? clampProgress(state.watch.currentRecord.maxProgress) : 0;
  const maxKnownProgress = Math.max(existingProgress, state.watch.lastSyncedProgress);
  const shouldSyncByProgress = progress >= maxKnownProgress + AUTO_SAVE_PROGRESS_STEP;
  const shouldSyncByTime = progress > state.watch.lastSyncedProgress && now - state.watch.lastSyncAt >= AUTO_SAVE_INTERVAL_MS;
  const shouldComplete = forceComplete || progress >= COMPLETE_PROGRESS;

  if (!forceSync && !shouldComplete && !shouldSyncByProgress && !shouldSyncByTime) {
    return;
  }

  if (state.watch.saveInFlight) {
    state.watch.needsResync = true;
    state.watch.pendingComplete = state.watch.pendingComplete || shouldComplete;
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
      completed: shouldComplete,
      source: 'auto'
    });

    updateCachedRecord(state.watch.currentBvid, record);
    state.watch.lastSyncAt = now;
    state.watch.lastSyncedProgress = record ? clampProgress(record.maxProgress) : progress;
  } catch (error) {
    console.warn('[Bilibili-Boost] 自动保存观看进度失败', error);
  } finally {
    state.watch.saveInFlight = false;

    if (state.watch.needsResync) {
      const pendingComplete = state.watch.pendingComplete;
      state.watch.needsResync = false;
      state.watch.pendingComplete = false;
      void persistWatchProgress(pendingComplete, true);
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

function resolveBadgeHost(anchorElement) {
  return anchorElement.closest(CARD_CONTAINER_SELECTOR) || anchorElement;
}

function resolveCardHost(anchorElement) {
  return anchorElement.closest(CARD_HOST_SELECTOR) || resolveBadgeHost(anchorElement);
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

    const badgeHostElement = resolveBadgeHost(anchorElement);
    const cardHostElement = resolveCardHost(anchorElement);

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
  const normalizedText = normalizeInlineText(text);

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
    ? '取消已看完标记'
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
      await clearWatchRecordByBvid(bvid);
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
  if (!state.settings.watchMarkerEnabled || !isSpacePage()) {
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
  chrome.runtime.onMessage.addListener((message) => {
    if (!message || message.type !== MESSAGE_TYPES.WATCH_RECORD_UPDATED) {
      return false;
    }

    const payload = message.payload || {};
    const bvid = normalizeBvid(payload.bvid);

    if (!bvid) {
      return false;
    }

    updateCachedRecord(bvid, payload.record || null);
    startBootstrapRefresh(60);
    return false;
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[SETTINGS_KEY]) {
      return;
    }

    state.settings = {
      ...DEFAULT_SETTINGS,
      ...(changes[SETTINGS_KEY].newValue || {})
    };

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
