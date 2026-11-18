import { spawn } from 'node:child_process';

export function getClaudeInjectedEnv(options = {}) {
  const port = options.port || 8000;
  const token = options.token || 'freedog-local-token';
  const proxyUrl = `http://127.0.0.1:${port}`;

  return {
    ...process.env,
    ANTHROPIC_BASE_URL: proxyUrl,
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_API_KEY: token,
    CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY: '1',
    CLAUDE_CODE_AUTO_MODE_SERVER: '0',
    CLAUDE_CODE_DISABLE_ADVISOR_TOOL: '1',
    CLAUDE_CODE_AUTO_COMPACT_WINDOW: '190000',
    // 关键黑科技：关闭客户端看门狗超时检测，为下游多 Key 故障转移留足时间
    CLAUDE_ENABLE_STREAM_WATCHDOG: '0',
    CLAUDE_ENABLE_BYTE_WATCHDOG: '0',
    API_FORCE_IDLE_TIMEOUT: '0',
    API_TIMEOUT_MS: '2147483647',
    // 禁用非标错误遥测上报
    DISABLE_FEEDBACK_COMMAND: '1',
    DISABLE_ERROR_REPORTING: '1'
  };
}

export function launchClaudeCode(args = [], options = {}) {
  const env = getClaudeInjectedEnv(options);
  const binary = options.binary || 'claude';

  console.log('====================================================');
  console.log('FreeDog Gateway 正在拉起 Claude Code 终端客户端');
  console.log(`代理网关目标: ${env.ANTHROPIC_BASE_URL}`);
  console.log('已注入参数: Watchdog 拦截已激活 | 429 静默转移缓冲开启');
  console.log('====================================================\n');

  const child = spawn(binary, args, {
    stdio: 'inherit',
    env
  });

  child.on('error', err => {
    if (err.code === 'ENOENT') {
      console.error('\n错误：未在系统 PATH 中找到 claude 命令');
      console.error('请先通过官方方式全局安装：npm install -g @anthropic-ai/claude-code\n');
    } else {
      console.error('\n启动 Claude Code 异常: ' + err.message);
    }
  });

  return child;
}
