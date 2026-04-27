/**
 * Bilibili-Boost - 后台服务脚本
 *
 * @author IgniteRan
 * @license MIT
 * Copyright (c) 2024 IgniteRan
 */

const extensionApi = globalThis.browser || globalThis.chrome;

const DB_NAME = 'bilibili_boost';
const DB_VERSION = 1;
const WATCH_STORE_NAME = 'watch_history';
const SETTINGS_KEY = 'settings';
const EXPORT_SCHEMA_VERSION = 1;
const MIN_VISIBLE_PROGRESS = 5;
const DEFAULT_COMPLETE_THRESHOLD = 98;
const COMPLETE_THRESHOLD_MIN = 90;
const COMPLETE_THRESHOLD_MAX = 100;
const MAX_INCOMPLETE_PROGRESS = 99;

const DEFAULT_SETTINGS = {
  watchMarkerEnabled: true,
  collectionBoostEnabled: true,
  completionThreshold: DEFAULT_COMPLETE_THRESHOLD
};

const MESSAGE_TYPES = {
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  GET_WATCH_RECORD: 'GET_WATCH_RECORD',
  GET_WATCH_RECORDS: 'GET_WATCH_RECORDS',
  EXPORT_WATCH_RECORDS: 'EXPORT_WATCH_RECORDS',
  IMPORT_WATCH_RECORDS: 'IMPORT_WATCH_RECORDS',
  UPSERT_WATCH_PROGRESS: 'UPSERT_WATCH_PROGRESS',
  MARK_WATCHED_COMPLETE: 'MARK_WATCHED_COMPLETE',
  RESTORE_WATCH_RECORD: 'RESTORE_WATCH_RECORD',
  CLEAR_WATCH_RECORD: 'CLEAR_WATCH_RECORD',
  WATCH_RECORD_UPDATED: 'WATCH_RECORD_UPDATED',
  WATCH_RECORDS_UPDATED: 'WATCH_RECORDS_UPDATED'
};

function normalizeBvid(rawValue) {
  if (typeof rawValue !== 'string') {
    return '';
  }

  const match = rawValue.toUpperCase().match(/BV[0-9A-Z]+/);
  return match ? match[0] : '';
}

function clampProgress(progress) {
  const numericValue = Number(progress);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

function normalizeTimestamp(value, fallbackValue) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallbackValue;
  }

  return Math.round(numericValue);
}

function normalizeNonNegativeInteger(value, fallbackValue = 0) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return fallbackValue;
  }

  return Math.round(numericValue);
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

function normalizeSettings(rawSettings) {
  return {
    ...DEFAULT_SETTINGS,
    ...(rawSettings || {}),
    watchMarkerEnabled: rawSettings && Object.prototype.hasOwnProperty.call(rawSettings, 'watchMarkerEnabled')
      ? Boolean(rawSettings.watchMarkerEnabled)
      : DEFAULT_SETTINGS.watchMarkerEnabled,
    collectionBoostEnabled: rawSettings && Object.prototype.hasOwnProperty.call(rawSettings, 'collectionBoostEnabled')
      ? Boolean(rawSettings.collectionBoostEnabled)
      : DEFAULT_SETTINGS.collectionBoostEnabled,
    completionThreshold: sanitizeCompletionThreshold(rawSettings && rawSettings.completionThreshold)
  };
}

function shouldPersistSettings(rawSettings, normalizedSettings) {
  if (!rawSettings || typeof rawSettings !== 'object') {
    return true;
  }

  return (
    Boolean(rawSettings.watchMarkerEnabled) !== Boolean(normalizedSettings.watchMarkerEnabled) ||
    Boolean(rawSettings.collectionBoostEnabled) !== Boolean(normalizedSettings.collectionBoostEnabled) ||
    Number(rawSettings.completionThreshold) !== normalizedSettings.completionThreshold
  );
}

function getRecordPlaybackProgress(record) {
  if (!record || typeof record !== 'object') {
    return 0;
  }

  const duration = normalizeNonNegativeInteger(record.duration, 0);
  const lastPosition = normalizeNonNegativeInteger(record.lastPosition, 0);

  if (duration <= 0 || lastPosition <= 0) {
    return 0;
  }

  return clampProgress((lastPosition / duration) * 100);
}

