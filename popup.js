/**
 * Bilibili-Boost - 控制面板逻辑
 *
 * @author IgniteRan
 * @license MIT
 * Copyright (c) 2024 IgniteRan
 */

const MESSAGE_TYPES = {
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  GET_WATCH_RECORD: 'GET_WATCH_RECORD',
  MARK_WATCHED_COMPLETE: 'MARK_WATCHED_COMPLETE',
  CLEAR_WATCH_RECORD: 'CLEAR_WATCH_RECORD'
};

const elements = {
  watchMarkerToggle: document.getElementById('watch-marker-toggle'),
  collectionBoostToggle: document.getElementById('collection-boost-toggle'),
  currentVideoTip: document.getElementById('current-video-tip'),
  currentVideoCard: document.getElementById('current-video-card'),
  currentVideoTitle: document.getElementById('current-video-title'),
  currentVideoBvid: document.getElementById('current-video-bvid'),
  currentVideoStatus: document.getElementById('current-video-status'),
  markCompleteButton: document.getElementById('mark-complete-button'),
  clearRecordButton: document.getElementById('clear-record-button')
};

let currentVideo = null;

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

function formatWatchStatus(record) {
  if (!record) {
    return {
      text: '未记录',
      status: 'empty'
    };
  }

  if (record.completed || Number(record.maxProgress) >= 95) {
    return {
      text: '已看完',
      status: 'complete'
    };
  }

  const progress = Math.max(0, Math.min(100, Math.round(Number(record.maxProgress) || 0)));

  if (progress < 5) {
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

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tabs[0] || null;
}

function renderCurrentVideoCard(video, record) {
  if (!video || !video.bvid) {
    elements.currentVideoCard.classList.add('video-card--hidden');
    elements.currentVideoTip.textContent = '当前页面不是 Bilibili 视频页。';
    return;
  }

  const status = formatWatchStatus(record);

  elements.currentVideoCard.classList.remove('video-card--hidden');
  elements.currentVideoTip.textContent = '你可以在这里手动标记当前视频。';
  elements.currentVideoTitle.textContent = video.title || '当前视频';
  elements.currentVideoBvid.textContent = video.bvid;
  elements.currentVideoStatus.textContent = status.text;
  elements.currentVideoStatus.dataset.status = status.status;
}

async function refreshCurrentVideoInfo() {
  const currentTab = await getCurrentTab();

  if (!currentTab) {
    renderCurrentVideoCard(null, null);
    return;
  }

  const bvid = parseBvidFromUrl(currentTab.url);

  if (!bvid) {
    renderCurrentVideoCard(null, null);
    return;
  }

  currentVideo = {
    bvid,
    title: currentTab.title || '当前视频'
  };

  const record = await sendMessage(MESSAGE_TYPES.GET_WATCH_RECORD, {
    bvid
  });

  renderCurrentVideoCard(currentVideo, record);
}

async function initializeSettings() {
  const settings = await sendMessage(MESSAGE_TYPES.GET_SETTINGS);

  elements.watchMarkerToggle.checked = Boolean(settings.watchMarkerEnabled);
  elements.collectionBoostToggle.checked = Boolean(settings.collectionBoostEnabled);
}

async function handleSettingToggle(key, value) {
  await sendMessage(MESSAGE_TYPES.UPDATE_SETTINGS, {
    [key]: value
  });
}

async function handleMarkComplete() {
  if (!currentVideo || !currentVideo.bvid) {
    return;
  }

  const record = await sendMessage(MESSAGE_TYPES.MARK_WATCHED_COMPLETE, {
    bvid: currentVideo.bvid,
    title: currentVideo.title
  });

  renderCurrentVideoCard(currentVideo, record);
}

async function handleClearRecord() {
  if (!currentVideo || !currentVideo.bvid) {
    return;
  }

  await sendMessage(MESSAGE_TYPES.CLEAR_WATCH_RECORD, {
    bvid: currentVideo.bvid
  });

  renderCurrentVideoCard(currentVideo, null);
}

async function initializePopup() {
  await initializeSettings();
  await refreshCurrentVideoInfo();

  elements.watchMarkerToggle.addEventListener('change', (event) => {
    void handleSettingToggle('watchMarkerEnabled', event.target.checked);
  });

  elements.collectionBoostToggle.addEventListener('change', (event) => {
    void handleSettingToggle('collectionBoostEnabled', event.target.checked);
  });

  elements.markCompleteButton.addEventListener('click', () => {
    void handleMarkComplete();
  });

  elements.clearRecordButton.addEventListener('click', () => {
    void handleClearRecord();
  });
}

initializePopup().catch((error) => {
  console.error('[Bilibili-Boost] 控制面板初始化失败', error);
  elements.currentVideoTip.textContent = '控制面板初始化失败，请稍后重试。';
});
