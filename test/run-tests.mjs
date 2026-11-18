import assert from 'node:assert';
import { RadarClient } from '../src/radar/radar-client.mjs';
import { CostLedger } from '../src/ledger/cost-ledger.mjs';
import { ThinkingPatchManager } from '../src/proxy/thinking-patch.mjs';
import { translateAnthropicToOpenAI } from '../src/proxy/translator.mjs';
import { getClaudeInjectedEnv } from '../src/watchdog/launcher.mjs';

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

console.log('\n========================================================');
console.log('🎉 全部 5 项核心机制单测 100% 通过！');
console.log('========================================================\n');
