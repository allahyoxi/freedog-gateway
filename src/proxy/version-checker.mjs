import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageJsonPath = path.resolve(__dirname, '../../package.json');

let cachedCheck = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 分钟缓存

export function getLocalVersion() {
  try {
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      return pkg.version || '0.6.1';
    }
  } catch (_) {}
  return '0.6.1';
}

export function compareVersions(remote, local) {
  const rParts = (remote || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const lParts = (local || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);

  for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
    const r = rParts[i] || 0;
    const l = lParts[i] || 0;
    if (r > l) return 1;
    if (r < l) return -1;
  }
  return 0;
}

export async function checkLatestVersion(options = {}) {
  const { force = false, fetchFn = globalThis.fetch } = options;
  const localVer = getLocalVersion();
  const defaultResp = {
    currentVersion: localVer,
    latestVersion: localVer,
    hasUpdate: false,
    updateCommand: 'npx --yes github:allahyoxi/freedog-gateway#main start',
    releaseUrl: 'https://github.com/allahyoxi/freedog-gateway'
  };

  if (!force && cachedCheck && (Date.now() - cachedCheck.timestamp < CACHE_TTL_MS)) {
    return cachedCheck.data;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const res = await fetchFn('https://raw.githubusercontent.com/allahyoxi/freedog-gateway/main/package.json', {
      signal: controller.signal,
      headers: {
        'User-Agent': `freedog-gateway/${localVer}`
      }
    });
    clearTimeout(timer);

    if (res && res.ok) {
      const data = await res.json();
      const remoteVer = data.version || localVer;
      const hasUpdate = compareVersions(remoteVer, localVer) > 0;

      const result = {
        currentVersion: localVer,
        latestVersion: remoteVer,
        hasUpdate,
        updateCommand: 'npx --yes github:allahyoxi/freedog-gateway#main start',
        releaseUrl: 'https://github.com/allahyoxi/freedog-gateway'
      };

      cachedCheck = { timestamp: Date.now(), data: result };
      return result;
    }
  } catch (_) {}

  return defaultResp;
}
