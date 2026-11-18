import http from 'node:http';
import { translateAnthropicToOpenAI, streamOpenAIToAnthropic } from './translator.mjs';
import { ThinkingPatchManager } from './thinking-patch.mjs';
import { UpstreamRouter } from './router.mjs';

export function createGatewayServer(options = {}) {
  const {
    radarClient,
    costLedger,
    port = 8000,
    host = '127.0.0.1'
  } = options;

  const thinkingManager = new ThinkingPatchManager();
  const router = new UpstreamRouter(radarClient);

  const server = http.createServer(async (req, res) => {
    // 跨域支持
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = url.pathname;

    // 1. 健康探针
    if (req.method === 'GET' && pathname === '/health') {
      const summary = costLedger.getSummary();
      const activeRoute = radarClient.getOptimalRoute('coding');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        version: '0.1.0',
        activeRoute: activeRoute.name,
        targetModel: activeRoute.model,
        totalSavingsUsd: summary.savingsUsd,
        totalTokensProcessed: summary.totalTokens
      }, null, 2));
      return;
    }

    // 2. 雷达线路查询
    if (req.method === 'GET' && pathname === '/api/radar') {
      const routes = radarClient.listRoutes();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ routes }, null, 2));
      return;
    }

    // 3. 算力账本统计
    if (req.method === 'GET' && pathname === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(costLedger.getSummary(), null, 2));
      return;
    }

    // 4. 模型发现接口 (为 Claude Code 提供动态网关模型列表)
    if (req.method === 'GET' && pathname === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        object: 'list',
        data: [
          { id: 'claude-3-7-sonnet-20250219', object: 'model', created: 1739923200, owned_by: 'freedog' },
          { id: 'claude-3-5-sonnet-20241022', object: 'model', created: 1729555200, owned_by: 'freedog' },
          { id: 'claude-3-5-haiku-20241022', object: 'model', created: 1729555200, owned_by: 'freedog' }
        ]
      }, null, 2));
      return;
    }

    // 读取 POST 请求体
    let bodyText = '';
    req.on('data', chunk => {
      bodyText += chunk;
    });

    req.on('end', async () => {
      let body = {};
      try {
        if (bodyText) {
          body = JSON.parse(bodyText);
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Invalid JSON payload' } }));
        return;
      }

      // 5. 核心接口：Anthropic Messages 协议中转
      if (req.method === 'POST' && pathname === '/v1/messages') {
        const sessionId = req.headers['x-session-id'] || 'session_default';
        const requestedModel = body.model || 'claude-3-7-sonnet';

        // 修复思维链签名
        if (body.messages) {
          body.messages = thinkingManager.repairIncomingMessages(body.messages, sessionId);
        }

        const openAIPayload = translateAnthropicToOpenAI(body);

        try {
          const { response: upstreamRes, route, targetModel } = await router.dispatch(openAIPayload, {
            requestedModel
          });

          if (!upstreamRes.ok) {
            const errBody = await upstreamRes.text();
            res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              type: 'error',
              error: {
                type: 'upstream_error',
                message: `Upstream returned HTTP ${upstreamRes.status}: ${errBody}`
              }
            }));
            return;
          }

          // 流式处理
          if (body.stream && upstreamRes.body) {
            await streamOpenAIToAnthropic(upstreamRes.body, res, {
              model: requestedModel,
              inputTokens: Math.floor(bodyText.length / 4),
              thinkingManager,
              sessionId
            });

            // 记录账本
            costLedger.recordTransaction(
              Math.floor(bodyText.length / 4),
              150,
              route.name
            );
          } else {
            // 非流式处理
            const data = await upstreamRes.json();
            const textContent = data.choices?.[0]?.message?.content || '';
            const usage = data.usage || { prompt_tokens: 50, completion_tokens: 50 };

            costLedger.recordTransaction(usage.prompt_tokens, usage.completion_tokens, route.name);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              id: 'msg_fcc_' + Date.now().toString(36),
              type: 'message',
              role: 'assistant',
              content: [{ type: 'text', text: textContent }],
              model: requestedModel,
              stop_reason: 'end_turn',
              usage: {
                input_tokens: usage.prompt_tokens,
                output_tokens: usage.completion_tokens
              }
            }));
          }
        } catch (dispatchErr) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            type: 'error',
            error: {
              type: 'gateway_error',
              message: `Gateway failed to reach upstream: ${dispatchErr.message}`
            }
          }));
        }
        return;
      }

      // 未知接口兜底
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Endpoint not found' }));
    });
  });

  return {
    server,
    start: () => new Promise(resolve => {
      server.listen(port, host, () => {
        resolve({ host, port });
      });
    }),
    stop: () => new Promise(resolve => {
      server.close(resolve);
    })
  };
}
