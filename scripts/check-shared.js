#!/usr/bin/env node

const assert = require('node:assert/strict');

require('../shared.js');

const shared = globalThis.BilibiliBoostShared;

assert.equal(shared.normalizeBvid('https://www.bilibili.com/video/BV1abcDEF123'), 'BV1ABCDEF123');
assert.equal(shared.parseBvidFromUrl('/list/watchlater?bvid=BV1smRjBoE53', 'https://www.bilibili.com'), 'BV1SMRJBOE53');
assert.equal(shared.clampProgress(98.6), 99);
assert.equal(shared.clampProgress(Number.NaN), 0);
assert.equal(shared.sanitizeCompletionThreshold(88), 90);
assert.equal(shared.sanitizeCompletionThreshold(101), 100);

assert.deepEqual(shared.normalizeSettings({
  watchMarkerEnabled: 0,
  collectionBoostEnabled: 1,
  completionThreshold: '97'
}), {
  watchMarkerEnabled: false,
  collectionBoostEnabled: true,
  completionThreshold: 97
});

const progressRecord = {
  maxProgress: 30,
  lastIncompleteProgress: 20,
  duration: 100,
  lastPosition: 45,
  completed: false
};

assert.equal(shared.getRecordProgress(progressRecord), 45);
assert.equal(shared.isCompletedRecord(progressRecord, 98), false);

const manualCompleteRecord = {
  ...progressRecord,
  maxProgress: 100,
  completed: true,
  completionSource: 'manual'
};

assert.equal(shared.getRecordProgress(manualCompleteRecord), 100);
assert.equal(shared.getRecordIncompleteProgress(manualCompleteRecord), 45);
assert.equal(shared.isCompletedRecord(manualCompleteRecord, 98), true);

const thresholdCompleteRecord = {
  ...progressRecord,
  maxProgress: 100,
  lastIncompleteProgress: 96,
  completed: true,
  completionSource: 'threshold'
};

assert.equal(shared.getRecordProgress(thresholdCompleteRecord), 96);
assert.equal(shared.isCompletedRecord(thresholdCompleteRecord, 98), false);
