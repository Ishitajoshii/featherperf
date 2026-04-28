import { createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const hostingRoot = __dirname;
const publicRoot = path.join(hostingRoot, 'public');
const firebaseConfigPath = path.join(hostingRoot, 'firebase.json');

const projectId = process.argv[2] ?? process.env.GOOGLE_CLOUD_PROJECT ?? 'atlas-486911';
const siteId = process.argv[3] ?? process.env.FEATHERPERF_SITE_ID ?? projectId;
const releaseMessage = process.argv[4] ?? `FeatherPerf Benchmark Lab deploy ${new Date().toISOString()}`;

function gcloudAccessToken() {
  const result = spawnSync('cmd.exe', ['/c', 'gcloud.cmd auth print-access-token'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Failed to get gcloud access token');
  }
  return result.stdout.trim();
}

async function listFiles(rootDir, prefix = '') {
  const entries = await readdir(path.join(rootDir, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.posix.join(prefix.replace(/\\/g, '/'), entry.name).replace(/^\/+/, '');
    if (entry.isDirectory()) {
      files.push(...await listFiles(rootDir, relative));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function gzipBuffer(buffer) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const gzip = createGzip();
    gzip.on('data', (chunk) => chunks.push(chunk));
    gzip.on('end', () => resolve(Buffer.concat(chunks)));
    gzip.on('error', reject);
    Readable.from(buffer).pipe(gzip);
  });
}

function hashBuffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function convertHostingConfig(config) {
  const hosting = config.hosting ?? {};
  return {
    headers: Array.isArray(hosting.headers)
      ? hosting.headers.map((header) => ({
          ...(header.source ? { glob: header.source } : {}),
          ...(header.regex ? { regex: header.regex } : {}),
          headers: header.headers ?? {}
        }))
      : undefined,
    redirects: Array.isArray(hosting.redirects)
      ? hosting.redirects.map((redirect) => ({
          ...(redirect.source ? { glob: redirect.source } : {}),
          ...(redirect.regex ? { regex: redirect.regex } : {}),
          location: redirect.destination,
          statusCode: redirect.type ?? redirect.statusCode ?? 301
        }))
      : undefined,
    rewrites: Array.isArray(hosting.rewrites)
      ? hosting.rewrites.map((rewrite) => ({
          ...(rewrite.source ? { glob: rewrite.source } : {}),
          ...(rewrite.regex ? { regex: rewrite.regex } : {}),
          ...(rewrite.destination ? { path: rewrite.destination } : {}),
          ...(rewrite.run ? { run: rewrite.run } : {}),
          ...(rewrite.function ? { function: rewrite.function } : {})
        }))
      : undefined,
    cleanUrls: hosting.cleanUrls,
    trailingSlashBehavior: hosting.trailingSlash ? 'ADD' : undefined,
    i18n: hosting.i18n
  };
}

function omitUndefined(value) {
  if (Array.isArray(value)) {
    return value.map(omitUndefined);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, omitUndefined(entry)])
    );
  }
  return value;
}

async function apiRequest(url, { method = 'GET', token, body, contentType = 'application/json' } = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    'x-goog-user-project': projectId
  };

  if (body !== undefined && contentType) {
    headers['Content-Type'] = contentType;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body
  });

  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status} ${await response.text()}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function uploadBinary(url, token, buffer) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'x-goog-user-project': projectId
    },
    body: buffer
  });

  if (!response.ok) {
    throw new Error(`POST ${url} failed: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const token = gcloudAccessToken();
  const firebaseConfig = JSON.parse((await readFile(firebaseConfigPath, 'utf8')).replace(/^\uFEFF/, '')); 
  const servingConfig = omitUndefined(convertHostingConfig(firebaseConfig));
  const relativeFiles = await listFiles(publicRoot);

  if (relativeFiles.length === 0) {
    throw new Error(`No files found under ${publicRoot}`);
  }

  const preparedFiles = [];
  const fileMap = {};
  const uploadsByHash = new Map();

  for (const relativeFile of relativeFiles) {
    const absolutePath = path.join(publicRoot, relativeFile);
    const raw = await readFile(absolutePath);
    const gzipped = await gzipBuffer(raw);
    const hash = hashBuffer(gzipped);
    const hostingPath = `/${relativeFile.replace(/\\/g, '/')}`;
    preparedFiles.push({ relativeFile, absolutePath, hostingPath, hash, gzipped });
    fileMap[hostingPath] = hash;
    if (!uploadsByHash.has(hash)) {
      uploadsByHash.set(hash, gzipped);
    }
  }

  const version = await apiRequest(`https://firebasehosting.googleapis.com/v1beta1/sites/${siteId}/versions`, {
    method: 'POST',
    token,
    body: { config: servingConfig, labels: { tool: 'featherperf', surface: 'benchmark-lab' } }
  });

  const populated = await apiRequest(`https://firebasehosting.googleapis.com/v1beta1/${version.name}:populateFiles`, {
    method: 'POST',
    token,
    body: { files: fileMap }
  });

  for (const hash of populated.uploadRequiredHashes ?? []) {
    const uploadBuffer = uploadsByHash.get(hash);
    if (!uploadBuffer) {
      throw new Error(`Missing upload buffer for hash ${hash}`);
    }
    await uploadBinary(`${populated.uploadUrl}/${hash}`, token, uploadBuffer);
  }

  await apiRequest(`https://firebasehosting.googleapis.com/v1beta1/${version.name}?update_mask=status`, {
    method: 'PATCH',
    token,
    body: { status: 'FINALIZED' }
  });

  const release = await apiRequest(`https://firebasehosting.googleapis.com/v1beta1/sites/${siteId}/releases?versionName=${encodeURIComponent(version.name)}`, {
    method: 'POST',
    token,
    body: { message: releaseMessage }
  });

  const summary = {
    projectId,
    siteId,
    releaseName: release?.name ?? null,
    releaseTime: release?.releaseTime ?? null,
    versionName: version.name,
    fileCount: preparedFiles.length,
    urls: {
      webApp: `https://${siteId}.web.app/`,
      firebaseApp: `https://${siteId}.firebaseapp.com/`
    }
  };

  await writeFile(path.join(hostingRoot, 'last-hosting-release.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
