import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const RADAR_REMOTE_URL = 'https://freeaidog.com/radar-index.json';
const RADAR_CACHE_DIR = path.join(os.homedir(), '.freedog');
const RADAR_CACHE_FILE = path.join(RADAR_CACHE_DIR, 'radar-cache.json');

// 内置兜底高可靠免费雷达线路
const DEFAULT_FALLBACK_ROUTES = [
  {
    id: 'google-gemini-2-5-flash',
    name: 'Google AI Studio · Gemini 2.5 Flash',
    provider: 'Google',
    model: 'gemini-2.5-flash',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    protocol: 'openai',
    contextWindow: 1048576,
    freeQuota: '15 RPM / 1000 RPD 永久免费',
    healthScore: 98,
    status: 'ACTIVE',
    features: ['thinking', 'tools', 'streaming']
  },
  {
    id: 'siliconflow-deepseek-v3',
    name: 'SiliconFlow 硅基流动 · DeepSeek-V3',
    provider: 'SiliconFlow',
    model: 'deepseek-ai/DeepSeek-V3',
    baseUrl: 'https://api.siliconflow.cn/v1',
    protocol: 'openai',
    contextWindow: 65536,
    freeQuota: '新用户注册免费额度',
    healthScore: 95,
    status: 'ACTIVE',
    features: ['tools', 'streaming']
  },
  {
    id: 'groq-llama-3-3-70b',
    name: 'Groq Cloud · Llama-3.3-70B-Versatile',
    provider: 'Groq',
    model: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
    protocol: 'openai',
    contextWindow: 131072,
    freeQuota: '免费层高并发极速推理',
    healthScore: 92,
    status: 'ACTIVE',
    features: ['tools', 'streaming']
  },
  {
    id: 'local-ollama-coder',
    name: 'Local Ollama · 本地 Qwen2.5-Coder',
    provider: 'Ollama',
    model: 'qwen2.5-coder:7b',
    baseUrl: 'http://127.0.0.1:11434/v1',
    protocol: 'openai',
    contextWindow: 32768,
    freeQuota: '纯本地显卡零成本',
    healthScore: 100,
    status: 'STANDBY',
    features: ['tools', 'streaming', 'offline']
  }
];

// 解析远端上下文 Token 规格字符串
function parseContextWindow(ctx) {
  if (typeof ctx === 'number') return ctx;
  if (!ctx) return 32768;
  const str = String(ctx).trim().toLowerCase();
  if (str.endsWith('m')) {
    const val = parseFloat(str.slice(0, -1));
    return Math.round(val * 1048576);
  }
  if (str.endsWith('k')) {
    const val = parseFloat(str.slice(0, -1));
    return Math.round(val * 1024);
  }
  const parsed = parseInt(str, 10);
  return isNaN(parsed) ? 32768 : parsed;
}

// 规范化远端雷达索引条目，统一映射为网关路由结构
function normalizeRemoteRoute(item) {
  if (item.name && item.provider && item.model && item.healthScore) {
    return item;
  }

  const vendor = item.vendor || 'AI';
  const cleanTitle = item.cleanTitle || item.name || 'AI Model';
  const filterStr = item.filterStr || '';

  // 特性标签提取
  const feats = [];
  if (item.isCode || filterStr.includes('coding')) feats.push('coding');
  if (item.isReasoning) feats.push('thinking');
  if (item.isVision) feats.push('vision');
  feats.push('tools');
  feats.push('streaming');

  // 健康分阶梯计算
  let score = 90;
  if (filterStr.includes('tiera')) score = 98;
  else if (filterStr.includes('tierb')) score = 93;
  else if (filterStr.includes('tierc')) score = 86;

  let quota = '官方免费层端点 · 免绑卡';
  if (item.rpm) {
    quota = `${item.rpm} RPM 官方调用速率上限`;
  }

  return {
    id: item.id || `route-${Math.random().toString(36).substring(2, 9)}`,
    name: `${vendor} · ${cleanTitle}`,
    provider: vendor,
    model: cleanTitle,
    baseUrl: item.baseUrl || 'https://api.openai.com/v1',
    protocol: item.protocol || 'openai',
    contextWindow: parseContextWindow(item.context),
    freeQuota: quota,
    healthScore: score,
    status: 'ACTIVE',
    features: feats
  };
}

export class RadarClient {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || RADAR_CACHE_DIR;
    this.cacheFile = options.cacheFile || RADAR_CACHE_FILE;
    this.routes = DEFAULT_FALLBACK_ROUTES;
    this.lastSyncTime = 0;
    this.initCacheDir();
  }

  initCacheDir() {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      if (fs.existsSync(this.cacheFile)) {
        const raw = fs.readFileSync(this.cacheFile, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.routes) && data.routes.length > 0) {
          // 重新标准化加载缓存，确保字段完整
          this.routes = data.routes.map(normalizeRemoteRoute);
          this.lastSyncTime = data.syncedAt || 0;
        }
      }
    } catch (err) {
      // 容错回退使用内置默认线路
    }
  }

  async syncRadar(force = false) {
    const now = Date.now();
    // 默认缓存有效期 30 分钟
    if (!force && now - this.lastSyncTime < 30 * 60 * 1000) {
      return this.routes;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(RADAR_REMOTE_URL, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'FreeDog-Gateway/0.2.0'
        }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const remoteData = await res.json();
        if (Array.isArray(remoteData) && remoteData.length > 0) {
          // 规范化所有远端路由
          const normalized = remoteData.map(normalizeRemoteRoute);

          // 保持内置经过实测的编码主力线路排在最前
          const fallbackIds = new Set(DEFAULT_FALLBACK_ROUTES.map(r => r.id));
          const extraRoutes = normalized.filter(r => !fallbackIds.has(r.id));

          this.routes = [...DEFAULT_FALLBACK_ROUTES, ...extraRoutes];
          this.lastSyncTime = now;

          fs.writeFileSync(
            this.cacheFile,
            JSON.stringify({ syncedAt: now, routes: this.routes }, null, 2),
            'utf8'
          );
        }
      }
    } catch (err) {
      // 网络离线时平滑保活
    }

    return this.routes;
  }

  getOptimalRoute(taskType = 'coding') {
    // 按健康度、上下文窗口与活跃状态排序
    const activeRoutes = this.routes.filter(r => r.status === 'ACTIVE');
    if (activeRoutes.length === 0) {
      return DEFAULT_FALLBACK_ROUTES[0];
    }

    // 默认首选最高评分线路
    activeRoutes.sort((a, b) => (b.healthScore || 0) - (a.healthScore || 0));
    return activeRoutes[0];
  }

  listRoutes() {
    return this.routes;
  }
}
