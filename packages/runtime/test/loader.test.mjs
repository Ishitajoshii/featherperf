import assert from 'node:assert/strict';
import test from 'node:test';
import { initAssetReadiness } from '../dist/assets.js';
import { deferModuleEntry } from '../dist/loader.js';
import { initLottieOptimizer } from '../dist/lottie.js';

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

test('initAssetReadiness marks assets ready after critical images and fonts resolve', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalHtmlImageElement = globalThis.HTMLImageElement;
  const originalCustomEvent = globalThis.CustomEvent;

  const classes = new Set();
  const dispatchedEvents = [];

  class FakeImage {
    complete = true;
    naturalWidth = 120;
    currentSrc = '/hero.webp';
    src = '/hero.webp';
    srcset = '';

    decode() {
      return Promise.resolve();
    }

    addEventListener() {}
    removeEventListener() {}
    querySelectorAll() {
      return [];
    }
    getBoundingClientRect() {
      return { top: 10, left: 10, right: 110, bottom: 110 };
    }
  }

  const image = new FakeImage();

  globalThis.HTMLImageElement = FakeImage;
  globalThis.CustomEvent = class {
    constructor(type) {
      this.type = type;
    }
  };
  globalThis.window = {
    innerHeight: 800,
    innerWidth: 1200,
    setTimeout(callback) {
      callback();
      return 1;
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event.type);
    }
  };
  globalThis.document = {
    readyState: 'complete',
    images: [image],
    fonts: {
      ready: Promise.resolve()
    },
    documentElement: {
      clientHeight: 800,
      clientWidth: 1200,
      dataset: {},
      classList: {
        add(className) {
          classes.add(className);
        },
        remove(className) {
          classes.delete(className);
        }
      }
    },
    querySelectorAll() {
      return [image];
    },
    addEventListener() {}
  };

  try {
    initAssetReadiness({
      revealWhenReady: true,
      maxCriticalWaitMs: 1000,
      prewarmOffscreenAssets: false
    });

    await Promise.resolve();
    await Promise.resolve();
  } finally {
    if (typeof originalWindow !== 'undefined') {
      globalThis.window = originalWindow;
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }

    if (typeof originalDocument !== 'undefined') {
      globalThis.document = originalDocument;
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }

    if (typeof originalHtmlImageElement !== 'undefined') {
      globalThis.HTMLImageElement = originalHtmlImageElement;
    } else {
      Reflect.deleteProperty(globalThis, 'HTMLImageElement');
    }

    if (typeof originalCustomEvent !== 'undefined') {
      globalThis.CustomEvent = originalCustomEvent;
    } else {
      Reflect.deleteProperty(globalThis, 'CustomEvent');
    }
  }

  assert.equal(classes.has('featherperf-assets-loading'), false);
  assert.equal(classes.has('featherperf-assets-ready'), true);
  assert.deepEqual(dispatchedEvents, ['featherperf:assets-ready']);
});

test('initAssetReadiness prewarms near-viewport image and background assets after readiness', async () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalHtmlImageElement = globalThis.HTMLImageElement;
  const originalImage = globalThis.Image;
  const originalCustomEvent = globalThis.CustomEvent;
  const originalMutationObserver = globalThis.MutationObserver;

  const requestedUrls = [];
  const listeners = new Map();

  class FakeElement {
    constructor(backgroundImage = 'none') {
      this.backgroundImage = backgroundImage;
    }

    querySelectorAll() {
      return [];
    }

    getBoundingClientRect() {
      return { top: 100, left: 0, right: 100, bottom: 200, width: 100, height: 100 };
    }
  }

  class FakeImageElement extends FakeElement {
    complete = false;
    naturalWidth = 0;
    currentSrc = '/gallery.webp';
    src = '/gallery.webp';
    srcset = '';
    loading = 'lazy';
    fetchPriority = 'low';

    decode() {
      return Promise.resolve();
    }

    addEventListener(eventName, callback) {
      if (eventName === 'load') {
        callback();
      }
    }

    removeEventListener() {}
  }

  class FakePreloadImage {
    naturalWidth = 120;
    decoding = 'auto';

    set src(value) {
      requestedUrls.push(value);
      this._src = value;
      this.onload?.();
    }

    get src() {
      return this._src;
    }

    decode() {
      return Promise.resolve();
    }
  }

  const image = new FakeImageElement();
  const backgroundElement = new FakeElement('url("/background.webp")');
  const body = new FakeElement();
  body.querySelectorAll = () => [backgroundElement];

  globalThis.HTMLImageElement = FakeImageElement;
  globalThis.Image = FakePreloadImage;
  globalThis.CustomEvent = class {
    constructor(type) {
      this.type = type;
    }
  };
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.window = {
    innerHeight: 800,
    innerWidth: 1200,
    MutationObserver: globalThis.MutationObserver,
    getComputedStyle(element) {
      return {
        backgroundImage: element.backgroundImage ?? 'none',
        borderImageSource: 'none',
        listStyleImage: 'none'
      };
    },
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    setTimeout(callback) {
      callback();
      return 1;
    },
    addEventListener(eventName, callback) {
      listeners.set(eventName, callback);
    },
    dispatchEvent() {}
  };
  globalThis.document = {
    readyState: 'complete',
    baseURI: 'https://example.test/',
    images: [image],
    fonts: {
      ready: Promise.resolve()
    },
    body,
    documentElement: {
      clientHeight: 800,
      clientWidth: 1200,
      backgroundImage: 'none',
      dataset: {},
      classList: {
        add() {},
        remove() {}
      },
      getBoundingClientRect() {
        return { top: 0, left: 0, right: 1200, bottom: 800, width: 1200, height: 800 };
      }
    },
    querySelectorAll() {
      return [];
    },
    addEventListener() {}
  };

  try {
    initAssetReadiness({
      prewarmOffscreenAssets: true,
      prewarmLookaheadPx: 1800,
      idlePreloadDelayMs: 0,
      maxConcurrentPreloads: 2
    });

    await Promise.resolve();
    await Promise.resolve();
  } finally {
    if (typeof originalWindow !== 'undefined') {
      globalThis.window = originalWindow;
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }

    if (typeof originalDocument !== 'undefined') {
      globalThis.document = originalDocument;
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }

    if (typeof originalHtmlImageElement !== 'undefined') {
      globalThis.HTMLImageElement = originalHtmlImageElement;
    } else {
      Reflect.deleteProperty(globalThis, 'HTMLImageElement');
    }

    if (typeof originalImage !== 'undefined') {
      globalThis.Image = originalImage;
    } else {
      Reflect.deleteProperty(globalThis, 'Image');
    }

    if (typeof originalCustomEvent !== 'undefined') {
      globalThis.CustomEvent = originalCustomEvent;
    } else {
      Reflect.deleteProperty(globalThis, 'CustomEvent');
    }

    if (typeof originalMutationObserver !== 'undefined') {
      globalThis.MutationObserver = originalMutationObserver;
    } else {
      Reflect.deleteProperty(globalThis, 'MutationObserver');
    }
  }

  assert.equal(image.loading, 'eager');
  assert.equal(image.fetchPriority, 'auto');
  assert.deepEqual(requestedUrls, ['https://example.test/background.webp']);
});

