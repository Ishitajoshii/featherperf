import assert from 'node:assert/strict';
import test from 'node:test';
import { collectDeferredImportCandidates } from '../dist/ast.js';
import { featherperf } from '../dist/plugin.js';
import { checkSafety } from '../dist/safety.js';
import { transformCode } from '../dist/transform.js';

test('virtual runtime module points at the resolved runtime entry', () => {
  const plugin = featherperf();
  const virtualModule = plugin.load?.('\0virtual:featherperf-runtime');

  assert.equal(typeof virtualModule, 'string');
  assert.match(virtualModule, /export \{ deferModuleEntry \} from "file:\/\/\/.*runtime\/dist\/index\.js";?/i);
});

test('transformCode rewrites a single-binding deferred import', () => {
  const code = [
    "import { runAnimations } from './motion';",
    "runAnimations('#gallery');"
  ].join('\n');

  const candidates = collectDeferredImportCandidates(code, 'src/page.ts');

  const transformed = transformCode(
    code,
    candidates,
    {}
  );

  assert.match(
    transformed,
    /import \{ deferModuleEntry as __featherperfDefer \} from 'virtual:featherperf-runtime';/
  );
  assert.match(transformed, /const \{ runAnimations: runAnimations \} = await import\("\.\/motion"\);/);
  assert.doesNotMatch(transformed, /import \{ runAnimations \} from '\.\/motion';/);
});

test('transformCode preserves remaining bindings when deferring one import from a mixed import line', () => {
  const code = [
    "import { runAnimations, keepWarm } from './motion';",
    "runAnimations('#gallery');",
    'console.log(keepWarm());'
  ].join('\n');

  const candidates = collectDeferredImportCandidates(code, 'src/page.ts');

  const transformed = transformCode(
    code,
    candidates,
    {}
  );

  assert.match(transformed, /import \{ keepWarm \} from "\.\/motion";/);
  assert.match(
    transformed,
    /const \{ runAnimations: runAnimations \} = await import\("\.\/motion"\);/
  );
  assert.doesNotMatch(transformed, /import \{ runAnimations, keepWarm \} from '\.\/motion';/);
});

test('collectDeferredImportCandidates finds aliased imported calls via AST parsing', () => {
  const code = [
    "import { runAnimations as runShowcase } from './motion';",
    '',
    "runShowcase('#gallery');"
  ].join('\n');

  const candidates = collectDeferredImportCandidates(code, 'src/page.ts');

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].binding.localName, 'runShowcase');
  assert.equal(candidates[0].binding.importedName, 'runAnimations');
  assert.equal(candidates[0].triggerArgument, "'#gallery'");
});

test('collectDeferredImportCandidates supports namespace member calls', () => {
  const code = [
    "import * as showcaseMotion from './motion';",
    '',
    "showcaseMotion.runAnimations('#gallery');"
  ].join('\n');

  const candidates = collectDeferredImportCandidates(code, 'src/page.ts');

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].binding.kind, 'namespace');
  assert.equal(candidates[0].binding.localName, 'showcaseMotion');
  assert.equal(candidates[0].callExpressionText, "showcaseMotion.runAnimations('#gallery')");
});

test('transformCode rewrites namespace member calls without changing the member access', () => {
  const code = [
    "import * as showcaseMotion from './motion';",
    "showcaseMotion.runAnimations('#gallery');"
  ].join('\n');

  const candidates = collectDeferredImportCandidates(code, 'src/page.ts');
  const transformed = transformCode(code, candidates, {});

  assert.match(
    transformed,
    /const showcaseMotion = await import\("\.\/motion"\);/
  );
  assert.match(
    transformed,
    /showcaseMotion\.runAnimations\('#gallery'\);/
  );
});

test('checkSafety respects caller-defined critical selectors', () => {
  const code = [
    "import { gsap } from 'gsap';",
    'export function runAnimations(selector) {',
    "  gsap.to(selector, { opacity: 1, duration: 0.2 });",
    '}'
  ].join('\n');

  const result = checkSafety(code, 'D:/app/src/motion.ts', {
    importerId: 'D:/app/src/page.ts',
    triggerArgument: "'#marketing-hero'",
    criticalSelectors: ['#marketing-hero']
  });

  assert.equal(result.isSafeToDefer, false);
  assert.ok(result.reasons.includes('trigger targets a critical or first-paint selector'));
});

test('checkSafety rejects top-level runtime side effects via AST analysis', () => {
  const code = [
    "import { gsap } from 'gsap';",
    "const boot = gsap.timeline();",
    'export function runAnimations(selector) {',
    "  return gsap.to(selector, { opacity: 1, duration: 0.2 });",
    '}'
  ].join('\n');

  const result = checkSafety(code, 'D:/app/src/motion.ts', {
    importerId: 'D:/app/src/page.ts',
    triggerArgument: "'#gallery'"
  });

  assert.equal(result.isSafeToDefer, false);
  assert.ok(result.reasons.includes('contains top-level side effects or control flow'));
});
