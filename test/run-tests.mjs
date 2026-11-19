import assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { RadarClient } from '../src/radar/radar-client.mjs';
import { CostLedger } from '../src/ledger/cost-ledger.mjs';
import { ThinkingPatchManager } from '../src/proxy/thinking-patch.mjs';
import { translateAnthropicToOpenAI } from '../src/proxy/translator.mjs';
import { getClaudeInjectedEnv } from '../src/watchdog/launcher.mjs';
import { RequestLogger } from '../src/proxy/logger.mjs';
import { createGatewayServer } from '../src/proxy/server.mjs';
import { ConfigManager } from '../src/config/config-manager.mjs';

console.log('========================================================');
console.log('正在执行 FreeDog Gateway 核心功能自动化单测套件...');
console.log('========================================================\n');

// 测试 1: 雷达线路与健康度优选
console.log('[Test 1] 验证雷达客户端与最优路由选择算法');
const radar = new RadarClient();
const routes = radar.listRoutes();
assert(routes.length >= 4, '默认雷达线路数量应不少于 4 条');
const optimal = radar.getOptimalRoute('coding');
assert(optimal && optimal.healthScore >= 90, '最优路由健康分应处于优秀水准');
console.log(`  ✓ 成功优选最高分线路: ${optimal.name} [健康分: ${optimal.healthScore}]`);

// 测试 2: 算力账本计算
console.log('\n[Test 2] 验证算力账本与节省额度计算');
const testLedgerFile = '/tmp/freedog-test-ledger.json';
const ledger = new CostLedger({ filePath: testLedgerFile });
const tx = ledger.recordTransaction(100000, 20000, 'Test-Route');
// 100,000 * $3/M = $0.30; 20,000 * $15/M = $0.30; 合计 $0.60
assert(tx.savedThisTimeUsd >= 0.59 && tx.savedThisTimeUsd <= 0.61, '本次节省额度应为 $0.60 左右');
assert(ledger.getSummary().requests >= 1, '累计请求次数应正确自增');
console.log(`  ✓ 账本计算准确: 输入 100k + 输出 20k Token 节省 $${tx.savedThisTimeUsd}`);

// 测试 3: 思维链补丁管理器
console.log('\n[Test 3] 验证思维链签名缓存与会话状态修复');
const thinking = new ThinkingPatchManager();
thinking.storeSignature('sess_123', 'sig_test_abc', 'Thinking about step 1...');
const sig = thinking.getSignature('sess_123');
assert.strictEqual(sig, 'sig_test_abc', '获取的签名必须与缓存一致');

const incomingMsgs = [
  { role: 'user', content: 'Fix this bug' },
  { role: 'assistant', content: [{ type: 'text', text: 'Fixed' }] }
];
const repaired = thinking.repairIncomingMessages(incomingMsgs, 'sess_123');
assert(repaired[1].content.some(c => c.type === 'thinking'), '修复后的助手消息必须补齐 thinking 块');
console.log('  ✓ 成功恢复被客户端剔除的思维签名块');

// 测试 4: Anthropic 到 OpenAI 协议转译
console.log('\n[Test 4] 验证 Messages API 到 OpenAI 协议转译');
const anthropicBody = {
  model: 'claude-3-7-sonnet',
  system: 'You are a senior Rust engineer.',
  messages: [
    { role: 'user', content: 'Run test' },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Running test now' },
        { type: 'tool_use', id: 'tool_call_1', name: 'bash', input: { command: 'cargo test' } }
      ]
    },
    {
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tool_call_1', content: 'test result: ok' }
      ]
    }
  ],
  tools: [
    {
      name: 'bash',
      description: 'Execute command',
      input_schema: { type: 'object', properties: { command: { type: 'string' } } }
    }
  ],
  stream: true
};

const openAIBody = translateAnthropicToOpenAI(anthropicBody);
assert.strictEqual(openAIBody.messages[0].role, 'system', '首条应正确转译为 system 消息');
assert(openAIBody.messages[2].tool_calls.length === 1, '助手消息应包含转译后的 tool_calls');
assert.strictEqual(openAIBody.messages[3].role, 'tool', '用户返回的 tool_result 应转为 tool 角色');
assert(openAIBody.tools.length === 1, '工具声明应正确转为 OpenAI function 结构');
console.log('  ✓ Messages API 与工具调用双向结构转译无损');

// 测试 5: Watchdog 拦截环境变量
console.log('\n[Test 5] 验证看门狗欺骗与超时参数注入');
const env = getClaudeInjectedEnv({ port: 8000 });
assert.strictEqual(env.CLAUDE_ENABLE_STREAM_WATCHDOG, '0', '必须关闭流式看门狗');
assert.strictEqual(env.API_TIMEOUT_MS, '2147483647', '超时应设为极大值以支持故障转移');
assert.strictEqual(env.DISABLE_ERROR_REPORTING, '1', '必须阻断遥测');
console.log('  ✓ 客户端防超时与防断连参数校验通过');

// 测试 6: 审计日志环形缓冲区记录
console.log('\n[Test 6] 验证请求审计日志环形缓冲区功能');
const reqLogger = new RequestLogger(5);
reqLogger.log({
  modelRequested: 'claude-3-7-sonnet',
  modelRouted: 'gemini-2.5-flash',
  provider: 'Google',
  inputTokens: 500,
  outputTokens: 200,
  savingsUsd: 0.0045,
  latencyMs: 320,
  status: 200
});
const recent = reqLogger.getRecentLogs();
assert.strictEqual(recent.length, 1, '应有 1 条已记录的日志');
assert.strictEqual(recent[0].modelRouted, 'gemini-2.5-flash', '记录的路由模型应一致');
console.log('  ✓ 请求审计日志环形缓冲区读写与字段记录正常');