test('initLottieOptimizer defers offscreen lottie loadAnimation until near viewport', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalPerformance = globalThis.performance;
  const originalIntersectionObserver = globalThis.IntersectionObserver;
  const originalCustomEvent = globalThis.CustomEvent;

  let loadCount = 0;
  let observerCallback;

  class FakeContainer {
    constructor() {
      this.dataset = {};
    }

    matches() {
      return false;
    }

    closest() {
      return null;
    }

    querySelector() {
      return null;
    }

    getBoundingClientRect() {
      return {
        top: 4000,
        left: 0,
        right: 100,
        bottom: 4100
      };
    }
  }

  class FakeIntersectionObserver {
    constructor(callback) {
      observerCallback = callback;
    }

    observe() {}
    disconnect() {}
  }

  const container = new FakeContainer();
  const animation = {
    addEventListener(eventName, callback) {
      if (eventName === 'DOMLoaded') {
        callback();
      }
    },
    removeEventListener() {},
    play() {},
    pause() {}
  };

  globalThis.performance = {
    now: () => 0
  };
  globalThis.CustomEvent = class {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  globalThis.IntersectionObserver = FakeIntersectionObserver;
  globalThis.window = {
    innerHeight: 800,
    innerWidth: 1200,
    IntersectionObserver: FakeIntersectionObserver,
    lottie: {
      loadAnimation() {
        loadCount += 1;
        return animation;
      }
    },
    setTimeout(callback) {
      callback();
      return 1;
    },
    requestAnimationFrame(callback) {
      callback();
      return 1;
    },
    dispatchEvent() {},
    addEventListener() {}
  };
  globalThis.document = {
    documentElement: {
      clientHeight: 800,
      clientWidth: 1200
    },
    querySelectorAll() {
      return [];
    }
  };

  try {
    initLottieOptimizer({
      deferOffscreen: true,
      freezeOffscreen: true,
      lookaheadPx: 600,
      attachTimeoutMs: 0
    });

    const proxy = globalThis.window.lottie.loadAnimation({ container });

    assert.equal(loadCount, 0);

    observerCallback([{ isIntersecting: true }]);

    assert.equal(loadCount, 1);
    assert.equal(typeof proxy.play, 'function');
  } finally {
    if (typeof originalWindow !== 'undefined') {
      globalThis.window = originalWindow;
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }

    if (typeof originalDocument !== 'undefined') {
      globalThis.document = originalDocument;
    } else {
      Reflect.deleteProperty(globalThis, 'document');
    }

    if (typeof originalPerformance !== 'undefined') {
      globalThis.performance = originalPerformance;
    } else {
      Reflect.deleteProperty(globalThis, 'performance');
    }

    if (typeof originalIntersectionObserver !== 'undefined') {
      globalThis.IntersectionObserver = originalIntersectionObserver;
    } else {
      Reflect.deleteProperty(globalThis, 'IntersectionObserver');
    }

    if (typeof originalCustomEvent !== 'undefined') {
      globalThis.CustomEvent = originalCustomEvent;
    } else {
      Reflect.deleteProperty(globalThis, 'CustomEvent');
    }
  }
});