function isPlaybackCompletionAtEnd(record) {
  if (!record || typeof record !== 'object') {
    return false;
  }

  const duration = normalizeNonNegativeInteger(record.duration, 0);
  const lastPosition = normalizeNonNegativeInteger(record.lastPosition, 0);

  if (duration <= 0 || lastPosition <= 0) {
    return false;
  }

  return lastPosition >= Math.max(duration - 1, 0) || getRecordPlaybackProgress(record) >= 99;
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

function getRecordIncompleteProgress(record) {
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
    if (
      getRecordCompletionKind(record) === 'manual' &&
      storedIncompleteProgress === 0 &&
      playbackProgress === 0
    ) {
      return 0;
    }

    return Math.max(
      storedIncompleteProgress,
      playbackProgress,
      rawMaxProgress >= 100 ? 0 : Math.min(MAX_INCOMPLETE_PROGRESS, rawMaxProgress)
    );
  }

  return Math.max(
    Math.min(MAX_INCOMPLETE_PROGRESS, rawMaxProgress),
    storedIncompleteProgress,
    playbackProgress
  );
}

function isRecordEffectivelyCompleted(record, completionThreshold) {
  if (!record || typeof record !== 'object') {
    return false;
  }

  const threshold = sanitizeCompletionThreshold(completionThreshold);

  if (record.completed) {
    const completionKind = getRecordCompletionKind(record);

    if (completionKind === 'manual' || completionKind === 'ended') {
      return true;
    }
  }

  return getRecordIncompleteProgress(record) >= threshold;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 请求失败'));
  });
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB 事务失败'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB 事务中止'));
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(WATCH_STORE_NAME)) {
        const store = database.createObjectStore(WATCH_STORE_NAME, {
          keyPath: 'bvid'
        });

        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('数据库打开失败'));
  });
}

async function withStore(mode, handler) {
  const database = await openDatabase();

  try {
    const transaction = database.transaction(WATCH_STORE_NAME, mode);
    const store = transaction.objectStore(WATCH_STORE_NAME);
    const result = await handler(store, transaction);

    await transactionToPromise(transaction);
    return result;
  } finally {
    database.close();
  }
}

async function ensureSettings() {
  const data = await extensionApi.storage.local.get(SETTINGS_KEY);
  const rawSettings = data[SETTINGS_KEY];
  const currentSettings = normalizeSettings(rawSettings);

  if (shouldPersistSettings(rawSettings, currentSettings)) {
    await extensionApi.storage.local.set({
      [SETTINGS_KEY]: currentSettings
    });
  }

  return currentSettings;
}

async function getSettings() {
  return ensureSettings();
}

async function updateSettings(patch) {
  const currentSettings = await ensureSettings();
  const nextSettings = normalizeSettings({
    ...currentSettings,
    ...(patch || {})
  });

  await extensionApi.storage.local.set({
    [SETTINGS_KEY]: nextSettings
  });

  return nextSettings;
}

async function getWatchRecord(bvid) {
  const normalizedBvid = normalizeBvid(bvid);

  if (!normalizedBvid) {
    return null;
  }

  return withStore('readonly', async (store) => {
    const result = await requestToPromise(store.get(normalizedBvid));
    return result || null;
  });
}

async function getWatchRecords(bvidList) {
  const normalizedBvids = Array.from(
    new Set((Array.isArray(bvidList) ? bvidList : []).map(normalizeBvid).filter(Boolean))
  );

  if (normalizedBvids.length === 0) {
    return {};
  }

  return withStore('readonly', async (store) => {
    const pairs = await Promise.all(
      normalizedBvids.map(async (bvid) => {
        const record = await requestToPromise(store.get(bvid));
        return [bvid, record || null];
      })
    );

    return Object.fromEntries(pairs);
  });
}

async function getAllWatchRecords() {
  return withStore('readonly', async (store) => {
    const records = await requestToPromise(store.getAll());
    return Array.isArray(records)
      ? records.sort((left, right) => normalizeTimestamp(right && right.updatedAt, 0) - normalizeTimestamp(left && left.updatedAt, 0))
      : [];
  });
}

