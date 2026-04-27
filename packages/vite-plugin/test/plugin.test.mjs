import assert from 'node:assert/strict';
import test from 'node:test';
import { collectDeferredImportCandidates } from '../dist/ast.js';
import { featherperf } from '../dist/plugin.js';
import { checkSafety } from '../dist/safety.js';
import { transformCode } from '../dist/transform.js';

test('virtual runtime module points at the published runtime package', () => {
  const plugin = featherperf();

  assert.equal(
    plugin.load?.('\0virtual:featherperf-runtime'),
    "export { deferModuleEntry } from '@featherperf/runtime';"
  );
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

test('transformCode skips mixed-binding imports to avoid breaking remaining bindings', () => {
  const code = [
    "import foo, { bar } from './motion';",
    "foo('#gallery');",
    'console.log(bar);'
  ].join('\n');

  const candidates = collectDeferredImportCandidates(code, 'src/page.ts');

  const transformed = transformCode(
    code,
    candidates,
    {}
  );

  assert.equal(transformed, code);
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
