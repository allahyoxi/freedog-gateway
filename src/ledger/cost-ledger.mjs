import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LEDGER_FILE = path.join(os.homedir(), '.freedog', 'ledger.json');

// 官方 Claude 3.7 Sonnet 基准定价：输入 3 美元 / 百万 tokens，输出 15 美元 / 百万 tokens
const SONNET_INPUT_PRICE_PER_M = 3.0;
const SONNET_OUTPUT_PRICE_PER_M = 15.0;

export class CostLedger {
  constructor(options = {}) {
    this.filePath = options.filePath || LEDGER_FILE;
    this.stats = {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalSavingsUsd: 0.0,
      activeRoutesUsed: {},
      startedAt: Date.now()
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        this.stats = { ...this.stats, ...data };
      }
    } catch (err) {}
  }

  save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.stats, null, 2), 'utf8');
    } catch (err) {}
  }

  recordTransaction(inputTokens, outputTokens, routeName = 'default') {
    const promptTokens = Number(inputTokens) || 0;
    const completionTokens = Number(outputTokens) || 0;

    const inputCost = (promptTokens / 1000000) * SONNET_INPUT_PRICE_PER_M;
    const outputCost = (completionTokens / 1000000) * SONNET_OUTPUT_PRICE_PER_M;
    const sessionSavings = inputCost + outputCost;

    this.stats.totalRequests += 1;
    this.stats.totalInputTokens += promptTokens;
    this.stats.totalOutputTokens += completionTokens;
    this.stats.totalSavingsUsd += sessionSavings;

    this.stats.activeRoutesUsed[routeName] = (this.stats.activeRoutesUsed[routeName] || 0) + 1;
    this.save();

    return {
      promptTokens,
      completionTokens,
      savedThisTimeUsd: Number(sessionSavings.toFixed(4)),
      totalSavedUsd: Number(this.stats.totalSavingsUsd.toFixed(2))
    };
  }

  getSummary() {
    return {
      requests: this.stats.totalRequests,
      inputTokens: this.stats.totalInputTokens,
      outputTokens: this.stats.totalOutputTokens,
      totalTokens: this.stats.totalInputTokens + this.stats.totalOutputTokens,
      savingsUsd: Number(this.stats.totalSavingsUsd.toFixed(2)),
      routesDistribution: this.stats.activeRoutesUsed,
      uptimeSeconds: Math.floor((Date.now() - this.stats.startedAt) / 1000)
    };
  }
}