function buildWatchRecord(existingRecord, payload, completionThreshold) {
  const now = Date.now();
  const existing = existingRecord || null;
  const normalizedBvid = normalizeBvid(payload.bvid);
  const threshold = sanitizeCompletionThreshold(completionThreshold);

  if (!normalizedBvid) {
    throw new Error('无效的 BVID');
  }

  const incomingProgress = clampProgress(payload.progress);
  const incomingDuration = Number(payload.duration);
  const incomingPosition = Number(payload.currentTime);
  const currentTitle = typeof payload.title === 'string' ? payload.title.trim() : '';
  const source = payload.source === 'manual' ? 'manual' : 'auto';
  const existingProgress = existing ? getRecordIncompleteProgress(existing) : 0;
  const existingCompletionKind = getRecordCompletionKind(existing);
  const existingCompleted = Boolean(existing && existing.completed);
  const shouldCompleteByManual = source === 'manual' && Boolean(payload.completed);
  const shouldCompleteByEnded = source !== 'manual' && Boolean(payload.completed);
  const shouldCompleteByThreshold = source !== 'manual' && !payload.completed && incomingProgress >= threshold;
  const shouldComplete = shouldCompleteByManual || shouldCompleteByEnded || shouldCompleteByThreshold;
  const completed = existingCompleted || shouldComplete;
  const nextIncompleteProgress = Math.min(
    MAX_INCOMPLETE_PROGRESS,
    Math.max(
      existingProgress,
      shouldCompleteByManual ? existingProgress : incomingProgress
    )
  );
  const maxProgress = completed
    ? 100
    : Math.min(MAX_INCOMPLETE_PROGRESS, Math.max(existingProgress, incomingProgress));
  const lastIncompleteProgress = completed ? nextIncompleteProgress : maxProgress;
  let completionSource = null;

  if (completed) {
    if (existingCompletionKind === 'manual') {
      completionSource = 'manual';
    } else if (shouldCompleteByManual) {
      completionSource = 'manual';
    } else if (shouldCompleteByEnded) {
      completionSource = 'ended';
    } else if (shouldCompleteByThreshold) {
      completionSource = 'threshold';
    } else {
      completionSource = existingCompletionKind || null;
    }
  }

  return {
    bvid: normalizedBvid,
    title: currentTitle || (existing ? existing.title : ''),
    maxProgress: completed ? 100 : maxProgress,
    completed,
    completedAt: completed ? (existing && existing.completedAt ? existing.completedAt : now) : null,
    lastIncompleteProgress,
    completionSource,
    duration: Number.isFinite(incomingDuration)
      ? Math.max(existing && existing.duration ? existing.duration : 0, Math.round(incomingDuration))
      : (existing ? existing.duration || 0 : 0),
    lastPosition: Number.isFinite(incomingPosition)
      ? Math.max(existing && existing.lastPosition ? existing.lastPosition : 0, Math.round(incomingPosition))
      : (existing ? existing.lastPosition || 0 : 0),
    source,
    firstViewedAt: existing ? existing.firstViewedAt : now,
    updatedAt: now
  };
}

async function saveWatchRecord(payload) {
  const normalizedBvid = normalizeBvid(payload.bvid);

  if (!normalizedBvid) {
    throw new Error('保存记录失败：缺少有效的 BVID');
  }

  const currentRecord = await getWatchRecord(normalizedBvid);
  const settings = await getSettings();
  const nextRecord = buildWatchRecord(currentRecord, {
    ...payload,
    bvid: normalizedBvid
  }, settings.completionThreshold);

  await withStore('readwrite', async (store) => {
    await requestToPromise(store.put(nextRecord));
  });

  await broadcastWatchRecordChanged(normalizedBvid, nextRecord);
  return nextRecord;
}

async function restoreWatchRecord(bvid) {
  const normalizedBvid = normalizeBvid(bvid);

  if (!normalizedBvid) {
    return null;
  }

  const currentRecord = await getWatchRecord(normalizedBvid);
  const settings = await getSettings();

  if (!currentRecord || !isRecordEffectivelyCompleted(currentRecord, settings.completionThreshold)) {
    return currentRecord || null;
  }

  const restoredProgress = Math.min(
    getRecordIncompleteProgress(currentRecord),
    sanitizeCompletionThreshold(settings.completionThreshold) - 1
  );

  if (restoredProgress < MIN_VISIBLE_PROGRESS) {
    return clearWatchRecord(normalizedBvid);
  }

  const now = Date.now();
  const duration = normalizeNonNegativeInteger(currentRecord.duration, 0);
  const restoredPosition = duration > 0
    ? Math.min(duration, Math.round((duration * restoredProgress) / 100))
    : normalizeNonNegativeInteger(currentRecord.lastPosition, 0);
  const restoredRecord = {
    ...currentRecord,
    maxProgress: restoredProgress,
    completed: false,
    completedAt: null,
    lastIncompleteProgress: restoredProgress,
    completionSource: null,
    lastPosition: restoredPosition,
    source: 'manual',
    updatedAt: now
  };

  await withStore('readwrite', async (store) => {
    await requestToPromise(store.put(restoredRecord));
  });

  await broadcastWatchRecordChanged(normalizedBvid, restoredRecord);
  return restoredRecord;
}

