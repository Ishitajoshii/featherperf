import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDirectory, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const fixturesRoot = path.join(testDirectory, 'fixtures');
const viteBinPath = path.join(repoRoot, 'node_modules', '.pnpm', 'node_modules', 'vite', 'bin', 'vite.js');

function buildFixture(fixtureName) {
  const fixtureDirectory = path.join(fixturesRoot, fixtureName);
  rmSync(path.join(fixtureDirectory, 'dist'), { recursive: true, force: true });

  try {
    execFileSync(process.execPath, [viteBinPath, 'build'], {
      cwd: fixtureDirectory,
      env: {
        ...process.env,
        CI: '1'
      },
      stdio: 'pipe'
    });

    return fixtureDirectory;
  } catch (error) {
    rmSync(path.join(fixtureDirectory, 'dist'), { recursive: true, force: true });
    throw error;
  }
}

test('vite fixture build preserves the static binding while deferring the motion entry call', () => {
  const workspace = buildFixture('vite-mixed-import');

  try {
    const assetsDirectory = path.join(workspace, 'dist', 'assets');
    const bundleName = readdirSync(assetsDirectory).find((entry) => entry.endsWith('.js'));
    const mainBundlePath = bundleName ? path.join(assetsDirectory, bundleName) : '';

    assert.equal(existsSync(mainBundlePath), true);

    const mainBundle = readFileSync(mainBundlePath, 'utf8');

    assert.match(mainBundle, /deferModuleEntry\(\{/);
    assert.match(mainBundle, /label: "runGalleryMotion from \.\/motion\.js"/);
    assert.match(mainBundle, /root\.dataset\.state = keepWarm\(\)/);
    assert.match(mainBundle, /runGalleryMotion2\("#gallery"\)/);
  } finally {
    rmSync(path.join(workspace, 'dist'), { recursive: true, force: true });
  }
});
