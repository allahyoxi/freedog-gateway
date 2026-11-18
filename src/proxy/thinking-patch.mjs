// 思考签名与思维链状态补丁管理器
// 解决 Gemini 2.5 Flash 与 DeepSeek-R1 思考签名在 Claude Code 客户端交替轮次丢失的问题

export class ThinkingPatchManager {
  constructor() {
    // 内存会话级签名缓存：sessionId -> { thoughtSignature, lastReasoningText, updatedAt }
    this.sessionCache = new Map();
    this.maxAgeMs = 30 * 60 * 1000; // 30 分钟过期
  }

  cleanExpired() {
    const now = Date.now();
    for (const [key, value] of this.sessionCache.entries()) {
      if (now - value.updatedAt > this.maxAgeMs) {
        this.sessionCache.delete(key);
      }
    }
  }

  storeSignature(sessionId, thoughtSignature, reasoningText = '') {
    if (!sessionId) return;
    this.cleanExpired();
    this.sessionCache.set(sessionId, {
      thoughtSignature,
      reasoningText,
      updatedAt: Date.now()
    });
  }

  getSignature(sessionId) {
    if (!sessionId) return null;
    const entry = this.sessionCache.get(sessionId);
    return entry ? entry.thoughtSignature : null;
  }

  // 为 Anthropic 格式的输出注入思维块
  formatAnthropicThinkingBlock(reasoningContent, signature = null) {
    if (!reasoningContent) return null;
    return {
      type: 'thinking',
      thinking: reasoningContent,
      signature: signature || 'freedog_thinking_sig_' + Date.now().toString(36)
    };
  }

  // 检查入参并回填可能被客户端剥离的思考签名
  repairIncomingMessages(messages, sessionId) {
    if (!Array.isArray(messages)) return messages;
    const cached = this.sessionCache.get(sessionId);
    if (!cached || !cached.thoughtSignature) return messages;

    // 如果最后一条助手消息缺少签名，自动回填
    return messages.map(msg => {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const hasThinking = msg.content.some(c => c.type === 'thinking');
        if (!hasThinking && cached.reasoningText) {
          return {
            ...msg,
            content: [
              this.formatAnthropicThinkingBlock(cached.reasoningText, cached.thoughtSignature),
              ...msg.content
            ]
          };
        }
      }
      return msg;
    });
  }
}
