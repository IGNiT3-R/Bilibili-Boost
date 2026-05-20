/**
 * Bilibili-Boost - 共享纯函数
 *
 * @author IgniteRan
 * @license MIT
 * Copyright (c) 2024 IgniteRan
 */

(function initBilibiliBoostShared(globalScope) {
  const DEFAULT_COMPLETE_THRESHOLD = 98;
  const COMPLETE_THRESHOLD_MIN = 90;
  const COMPLETE_THRESHOLD_MAX = 100;
  const MAX_INCOMPLETE_PROGRESS = 99;
  const MIN_VISIBLE_PROGRESS = 5;

  const DEFAULT_SETTINGS = {
    watchMarkerEnabled: true,
    collectionBoostEnabled: true,
    completionThreshold: DEFAULT_COMPLETE_THRESHOLD
  };

  function normalizeBvid(rawValue) {
    if (typeof rawValue !== 'string') {
      return '';
    }

    const match = rawValue.toUpperCase().match(/BV[0-9A-Z]+/);
    return match ? match[0] : '';
  }

  function parseBvidFromUrl(url, baseUrl) {
    if (typeof url !== 'string') {
      return '';
    }

    const videoPathMatch = url.match(/\/video\/(BV[0-9A-Za-z]+)/);

    if (videoPathMatch) {
      return normalizeBvid(videoPathMatch[1]);
    }

    try {
      const fallbackBaseUrl = typeof globalScope.location !== 'undefined'
        ? globalScope.location.href
        : undefined;
      const parsedUrl = new URL(url, baseUrl || fallbackBaseUrl);
      const queryBvid = parsedUrl.searchParams.get('bvid');

      if (queryBvid) {
        return normalizeBvid(queryBvid);
      }
    } catch (error) {
      // 非标准 URL 继续走兜底正则。
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

  function getRecordProgress(record) {
    if (!record || typeof record !== 'object') {
      return 0;
    }

    if (record.completed) {
      const completionKind = getRecordCompletionKind(record);

      if (completionKind === 'manual' || completionKind === 'ended') {
        return 100;
      }
    }

    return getRecordIncompleteProgress(record);
  }

  function isCompletedRecord(record, completionThreshold = DEFAULT_COMPLETE_THRESHOLD) {
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

  globalScope.BilibiliBoostShared = {
    DEFAULT_COMPLETE_THRESHOLD,
    COMPLETE_THRESHOLD_MIN,
    COMPLETE_THRESHOLD_MAX,
    MAX_INCOMPLETE_PROGRESS,
    MIN_VISIBLE_PROGRESS,
    DEFAULT_SETTINGS,
    normalizeBvid,
    parseBvidFromUrl,
    clampProgress,
    normalizeTimestamp,
    normalizeNonNegativeInteger,
    sanitizeCompletionThreshold,
    normalizeSettings,
    getRecordPlaybackProgress,
    isPlaybackCompletionAtEnd,
    getRecordCompletionKind,
    getRecordIncompleteProgress,
    getRecordProgress,
    isCompletedRecord
  };
})(globalThis);
