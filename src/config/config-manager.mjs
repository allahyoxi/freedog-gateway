import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.freedog');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export const DEFAULT_PRESET_PROVIDERS = [
  {
    id: 'prov_cerebras',
    name: 'Cerebras',
    icon: 'cerebras',
    enabled: false,
    baseUrl: 'https://api.cerebras.ai/v1',
    apiKey: '',
    model: 'llama-3.3-70b',
    models: ['llama-3.3-70b', 'llama3.1-8b'],
    protocol: 'openai',
    description: '超高吞吐推理引擎 · 极速代码生成'
  },
  {
    id: 'prov_deepseek',
    name: 'DeepSeek',
    icon: 'deepseek',
    enabled: false,
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    protocol: 'openai',
    description: '原厂顶级代码大模型 · 具备强悍系统级推理'
  },
  {
    id: 'prov_gemini',
    name: 'Gemini',
    icon: 'gemini',
    enabled: false,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: '',
    model: 'gemini-2.5-flash',
    models: ['gemini-2.5-flash', 'gemini-2.5-pro'],
    protocol: 'openai',
    description: '100 万超大上下文代码工程重构 · 免费额度高'
  },
  {
    id: 'prov_groq',
    name: 'Groq',
    icon: 'groq',
    enabled: false,
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: '',
    model: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'qwen-2.5-32b'],
    protocol: 'openai',
    description: 'LPUs 毫秒级闪电推理 · 免费层高吞吐'
  },
  {
    id: 'prov_huggingface',
    name: 'Hugging Face',
    icon: 'huggingface',
    enabled: false,
    baseUrl: 'https://router.huggingface.co/hf-inference/v1',
    apiKey: '',
    model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    models: ['Qwen/Qwen2.5-Coder-32B-Instruct', 'deepseek-ai/DeepSeek-V3'],
    protocol: 'openai',
    description: '全球开源模型聚集地 · Serverless 推理端点'
  },
  {
    id: 'prov_mistral',
    name: 'Mistral',
    icon: 'mistral',
    enabled: false,
    baseUrl: 'https://api.mistral.ai/v1',
    apiKey: '',
    model: 'codestral-latest',
    models: ['codestral-latest', 'mistral-large-latest'],
    protocol: 'openai',
    description: 'Codestral 专有代码大模型 · 原生 FIM 支持'
  },
  {
    id: 'prov_nvidia',
    name: 'NVIDIA NIM',
    icon: 'nvidia',
    enabled: false,
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    apiKey: '',
    model: 'meta/llama-3.1-70b-instruct',
    models: ['meta/llama-3.1-70b-instruct', 'deepseek-ai/deepseek-r1'],
    protocol: 'openai',
    description: '英伟达云端微服务 · 企业级高可用推理'
  },
  {
    id: 'prov_opencode',
    name: 'OpenCode Zen',
    icon: 'opencode',
    enabled: false,
    baseUrl: 'https://opencode.ai/zen/v1',
    apiKey: '',
    model: 'deepseek-chat',
    models: ['deepseek-chat', 'qwen-2.5-coder-32b'],
    protocol: 'openai',
    description: '专为编程 Agent 设计的高速路由通道'
  },
  {
    id: 'prov_ollama',
    name: 'Local Ollama',
    icon: 'ollama',
    enabled: false,
    baseUrl: 'http://127.0.0.1:11434/v1',
    apiKey: '',
    model: 'qwen2.5-coder:7b',
    models: ['qwen2.5-coder:7b', 'deepseek-r1:8b'],
    protocol: 'openai',
    description: '纯本地显卡离线运行 · 零注册 · 零隐私泄漏'
  }
];

export class ConfigManager {
  constructor(filePath = CONFIG_FILE) {
    this.filePath = filePath;
    this.dirPath = path.dirname(filePath);
    this.ensureInitialized();
  }

  ensureInitialized() {
    try {
      if (!fs.existsSync(this.dirPath)) {
        fs.mkdirSync(this.dirPath, { recursive: true });
      }
      if (!fs.existsSync(this.filePath)) {
        const initialConfig = {
          version: '0.3.0',
          activeModel: 'claude-3-7-sonnet',
          sonnetProviderId: 'prov_gemini',
          haikuProviderId: 'prov_groq',
          providers: DEFAULT_PRESET_PROVIDERS
        };
        fs.writeFileSync(this.filePath, JSON.stringify(initialConfig, null, 2), 'utf8');
      }
    } catch (err) {}
  }

  getConfig() {
    try {
      this.ensureInitialized();
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);
      if (!Array.isArray(data.providers) || data.providers.length === 0) {
        data.providers = DEFAULT_PRESET_PROVIDERS;
      }
      return data;
    } catch (err) {
      return {
        version: '0.3.0',
        activeModel: 'claude-3-7-sonnet',
        sonnetProviderId: 'prov_gemini',
        haikuProviderId: 'prov_groq',
        providers: DEFAULT_PRESET_PROVIDERS
      };
    }
  }

  saveConfig(data) {
    this.ensureInitialized();
    const configToSave = {
      version: '0.3.0',
      activeModel: data.activeModel || 'claude-3-7-sonnet',
      sonnetProviderId: data.sonnetProviderId || 'prov_gemini',
      haikuProviderId: data.haikuProviderId || 'prov_groq',
      providers: Array.isArray(data.providers) ? data.providers : DEFAULT_PRESET_PROVIDERS
    };
    fs.writeFileSync(this.filePath, JSON.stringify(configToSave, null, 2), 'utf8');
    return configToSave;
  }

  importProvider(incoming) {
    const config = this.getConfig();
    const name = incoming.name || incoming.provider || 'Custom Provider';
    const baseUrl = incoming.baseUrl || incoming.endpoint || 'https://api.openai.com/v1';
    const model = incoming.model || incoming.modelId || 'default-model';

    // 检查是否已有同名或相同端点的渠道
    const existingIndex = config.providers.findIndex(
      p => p.name.toLowerCase() === name.toLowerCase() || p.baseUrl === baseUrl
    );

    let importedId = '';
    if (existingIndex >= 0) {
      config.providers[existingIndex].model = model;
      if (incoming.apiKey) config.providers[existingIndex].apiKey = incoming.apiKey;
      config.providers[existingIndex].enabled = true;
      importedId = config.providers[existingIndex].id;
    } else {
      importedId = `prov_${Date.now().toString(36)}`;
      config.providers.push({
        id: importedId,
        name,
        icon: 'custom',
        enabled: true,
        baseUrl,
        apiKey: incoming.apiKey || '',
        model,
        models: [model],
        protocol: incoming.protocol || 'openai',
        description: incoming.description || '从 FreeAI Dog 社区大厅一键导入'
      });
    }

    this.saveConfig(config);
    return { success: true, providerId: importedId, name, model };
  }
}
