#!/usr/bin/env node
import { ConfigManager } from '../src/config/config-manager.mjs';
import { CostLedger } from '../src/ledger/cost-ledger.mjs';
import { createGatewayServer } from '../src/proxy/server.mjs';
import { launchClaudeCode } from '../src/watchdog/launcher.mjs';
import { getLocalVersion, checkLatestVersion } from '../src/proxy/version-checker.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'help';

function printBanner() {
  const ver = getLocalVersion();
  console.log('========================================================');
  console.log(`  🐾 FreeDog Gateway · 旺财算力网关 [v${ver}]`);
  console.log('  连接 Claude Code 与全网免费模型的自愈型本地路由中心');
  console.log('  官网协同中台: https://freeaidog.com');
  console.log('========================================================');
}

async function handleStart() {
  printBanner();
  const portArgIndex = args.indexOf('--port');
  const port = portArgIndex !== -1 ? parseInt(args[portArgIndex + 1], 10) : 8000;

  console.log('正在加载本地服务商配置与算力账本...');
  const configManager = new ConfigManager();
  const ledger = new CostLedger();
  const cfg = configManager.getConfig();

  const activeProviders = (cfg.providers || []).filter(p => p.enabled);
  console.log(`已就绪服务商渠道: ${activeProviders.length} 个启用中 [共 ${cfg.providers.length} 个模版]`);
  console.log(`历史累计节省算力成本: $${ledger.getSummary().savingsUsd} 美元`);

  const gateway = createGatewayServer({
    configManager,
    costLedger: ledger,
    port
  });

  const { host, port: actualPort } = await gateway.start();
  console.log(`\n✅ FreeDog 网关守护进程已极速启动: http://${host}:${actualPort}`);
  console.log('端点就绪:');
  console.log(`  - 🖥️  Web 控制台首页: http://${host}:${actualPort}/`);
  console.log(`  - ⚡  Anthropic Messages API: http://${host}:${actualPort}/v1/messages`);
  console.log(`  - 🩺  网关健康探针: http://${host}:${actualPort}/health`);
  console.log(`  - 🚀  网页直达挂载接口: http://${host}:${actualPort}/api/providers/import`);
  console.log(`  - 📋  审计日志接口: http://${host}:${actualPort}/api/logs`);
  console.log(`  - 💰  累计账本看板: http://${host}:${actualPort}/api/stats\n`);
  console.log('提示：可直接在 Web 控制台配置各服务商，或新开终端执行 `freedog claude` 开启智能编码。\n');

  // 静默异步查询远端最新版本，不阻塞网关冷启动
  checkLatestVersion().then(info => {
    if (info && info.hasUpdate) {
      console.log(`\x1b[36m🚀 发现新版本 v${info.latestVersion} · 当前为 v${info.currentVersion}\x1b[0m`);
      console.log(`\x1b[32m👉 运行 ${info.updateCommand} 即可无缝升级到最新版本！\x1b[0m\n`);
    }
  }).catch(() => {});
}

async function handleClaude() {
  const claudeArgs = args.slice(1);
  launchClaudeCode(claudeArgs, { port: 8000 });
}

async function handleStatus() {
  printBanner();
  const ledger = new CostLedger();
  const summary = ledger.getSummary();
  const configManager = new ConfigManager();
  const cfg = configManager.getConfig();

  console.log('📊 本地算力账本与服务商运行概况：');
  console.log(`  - 累计处理请求数: ${summary.requests} 次`);
  console.log(`  - 累计吞吐 Token: ${summary.totalTokens} tokens [输入: ${summary.inputTokens} / 输出: ${summary.outputTokens}]`);
  console.log(`  - 相比官方 Claude 3.7 节省额度: $${summary.savingsUsd} 美元`);
  console.log(`  - 配置渠道数量: ${cfg.providers.length} 个`);
}

function handleHelp() {
  printBanner();
  console.log('用法: freedog <命令> [选项]\n');
  console.log('可用命令:');
  console.log('  start   启动本地代理网关与 Web 控制台服务 [默认端口: 8000]');
  console.log('  claude  一键注入看门狗拦截环境变量并拉起 Claude Code 客户端');
  console.log('  status  查看本地算力账本节省统计与渠道状态');
  console.log('\n示例:');
  console.log('  freedog start           # 后台启动网关与 Web 控制台');
  console.log('  freedog claude          # 一键拉起 Claude Code\n');
}

switch (command) {
  case 'start':
  case 'serve':
    handleStart();
    break;
  case 'claude':
    handleClaude();
    break;
  case 'status':
    handleStatus();
    break;
  case 'help':
  default:
    handleHelp();
    break;
}
