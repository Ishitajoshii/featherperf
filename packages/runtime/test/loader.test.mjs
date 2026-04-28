import assert from 'node:assert/strict';
import test from 'node:test';
import { deferModuleEntry } from '../dist/loader.js';

test('deferModuleEntry runs immediately during server rendering', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  let loaded = false;

  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');

  try {
    deferModuleEntry({}, () => {
      loaded = true;
    });
  } finally {
    if (typeof originalWindow !== 'undefined') {
      globalThis.window = originalWindow;
    }

    if (typeof originalDocument !== 'undefined') {
      globalThis.document = originalDocument;
    }
  }

  assert.equal(loaded, true);
});

test('deferModuleEntry waits for post-load and interaction quiet windows before loading', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalPerformance = globalThis.performance;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  let currentTime = 0;
  let loaded = false;
  const scheduledTimeouts = [];
  const listeners = new Map();

  class FakeIntersectionObserver {
    constructor(callback) {
      this.callback = callback;
    }

    observe() {
      this.callback([{ isIntersecting: true }]);
    }

    disconnect() {}
  }

  globalThis.performance = {
    now: () => currentTime
  };

  globalThis.setTimeout = (callback, delay) => {
    scheduledTimeouts.push({ callback, delay });
    return scheduledTimeouts.length;
  };

  globalThis.clearTimeout = () => {};

  globalThis.window = {
    IntersectionObserver: FakeIntersectionObserver,
    addEventListener(eventName, callback) {
      listeners.set(eventName, callback);
    },
    removeEventListener(eventName) {
      listeners.delete(eventName);
    },
    requestAnimationFrame(callback) {
      callback();
      return 1;
    }
  };

  globalThis.document = {
    readyState: 'complete',
    querySelector() {
      return {};
    }
  };

  try {
    deferModuleEntry(
      {
        trigger: '#deferred-panel',
        postLoadDelayMs: 200,
        interactionQuietWindowMs: 100,
        idleTimeoutMs: 0
      },
      () => {
        loaded = true;
      }
    );

    assert.equal(loaded, false);
    assert.equal(scheduledTimeouts.length, 1);
    assert.equal(scheduledTimeouts[0].delay, 200);

    currentTime = 150;
    listeners.get('scroll')?.();

    currentTime = 200;
    scheduledTimeouts.shift().callback();

    assert.equal(loaded, false);
    assert.equal(scheduledTimeouts.length, 1);
    assert.equal(scheduledTimeouts[0].delay, 50);

    currentTime = 250;
    scheduledTimeouts.shift().callback();

    assert.equal(loaded, false);
    assert.equal(scheduledTimeouts.length, 1);

    scheduledTimeouts.shift().callback();
  } finally {
    if (typeof originalWindow !== 'undefined') {
      globalThis.window = originalWindow;
    }

    if (typeof originalDocument !== 'undefined') {
      globalThis.document = originalDocument;
    }

    if (typeof originalPerformance !== 'undefined') {
      globalThis.performance = originalPerformance;
    }

    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }

  assert.equal(loaded, true);
});
