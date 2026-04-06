/**
 * Bilibili-Boost - 后台服务脚本
 *
 * @author IgniteRan
 * @license MIT
 * Copyright (c) 2024 IgniteRan
 */

const DB_NAME = 'bilibili_boost';
const DB_VERSION = 1;
const WATCH_STORE_NAME = 'watch_history';
const SETTINGS_KEY = 'settings';

const DEFAULT_SETTINGS = {
  watchMarkerEnabled: true,
  collectionBoostEnabled: true
};

const MESSAGE_TYPES = {
  GET_SETTINGS: 'GET_SETTINGS',
  UPDATE_SETTINGS: 'UPDATE_SETTINGS',
  GET_WATCH_RECORD: 'GET_WATCH_RECORD',
  GET_WATCH_RECORDS: 'GET_WATCH_RECORDS',
  UPSERT_WATCH_PROGRESS: 'UPSERT_WATCH_PROGRESS',
  MARK_WATCHED_COMPLETE: 'MARK_WATCHED_COMPLETE',
  CLEAR_WATCH_RECORD: 'CLEAR_WATCH_RECORD',
  WATCH_RECORD_UPDATED: 'WATCH_RECORD_UPDATED'
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
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  const currentSettings = {
    ...DEFAULT_SETTINGS,
    ...(data[SETTINGS_KEY] || {})
  };

  if (!data[SETTINGS_KEY]) {
    await chrome.storage.local.set({
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
  const nextSettings = {
    ...currentSettings,
    ...patch
  };

  await chrome.storage.local.set({
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

function buildWatchRecord(existingRecord, payload) {
  const now = Date.now();
  const existing = existingRecord || null;
  const normalizedBvid = normalizeBvid(payload.bvid);

  if (!normalizedBvid) {
    throw new Error('无效的 BVID');
  }

  const incomingProgress = clampProgress(payload.progress);
  const incomingDuration = Number(payload.duration);
  const incomingPosition = Number(payload.currentTime);
  const currentTitle = typeof payload.title === 'string' ? payload.title.trim() : '';
  const source = payload.source === 'manual' ? 'manual' : 'auto';
  const shouldComplete = Boolean(payload.completed) || incomingProgress >= 95;
  const previousProgress = existing ? clampProgress(existing.maxProgress) : 0;
  const maxProgress = shouldComplete ? 100 : Math.max(previousProgress, incomingProgress);
  const completed = Boolean(existing && existing.completed) || shouldComplete || maxProgress >= 95;

  return {
    bvid: normalizedBvid,
    title: currentTitle || (existing ? existing.title : ''),
    maxProgress: completed ? 100 : maxProgress,
    completed,
    completedAt: completed ? (existing && existing.completedAt ? existing.completedAt : now) : null,
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
  const nextRecord = buildWatchRecord(currentRecord, {
    ...payload,
    bvid: normalizedBvid
  });

  await withStore('readwrite', async (store) => {
    await requestToPromise(store.put(nextRecord));
  });

  await broadcastWatchRecordChanged(normalizedBvid, nextRecord);
  return nextRecord;
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

async function broadcastWatchRecordChanged(bvid, record) {
  try {
    const tabs = await chrome.tabs.query({
      url: ['*://*.bilibili.com/*']
    });

    await Promise.all(
      tabs.map(async (tab) => {
        if (!tab.id) {
          return;
        }

        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: MESSAGE_TYPES.WATCH_RECORD_UPDATED,
            payload: {
              bvid,
              record
            }
          });
        } catch (error) {
          // 页面未注入内容脚本时会抛错，这里直接忽略即可。
        }
      })
    );
  } catch (error) {
    console.warn('[Bilibili-Boost] 广播看过记录更新失败', error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void ensureSettings();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
