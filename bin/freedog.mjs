#!/usr/bin/env node
import { RadarClient } from '../src/radar/radar-client.mjs';
import { CostLedger } from '../src/ledger/cost-ledger.mjs';
import { createGatewayServer } from '../src/proxy/server.mjs';
import { launchClaudeCode } from '../src/watchdog/launcher.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'help';

function printBanner() {
  console.log('========================================================');
  console.log('  🐾 FreeDog Gateway · 旺财算力网关 [v0.2.0]');
  console.log('  连接 Claude Code 与全网免费模型的自愈型本地路由中心');
  console.log('  官网协同中台: https://freeaidog.com');
  console.log('========================================================');
}

async function handleStart() {
  printBanner();
  const portArgIndex = args.indexOf('--port');
  const port = portArgIndex !== -1 ? parseInt(args[portArgIndex + 1], 10) : 8000;

  console.log('正在初始化雷达探针与算力账本...');
  const radar = new RadarClient();
  const ledger = new CostLedger();

  console.log('正在与 FreeAI Dog 云端同步最新免费模型雷达...');
  const routes = await radar.syncRadar();
  console.log(`已就绪雷达线路: ${routes.length} 条可用免费通道`);

  const optimal = radar.getOptimalRoute('coding');
  console.log(`当前首选主力路由: ${optimal.name} [模型: ${optimal.model}]`);
  console.log(`历史累计节省算力成本: $${ledger.getSummary().savingsUsd} 美元`);

  const gateway = createGatewayServer({
    radarClient: radar,
    costLedger: ledger,
    port
  });

  const { host, port: actualPort } = await gateway.start();
  console.log(`\n✅ FreeDog 网关守护进程已启动: http://${host}:${actualPort}`);
  console.log('端点就绪:');
  console.log(`  - 🖥️  Web 控制台首页: http://${host}:${actualPort}/`);
  console.log(`  - ⚡  Anthropic Messages API: http://${host}:${actualPort}/v1/messages`);
  console.log(`  - 🩺  网关健康探针: http://${host}:${actualPort}/health`);
  console.log(`  - 📡  雷达实时状态: http://${host}:${actualPort}/api/radar`);
  console.log(`  - 📋  审计日志接口: http://${host}:${actualPort}/api/logs`);
  console.log(`  - 💰  累计账本看板: http://${host}:${actualPort}/api/stats\n`);
  console.log('提示：可直接新开终端执行 `freedog claude` 一键接管自主编码。\n');
}

async function handleClaude() {
  const claudeArgs = args.slice(1);
  launchClaudeCode(claudeArgs, { port: 8000 });
}

async function handleRadar() {
  printBanner();
  console.log('正在拉取全网实时免费模型雷达线路...\n');
  const radar = new RadarClient();
  const routes = await radar.syncRadar(true);

  console.log('当前活跃可用的免费编码算力路由表：');
  routes.forEach((r, idx) => {
    console.log(`[${idx + 1}] ${r.name}`);
    console.log(`    服务商: ${r.provider} | 目标模型: ${r.model}`);
    console.log(`    接口格式: ${r.protocol} | 上下文窗口: ${r.contextWindow} tokens`);
    console.log(`    额度说明: ${r.freeQuota} | 健康度得分: ${r.healthScore}`);
    console.log('--------------------------------------------------------');
  });
}

async function handleStatus() {
  printBanner();
  const ledger = new CostLedger();
  const summary = ledger.getSummary();

  console.log('📊 本地算力账本与运行概况：');
  console.log(`  - 累计处理请求数: ${summary.requests} 次`);
  console.log(`  - 累计吞吐 Token: ${summary.totalTokens} tokens [输入: ${summary.inputTokens} / 输出: ${summary.outputTokens}]`);
  console.log(`  - 相比官方 Claude 3.7 节省额度: $${summary.savingsUsd} 美元`);
  console.log(`  - 各渠道分流情况: ${JSON.stringify(summary.routesDistribution)}`);
}

function handleHelp() {
  printBanner();
  console.log('用法: freedog <命令> [选项]\n');
  console.log('可用命令:');
  console.log('  start   启动本地代理网关与 Web 控制台服务 [默认端口: 8000]');
  console.log('  claude  一键注入看门狗拦截环境变量并拉起 Claude Code 客户端');
  console.log('  radar   查询并列出 FreeAI Dog 最新全网免费模型雷达线路');
  console.log('  status  查看本地算力账本节省统计与流量分流概况');
  console.log('\n示例:');
  console.log('  freedog start           # 后台启动网关与 WebUI');
  console.log('  freedog claude          # 一键拉起 Claude Code');
  console.log('  freedog radar           # 查看最新免费模型雷达\n');
}

switch (command) {
  case 'start':
  case 'serve':
    handleStart();
    break;
  case 'claude':
    handleClaude();
    break;
  case 'radar':
    handleRadar();
    break;
  case 'status':
    handleStatus();
    break;
  case 'help':
  default:
    handleHelp();
    break;
}
