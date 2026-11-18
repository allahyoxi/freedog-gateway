// 内存近 50 条请求审计日志环形缓冲区
export class RequestLogger {
  constructor(maxEntries = 50) {
    this.maxEntries = maxEntries;
    this.entries = [];
  }

  log(entry) {
    const item = {
      id: 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6),
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      clientIp: entry.clientIp || '127.0.0.1',
      modelRequested: entry.modelRequested || 'claude-3-7-sonnet',
      modelRouted: entry.modelRouted || 'gemini-2.5-flash',
      provider: entry.provider || 'Google',
      inputTokens: entry.inputTokens || 0,
      outputTokens: entry.outputTokens || 0,
      savingsUsd: entry.savingsUsd || 0.0,
      latencyMs: entry.latencyMs || 0,
      status: entry.status || 200,
      error: entry.error || null
    };

    this.entries.unshift(item);
    if (this.entries.length > this.maxEntries) {
      this.entries.pop();
    }
    return item;
  }

  getRecentLogs(limit = 20) {
    return this.entries.slice(0, limit);
  }

  clear() {
    this.entries = [];
  }
}