async function clearWatchRecord(bvid) {
  const normalizedBvid = normalizeBvid(bvid);

  if (!normalizedBvid) {
    return null;
  }

  await withStore('readwrite', async (store) => {
    await requestToPromise(store.delete(normalizedBvid));
  });

  await broadcastWatchRecordChanged(normalizedBvid, null);
  return null;
}

async function broadcastToBilibiliTabs(message) {
  try {
    const tabs = await extensionApi.tabs.query({
      url: ['*://*.bilibili.com/*']
    });

    await Promise.all(
      tabs.map(async (tab) => {
        if (!tab.id) {
          return;
        }

        try {
          await extensionApi.tabs.sendMessage(tab.id, message);
        } catch (error) {
          // 页面未注入内容脚本时会抛错，这里直接忽略即可。
        }
      })
    );
  } catch (error) {
    throw error;
  }
}

async function broadcastWatchRecordChanged(bvid, record) {
  try {
    await broadcastToBilibiliTabs({
      type: MESSAGE_TYPES.WATCH_RECORD_UPDATED,
      payload: {
        bvid,
        record
      }
    });
  } catch (error) {
    console.warn('[Bilibili-Boost] 广播看过记录更新失败', error);
  }
}

async function broadcastWatchRecordsChanged(records) {
  const normalizedEntries = Object.entries(records || {})
    .map(([bvid, record]) => [normalizeBvid(bvid), record || null])
    .filter(([bvid]) => Boolean(bvid));

  if (normalizedEntries.length === 0) {
    return;
  }

  try {
    await broadcastToBilibiliTabs({
      type: MESSAGE_TYPES.WATCH_RECORDS_UPDATED,
      payload: {
        records: Object.fromEntries(normalizedEntries)
      }
    });
  } catch (error) {
    console.warn('[Bilibili-Boost] 广播批量看过记录更新失败', error);
  }
}

function sanitizeImportedWatchRecord(rawRecord) {
  if (!rawRecord || typeof rawRecord !== 'object') {
    return null;
  }

  const now = Date.now();
  const bvid = normalizeBvid(rawRecord.bvid);

  if (!bvid) {
    return null;
  }

  const rawProgress = clampProgress(rawRecord.maxProgress);
  const completed = Boolean(rawRecord.completed) || rawProgress >= 100;
  const maxProgress = completed ? 100 : rawProgress;
  const rawIncompleteProgress = clampProgress(rawRecord.lastIncompleteProgress);
  const lastIncompleteProgress = completed
    ? Math.min(
      MAX_INCOMPLETE_PROGRESS,
      Math.max(rawIncompleteProgress, rawProgress >= 100 ? 0 : rawProgress)
    )
    : Math.min(MAX_INCOMPLETE_PROGRESS, Math.max(maxProgress, rawIncompleteProgress));
  const updatedAt = normalizeTimestamp(rawRecord.updatedAt, now);
  const firstViewedAt = normalizeTimestamp(rawRecord.firstViewedAt, updatedAt);
  const completedAt = completed
    ? normalizeTimestamp(rawRecord.completedAt, updatedAt)
    : null;
  const completionSource = completed
    ? (
      rawRecord.completionSource === 'manual' ? 'manual'
        : rawRecord.completionSource === 'ended' ? 'ended'
          : rawRecord.completionSource === 'threshold' ? 'threshold'
            : rawRecord.completionSource === 'auto' ? 'auto'
              : null
    )
    : null;

  return {
    bvid,
    title: typeof rawRecord.title === 'string' ? rawRecord.title.trim() : '',
    maxProgress,
    completed,
    completedAt,
    lastIncompleteProgress,
    completionSource,
    duration: normalizeNonNegativeInteger(rawRecord.duration, 0),
    lastPosition: normalizeNonNegativeInteger(rawRecord.lastPosition, 0),
    source: rawRecord.source === 'manual' ? 'manual' : 'auto',
    firstViewedAt,
    updatedAt
  };
}

