import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(rootDirectory, '.tmp', 'pack');
const pnpmExecPath = process.env.npm_execpath;
const pnpmCommand =
  pnpmExecPath && pnpmExecPath.endsWith('.cjs') ? process.execPath : process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const pnpmArgsPrefix = pnpmExecPath && pnpmExecPath.endsWith('.cjs') ? [pnpmExecPath] : [];
const packages = [
  {
    name: '@featherperf/runtime',
    archivePrefix: 'featherperf-runtime-',
    directory: path.join(rootDirectory, 'packages', 'runtime')
  },
  {
    name: '@featherperf/vite-plugin',
    archivePrefix: 'featherperf-vite-plugin-',
    directory: path.join(rootDirectory, 'packages', 'vite-plugin')
  }
];

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe'
  });
}

function unpackPackageJson(archivePath) {
  const packageJsonText = run('tar', ['-xOf', archivePath, 'package/package.json'], rootDirectory);
  return JSON.parse(packageJsonText);
}

function listArchiveFiles(archivePath) {
  return run('tar', ['-tf', archivePath], rootDirectory)
    .split(/\r?\n/)
    .filter(Boolean);
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

for (const pkg of packages) {
  run(pnpmCommand, [...pnpmArgsPrefix, 'pack', '--pack-destination', outputDirectory], pkg.directory);

  const packageArchives = readdirSync(outputDirectory)
    .filter((entry) => entry.endsWith('.tgz') && entry.startsWith(pkg.archivePrefix))
    .map((entry) => path.join(outputDirectory, entry))
    .sort((left, right) => left.localeCompare(right));
  const archivePath = packageArchives.at(-1);

  assert.ok(archivePath, `missing package archive for ${pkg.name}`);

  const packagedManifest = unpackPackageJson(archivePath);
  const archiveFiles = listArchiveFiles(archivePath);

  assert.equal(packagedManifest.name, pkg.name);
  assert.equal(typeof packagedManifest.main, 'string');
  assert.equal(typeof packagedManifest.types, 'string');
  assert.ok(
    archiveFiles.includes('package/dist/index.js'),
    `${pkg.name} archive is missing dist/index.js`
  );

  const dependencyEntries = Object.entries(packagedManifest.dependencies ?? {});
  for (const [dependencyName, dependencyVersion] of dependencyEntries) {
    assert.doesNotMatch(
      dependencyVersion,
      /^workspace:/,
      `${pkg.name} dependency ${dependencyName} still uses a workspace range`
    );
  }
}

console.log(`verified ${packages.length} package archives in ${outputDirectory}`);
