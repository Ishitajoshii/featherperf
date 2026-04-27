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
