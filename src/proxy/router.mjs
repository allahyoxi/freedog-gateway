export class UpstreamRouter {
  constructor(radarClient, options = {}) {
    this.radar = radarClient;
    this.configManager = options.configManager || null;
    this.customKeys = options.keys || {};
    this.retryLimit = options.retryLimit || 3;
  }

  setKey(provider, key) {
    if (!this.customKeys[provider]) {
      this.customKeys[provider] = [];
    }
    if (Array.isArray(key)) {
      this.customKeys[provider] = key;
    } else {
      this.customKeys[provider].push(key);
    }
  }

  getAvailableKey(provider, configuredKey = '') {
    if (configuredKey && configuredKey.trim()) {
      return configuredKey.trim();
    }
    const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
    if (envKey) return envKey;

    const list = this.customKeys[provider] || [];
    return list.length > 0 ? list[0] : null;
  }

  resolveTarget(requestedModel = 'claude-3-7-sonnet') {
    // 优先读取本地配置文件中用户激活的 Providers
    if (this.configManager) {
      const config = this.configManager.getConfig();
      const isHaiku = requestedModel.includes('haiku');
      const targetId = isHaiku ? config.haikuProviderId : config.sonnetProviderId;

      let matchedProvider = (config.providers || []).find(p => p.id === targetId && p.enabled);
      if (!matchedProvider) {
        // 退避匹配任意启用的服务商
        matchedProvider = (config.providers || []).find(p => p.enabled);
      }

      if (matchedProvider) {
        const apiKey = this.getAvailableKey(matchedProvider.name, matchedProvider.apiKey);
        return {
          providerName: matchedProvider.name,
          targetModel: matchedProvider.model,
          baseUrl: matchedProvider.baseUrl,
          protocol: matchedProvider.protocol || 'openai',
          apiKey,
          isCustom: true
        };
      }
    }

    // 默认兜底使用雷达最优活跃线路
    const route = this.radar ? this.radar.getOptimalRoute('coding') : null;
    const providerName = route ? route.provider : 'Google';
    const targetModel = route ? route.model : 'gemini-2.5-flash';
    const baseUrl = route ? route.baseUrl : 'https://generativelanguage.googleapis.com/v1beta/openai';

    return {
      providerName,
      targetModel,
      baseUrl,
      protocol: 'openai',
      apiKey: this.getAvailableKey(providerName),
      isCustom: false
    };
  }

  async dispatch(openAIPayload, options = {}) {
    const target = this.resolveTarget(options.requestedModel);

    const payload = {
      ...openAIPayload,
      model: target.targetModel
    };

    const headers = {
      'Content-Type': 'application/json'
    };
    if (target.apiKey) {
      headers['Authorization'] = `Bearer ${target.apiKey}`;
    }

    const endpoint = `${target.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    // 执行上游代理请求
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    return {
      response: res,
      route: { name: target.providerName, provider: target.providerName },
      targetModel: target.targetModel
    };
  }
}
