export class UpstreamRouter {
  constructor(radarClient, options = {}) {
    this.radar = radarClient;
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

  getAvailableKey(provider) {
    // 优先从环境变量读取
    const envKey = process.env[`${provider.toUpperCase()}_API_KEY`];
    if (envKey) return envKey;

    const list = this.customKeys[provider] || [];
    return list.length > 0 ? list[0] : null;
  }

  resolveTargetModel(requestedModel) {
    const route = this.radar.getOptimalRoute('coding');
    return {
      route,
      targetModel: route.model,
      baseUrl: route.baseUrl,
      provider: route.provider
    };
  }

  async dispatch(openAIPayload, options = {}) {
    const { targetModel, baseUrl, provider, route } = this.resolveTargetModel(options.requestedModel);
    const apiKey = this.getAvailableKey(provider);

    const payload = {
      ...openAIPayload,
      model: targetModel
    };

    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    // 执行上游请求
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    return {
      response: res,
      route,
      targetModel
    };
  }
}
