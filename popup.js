/**
 * Bilibili-Boost - 控制面板逻辑
 *
 * @author IgniteRan
 * @license MIT
 * Copyright (c) 2024 IgniteRan
 */

const extensionApi = globalThis.browser || globalThis.chrome;

const MESSAGE_TYPES = {
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  GET_WATCH_RECORD: 'GET_WATCH_RECORD',
  EXPORT_WATCH_RECORDS: 'EXPORT_WATCH_RECORDS',
  IMPORT_WATCH_RECORDS: 'IMPORT_WATCH_RECORDS',
  MARK_WATCHED_COMPLETE: 'MARK_WATCHED_COMPLETE',
  RESTORE_WATCH_RECORD: 'RESTORE_WATCH_RECORD',
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
  clearRecordButton: document.getElementById('clear-record-button'),
  exportRecordsButton: document.getElementById('export-records-button'),
  importRecordsButton: document.getElementById('import-records-button'),
  importRecordsInput: document.getElementById('import-records-input'),
  dataManagerTip: document.getElementById('data-manager-tip')
};

let currentVideo = null;
let currentVideoRecord = null;

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

function isCompletedRecord(record) {
  return Boolean(record && (record.completed || Number(record.maxProgress) >= 95));
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

async function getCurrentTab() {
  const tabs = await extensionApi.tabs.query({
    active: true,
    currentWindow: true
  });

  return tabs[0] || null;
}

function renderCurrentVideoCard(video, record) {
  currentVideoRecord = record || null;

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
  elements.markCompleteButton.textContent = status.status === 'complete' ? '取消已看完' : '标记已看完';
  elements.clearRecordButton.disabled = !record;
}

async function refreshCurrentVideoInfo() {
  const currentTab = await getCurrentTab();

  if (!currentTab) {
    currentVideo = null;
    renderCurrentVideoCard(null, null);
    return;
  }

  const bvid = parseBvidFromUrl(currentTab.url);

  if (!bvid) {
    currentVideo = null;
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

  const record = isCompletedRecord(currentVideoRecord)
    ? await sendMessage(MESSAGE_TYPES.RESTORE_WATCH_RECORD, {
      bvid: currentVideo.bvid
    })
    : await sendMessage(MESSAGE_TYPES.MARK_WATCHED_COMPLETE, {
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

function setDataManagerTip(text, status = 'idle') {
  elements.dataManagerTip.textContent = text;

  if (status === 'idle') {
    delete elements.dataManagerTip.dataset.status;
    return;
  }

  elements.dataManagerTip.dataset.status = status;
}

function setDataActionLoading(loading) {
  elements.exportRecordsButton.disabled = loading;
  elements.importRecordsButton.disabled = loading;
}

function buildExportFileName() {
  const now = new Date();
  const datePart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timePart = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

  return `bilibili-boost-watch-records-${datePart}-${timePart}.json`;
}

function downloadJsonFile(fileName, content) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = objectUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

async function handleExportRecords() {
  setDataActionLoading(true);
  setDataManagerTip('正在导出已看记录...', 'idle');

  try {
    const exportData = await sendMessage(MESSAGE_TYPES.EXPORT_WATCH_RECORDS);
    const fileName = buildExportFileName();
    downloadJsonFile(fileName, JSON.stringify(exportData, null, 2));

    setDataManagerTip(
      Array.isArray(exportData.watchRecords) && exportData.watchRecords.length > 0
        ? `导出完成，共导出 ${exportData.watchRecords.length} 条记录。`
        : '导出完成，当前没有已看记录，已生成空文件。',
      'success'
    );
  } catch (error) {
    console.error('[Bilibili-Boost] 导出已看记录失败', error);
    setDataManagerTip('导出失败，请稍后重试。', 'error');
  } finally {
    setDataActionLoading(false);
  }
}

async function handleImportRecordsInputChange(event) {
  const input = event.target;
  const file = input.files && input.files[0];

  if (!file) {
    return;
  }

  setDataActionLoading(true);
  setDataManagerTip('正在导入已看记录...', 'idle');

  try {
    const rawText = await file.text();
    const parsedData = JSON.parse(rawText);
    const summary = await sendMessage(MESSAGE_TYPES.IMPORT_WATCH_RECORDS, parsedData);

    await refreshCurrentVideoInfo();
    setDataManagerTip(
      `导入完成：共读取 ${summary.totalCount} 条，写入 ${summary.appliedCount} 条，跳过 ${summary.skippedCount} 条。`,
      'success'
    );
  } catch (error) {
    console.error('[Bilibili-Boost] 导入已看记录失败', error);
    setDataManagerTip(
      error instanceof SyntaxError
        ? '导入失败，文件不是有效的 JSON。'
        : (error && error.message ? `导入失败：${error.message}` : '导入失败，请稍后重试。'),
      'error'
    );
  } finally {
    input.value = '';
    setDataActionLoading(false);
  }
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

  elements.exportRecordsButton.addEventListener('click', () => {
    void handleExportRecords();
  });

  elements.importRecordsButton.addEventListener('click', () => {
    elements.importRecordsInput.value = '';
    elements.importRecordsInput.click();
  });

  elements.importRecordsInput.addEventListener('change', (event) => {
    void handleImportRecordsInputChange(event);
  });
}

initializePopup().catch((error) => {
  console.error('[Bilibili-Boost] 控制面板初始化失败', error);
  elements.currentVideoTip.textContent = '控制面板初始化失败，请稍后重试。';
});
