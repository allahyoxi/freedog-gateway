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

  // 解析并返回候选可用渠道列表 [优先首选渠道，后附启用备份渠道及雷达线路]
  resolveCandidates(requestedModel = 'claude-3-7-sonnet') {
    const candidates = [];
    const addedIds = new Set();

    if (this.configManager) {
      const config = this.configManager.getConfig();
      const isHaiku = requestedModel.includes('haiku');
      const targetId = isHaiku ? config.haikuProviderId : config.sonnetProviderId;

      // 1. 首选激活的 Provider
      const primary = (config.providers || []).find(p => p.id === targetId && p.enabled);
      if (primary) {
        candidates.push({
          id: primary.id,
          providerName: primary.name,
          targetModel: primary.model,
          baseUrl: primary.baseUrl,
          protocol: primary.protocol || 'openai',
          apiKey: this.getAvailableKey(primary.name, primary.apiKey),
          isCustom: true
        });
        addedIds.add(primary.id);
      }

      // 2. 其他已启用的备用 Providers [用于 Failover 容灾备份]
      (config.providers || []).forEach(p => {
        if (p.enabled && !addedIds.has(p.id)) {
          candidates.push({
            id: p.id,
            providerName: p.name,
            targetModel: p.model,
            baseUrl: p.baseUrl,
            protocol: p.protocol || 'openai',
            apiKey: this.getAvailableKey(p.name, p.apiKey),
            isCustom: true
          });
          addedIds.add(p.id);
        }
      });
    }

    // 3. 兜底雷达路由 [若无本地已启用渠道]
    const route = this.radar ? this.radar.getOptimalRoute('coding') : null;
    const providerName = route ? route.provider : 'Google';
    const targetModel = route ? route.model : 'gemini-2.5-flash';
    const baseUrl = route ? route.baseUrl : 'https://generativelanguage.googleapis.com/v1beta/openai';

    candidates.push({
      id: 'prov_fallback_radar',
      providerName,
      targetModel,
      baseUrl,
      protocol: 'openai',
      apiKey: this.getAvailableKey(providerName),
      isCustom: false
    });

    return candidates;
  }

  // 保持单目标解析向后兼容
  resolveTarget(requestedModel = 'claude-3-7-sonnet') {
    const list = this.resolveCandidates(requestedModel);
    return list[0];
  }

  // 执行上游代理请求并自动支持 429/5xx 故障转移
  async dispatch(openAIPayload, options = {}) {
    const candidates = this.resolveCandidates(options.requestedModel);
    let lastError = null;
    let lastRes = null;
    let lastRoute = null;
    let lastModel = null;

    const maxAttempts = Math.min(candidates.length, this.retryLimit);

    for (let i = 0; i < maxAttempts; i++) {
      const target = candidates[i];
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

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        lastRes = res;
        lastRoute = { name: target.providerName, provider: target.providerName };
        lastModel = target.targetModel;

        // 如果请求成功，或者属于客户端正常请求错误 [400, 404 等]，直接返回无需 failover
        if (res.ok || (res.status >= 400 && res.status < 429)) {
          return {
            response: res,
            route: lastRoute,
            targetModel: lastModel
          };
        }

        // 如果触发了 429 限流或 5xx 故障，且还有候选渠道，自动故障转移
        if (i < maxAttempts - 1 && (res.status === 429 || res.status >= 500)) {
          const nextTarget = candidates[i + 1];
          console.warn(`[Failover] 渠道 [${target.providerName}] 响应 HTTP ${res.status}，正在自动无缝切换至备用渠道 [${nextTarget.providerName}]...`);
          continue;
        }

        return {
          response: res,
          route: lastRoute,
          targetModel: lastModel
        };
      } catch (err) {
        lastError = err;
        if (i < maxAttempts - 1) {
          const nextTarget = candidates[i + 1];
          console.warn(`[Failover] 渠道 [${target.providerName}] 网络连接中断 (${err.message})，正在自动无缝切换至备用渠道 [${nextTarget.providerName}]...`);
          continue;
        }
      }
    }

    if (lastRes) {
      return {
        response: lastRes,
        route: lastRoute,
        targetModel: lastModel
      };
    }

    throw lastError || new Error('All available upstream providers failed');
  }

  // 1-Token 极简连通性与网络延迟探测
  async testConnection(options = {}) {
    const startTime = Date.now();
    const baseUrl = (options.baseUrl || '').replace(/\/+$/, '');
    const apiKey = (options.apiKey || '').trim();
    const model = (options.model || 'default-model').trim();

    if (!baseUrl) {
      return {
        success: false,
        status: 0,
        latencyMs: 0,
        message: 'Base URL 不能为空'
      };
    }

    let endpoint = `${baseUrl}/chat/completions`;
    if (baseUrl.endsWith('/chat/completions')) {
      endpoint = baseUrl;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false
      });

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;
      const status = res.status;

      if (res.ok) {
        return {
          success: true,
          status,
          latencyMs,
          message: `200 OK · ${latencyMs}ms`
        };
      }

      let detail = '';
      try {
        const json = await res.json();
        if (json.error?.message) {
          detail = json.error.message;
        }
      } catch (e) {
        try {
          const text = await res.text();
          if (text) detail = text.slice(0, 80);
        } catch (e2) {}
      }

      if (status === 401) {
        return {
          success: false,
          status,
          latencyMs,
          message: detail ? `401 密钥失效: ${detail}` : '401 Unauthorized: 密钥无效或未授权'
        };
      }
      if (status === 429) {
        return {
          success: false,
          status,
          latencyMs,
          message: detail ? `429 限流: ${detail}` : '429 Rate Limit: 额度超限或触发频控'
        };
      }
      if (status === 404) {
        return {
          success: false,
          status,
          latencyMs,
          message: detail ? `404: ${detail}` : '404 Not Found: 模型不存在或端点路径错误'
        };
      }

      return {
        success: false,
        status,
        latencyMs,
        message: detail ? `HTTP ${status}: ${detail}` : `HTTP ${status} 异常`
      };
    } catch (err) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      const isTimeout = err.name === 'AbortError';
      return {
        success: false,
        status: 0,
        latencyMs,
        message: isTimeout ? '连接超时 [6s 超时]' : `连接失败: ${err.message}`
      };
    }
  }
}
