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
          this.routes = data.routes;
          this.lastSyncTime = data.syncedAt || 0;
        }
      }
    } catch (err) {
      // 容错使用默认内存线路
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
          'User-Agent': 'FreeDog-Gateway/0.1.0'
        }
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const remoteData = await res.json();
        if (Array.isArray(remoteData) && remoteData.length > 0) {
          this.routes = remoteData;
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