// 测试 7: 本地 WebUI 与控制台服务响应
console.log('\n[Test 7] 验证 WebUI 静态资源与控制台 API 路由');
const testConfigFile = '/tmp/freedog-test-config.json';
const configManager = new ConfigManager(testConfigFile);
const gateway = createGatewayServer({
  radarClient: radar,
  costLedger: ledger,
  logger: reqLogger,
  configManager,
  port: 18099,
  host: '127.0.0.1'
});

// 使用内存 Mock 请求对象直接触发 HTTP 路由调度，避免沙箱网络隔离阻断
function dispatchMockRequest(method, pathname, postBody = null) {
  return new Promise(resolve => {
    const req = new EventEmitter();
    req.method = method;
    req.url = pathname;
    req.headers = { host: '127.0.0.1:18099' };
    req.socket = { remoteAddress: '127.0.0.1' };

    let statusCode = 0;
    let headers = {};
    let responseBody = '';

    const res = {
      setHeader: (k, v) => { headers[k] = v; },
      writeHead: (code, hdrs = {}) => {
        statusCode = code;
        Object.assign(headers, hdrs);
      },
      end: (data = '') => {
        responseBody += data;
        resolve({ statusCode, headers, body: responseBody });
      }
    };

    gateway.server.emit('request', req, res);
    if (postBody) {
      req.emit('data', typeof postBody === 'string' ? postBody : JSON.stringify(postBody));
    }
    req.emit('end');
  });
}

const resHome = await dispatchMockRequest('GET', '/');
assert.strictEqual(resHome.statusCode, 200, '首页状态码应为 200');
assert(resHome.body.includes('Cloud providers'), '首页 HTML 必须包含服务商卡片大厅');

const resConfig = await dispatchMockRequest('GET', '/api/config');
assert.strictEqual(resConfig.statusCode, 200, 'Config 状态码应为 200');
const configJson = JSON.parse(resConfig.body);
assert(Array.isArray(configJson.providers) && configJson.providers.length >= 9, '默认应包含主流服务商模板卡片');

console.log('  ✓ WebUI 静态控制台与渠道管理接口单测通过');

// 测试 8: 网站直达深层挂载与导入
console.log('\n[Test 8] 验证网站一键直达挂载渠道接口');
const importResult = await dispatchMockRequest('POST', '/api/providers/import', {
  name: 'SiliconFlow 硅基流动',
  baseUrl: 'https://api.siliconflow.cn/v1',
  model: 'deepseek-ai/DeepSeek-V3',
  apiKey: 'sk-test-demo',
  description: '由 FreeAI Dog 网站一键装载'
});
assert.strictEqual(importResult.statusCode, 200, '导入状态码应为 200');
const importJson = JSON.parse(importResult.body);
assert.strictEqual(importJson.success, true, '挂载应返回 success');

const updatedConfig = configManager.getConfig();
const imported = updatedConfig.providers.find(p => p.name === 'SiliconFlow 硅基流动');
assert(imported && imported.apiKey === 'sk-test-demo', '导入的渠道与密钥必须持久化至配置库');
console.log('  ✓ 网站一键直达挂载渠道与端点入库无缝验证通过');

// 测试 9: 渠道连通性 Ping 测速与状态码探测接口
console.log('\n[Test 9] 验证渠道连通性 Ping 测速与状态码探测接口');
const pingResult = await dispatchMockRequest('POST', '/api/providers/ping', {
  baseUrl: '',
  apiKey: ''
});
assert.strictEqual(pingResult.statusCode, 200, 'Ping 接口状态码应为 200');
const pingJson = JSON.parse(pingResult.body);
assert.strictEqual(pingJson.success, false, '空 Base URL 应返回校验失败');
assert(pingJson.message.includes('Base URL'), '应提示 Base URL 不能为空');
console.log('  ✓ 渠道连通性 Ping 探测接口校验与响应机制正常');

// 测试 10: 候选路由队列与多渠道 Failover 容灾备份
console.log('\n[Test 10] 验证多渠道 Failover 容灾备份与候选路由生成');
const router = gateway.router;
const candidates = router.resolveCandidates('claude-3-7-sonnet');
assert(Array.isArray(candidates) && candidates.length >= 2, '候选渠道列表应包含首选与备用路由');
assert.strictEqual(candidates[0].providerName, 'SiliconFlow 硅基流动', '首选渠道应优先入选');
console.log(`  ✓ 成功生成 ${candidates.length} 级容灾备份路由链，首选: [${candidates[0].providerName}]`);

// 测试 11: 渠道模型列表动态拉取接口
console.log('\n[Test 11] 验证服务商可用模型列表动态拉取接口');
const fetchModelsResult = await dispatchMockRequest('POST', '/api/providers/fetch-models', {
  baseUrl: '',
  apiKey: ''
});
assert.strictEqual(fetchModelsResult.statusCode, 200, 'Fetch Models 接口状态码应为 200');
const fetchModelsJson = JSON.parse(fetchModelsResult.body);
assert.strictEqual(fetchModelsJson.success, false, '空 Base URL 应返回校验失败');
assert(fetchModelsJson.message.includes('Base URL'), '应提示 Base URL 不能为空');
assert(Array.isArray(fetchModelsJson.models), 'models 字段必须为数组');
console.log('  ✓ 服务商模型列表动态拉取接口校验与结构正常');

console.log('\n========================================================');
console.log('🎉 全部 11 项核心网关机制、测速与动态拉取单测 100% 通过！');
console.log('========================================================\n');