async function exportWatchRecords() {
  return {
    app: 'Bilibili-Boost',
    version: extensionApi.runtime.getManifest().version,
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    watchRecords: await getAllWatchRecords()
  };
}

async function importWatchRecords(payload) {
  const rawRecords = Array.isArray(payload)
    ? payload
    : Array.isArray(payload && payload.watchRecords)
      ? payload.watchRecords
      : [];
  const uniqueRecords = new Map();

  rawRecords.forEach((rawRecord) => {
    const record = sanitizeImportedWatchRecord(rawRecord);

    if (!record) {
      return;
    }

    const existingRecord = uniqueRecords.get(record.bvid);

    if (!existingRecord || normalizeTimestamp(record.updatedAt, 0) >= normalizeTimestamp(existingRecord.updatedAt, 0)) {
      uniqueRecords.set(record.bvid, record);
    }
  });

  const validRecords = Array.from(uniqueRecords.values());

  if (validRecords.length === 0) {
    throw new Error('导入文件中没有可用的已看记录');
  }

  const appliedRecords = {};

  await withStore('readwrite', async (store) => {
    for (const record of validRecords) {
      const currentRecord = await requestToPromise(store.get(record.bvid));
      const currentUpdatedAt = normalizeTimestamp(currentRecord && currentRecord.updatedAt, 0);
      const nextUpdatedAt = normalizeTimestamp(record.updatedAt, 0);

      if (currentRecord && currentUpdatedAt > nextUpdatedAt) {
        continue;
      }

      await requestToPromise(store.put(record));
      appliedRecords[record.bvid] = record;
    }
  });

  if (Object.keys(appliedRecords).length > 0) {
    await broadcastWatchRecordsChanged(appliedRecords);
  }

  return {
    totalCount: rawRecords.length,
    validCount: validRecords.length,
    appliedCount: Object.keys(appliedRecords).length,
    skippedCount: rawRecords.length - Object.keys(appliedRecords).length
  };
}

extensionApi.runtime.onInstalled.addListener(() => {
  void ensureSettings();
});

extensionApi.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  (async () => {
    switch (message.type) {
      case MESSAGE_TYPES.GET_SETTINGS: {
        sendResponse({
          ok: true,
          data: await getSettings()
        });
        break;
      }

      case MESSAGE_TYPES.UPDATE_SETTINGS: {
        sendResponse({
          ok: true,
          data: await updateSettings(message.payload || {})
        });
        break;
      }

      case MESSAGE_TYPES.GET_WATCH_RECORD: {
        sendResponse({
          ok: true,
          data: await getWatchRecord(message.payload && message.payload.bvid)
        });
        break;
      }

      case MESSAGE_TYPES.GET_WATCH_RECORDS: {
        sendResponse({
          ok: true,
          data: await getWatchRecords(message.payload && message.payload.bvids)
        });
        break;
      }

      case MESSAGE_TYPES.EXPORT_WATCH_RECORDS: {
        sendResponse({
          ok: true,
          data: await exportWatchRecords()
        });
        break;
      }

      case MESSAGE_TYPES.IMPORT_WATCH_RECORDS: {
        sendResponse({
          ok: true,
          data: await importWatchRecords(message.payload)
        });
        break;
      }

      case MESSAGE_TYPES.UPSERT_WATCH_PROGRESS: {
        sendResponse({
          ok: true,
          data: await saveWatchRecord(message.payload || {})
        });
        break;
      }

      case MESSAGE_TYPES.MARK_WATCHED_COMPLETE: {
        sendResponse({
          ok: true,
          data: await saveWatchRecord({
            ...(message.payload || {}),
            completed: true,
            progress: 100,
            source: 'manual'
          })
        });
        break;
      }

      case MESSAGE_TYPES.RESTORE_WATCH_RECORD: {
        sendResponse({
          ok: true,
          data: await restoreWatchRecord(message.payload && message.payload.bvid)
        });
        break;
      }

      case MESSAGE_TYPES.CLEAR_WATCH_RECORD: {
        sendResponse({
          ok: true,
          data: await clearWatchRecord(message.payload && message.payload.bvid)
        });
        break;
      }

      default: {
        sendResponse({
          ok: false,
          error: `未知消息类型：${message.type}`
        });
      }
    }
  })().catch((error) => {
    console.error('[Bilibili-Boost] 后台消息处理失败', error);
    sendResponse({
      ok: false,
      error: error && error.message ? error.message : '后台处理失败'
    });
  });

  return true;
});
