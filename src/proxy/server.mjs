import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { translateAnthropicToOpenAI, streamOpenAIToAnthropic } from './translator.mjs';
import { ThinkingPatchManager } from './thinking-patch.mjs';
import { UpstreamRouter } from './router.mjs';
import { RequestLogger } from './logger.mjs';
import { ConfigManager } from '../config/config-manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dashboardHtmlPath = path.resolve(__dirname, '../dashboard/index.html');

export function createGatewayServer(options = {}) {
  const {
    radarClient,
    costLedger,
    logger = new RequestLogger(),
    configManager = new ConfigManager(),
    port = 8000,
    host = '127.0.0.1'
  } = options;

  const thinkingManager = new ThinkingPatchManager();
  const router = new UpstreamRouter(radarClient, { configManager });

  const server = http.createServer(async (req, res) => {
    // 跨域支持，允许从 freeaidog.com 网站直接探测与唤醒本地网关
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

    // 0. Web 控制台主页
    if (req.method === 'GET' && (pathname === '/' || pathname === '/dashboard')) {
      try {
        if (fs.existsSync(dashboardHtmlPath)) {
          const html = fs.readFileSync(dashboardHtmlPath, 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return;
        }
      } catch (err) {}
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>FreeDog Gateway</h1><p>Dashboard file loading error.</p>');
      return;
    }

    // 0.1 网站直达深层唤醒挂载接口 [GET 方式便于浏览器链接跳转]
    if (req.method === 'GET' && pathname === '/api/import') {
      const name = url.searchParams.get('name') || 'Custom Provider';
      const baseUrl = url.searchParams.get('baseUrl') || '';
      const model = url.searchParams.get('model') || '';
      const apiKey = url.searchParams.get('apiKey') || '';
      const protocol = url.searchParams.get('protocol') || 'openai';

      if (baseUrl && model) {
        configManager.importProvider({ name, baseUrl, model, apiKey, protocol });
      }

      // 重定向回控制台首页并携带导入标识
      res.writeHead(302, { Location: `/?imported=1&name=${encodeURIComponent(name)}` });
      res.end();
      return;
    }

    // 1. 健康探针 [用于主站 freeaidog.com 一键探测用户本地网关是否在线]
    if (req.method === 'GET' && pathname === '/health') {
      const summary = costLedger.getSummary();
      const cfg = configManager.getConfig();
      const target = router.resolveTarget('claude-3-7-sonnet');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        app: 'freedog-gateway',
        version: '0.3.0',
        activeProvider: target.providerName,
        targetModel: target.targetModel,
        totalSavingsUsd: summary.savingsUsd,
        totalTokensProcessed: summary.totalTokens,
        providersCount: (cfg.providers || []).length
      }, null, 2));
      return;
    }

    // 2. 算力账本统计
    if (req.method === 'GET' && pathname === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(costLedger.getSummary(), null, 2));
      return;
    }

    // 3. 审计日志查询接口
    if (req.method === 'GET' && pathname === '/api/logs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ logs: logger.getRecentLogs(50) }, null, 2));
      return;
    }

    // 4. 配置读取接口
    if (req.method === 'GET' && pathname === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(configManager.getConfig(), null, 2));
      return;
    }

    // 5. 模型发现接口 [为 Claude Code 客户端提供模型握手]
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

      // 6. 配置保存接口
      if (req.method === 'POST' && pathname === '/api/config') {
        try {
          const saved = configManager.saveConfig(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, config: saved }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      // 7. 网站远程一键挂载渠道接口 [POST 方式由前端 fetch 触发]
      if (req.method === 'POST' && pathname === '/api/providers/import') {
        try {
          const result = configManager.importProvider(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      // 7.1 渠道即时连通性与网络延迟测速接口 [POST 方式由前端控制台触发]
      if (req.method === 'POST' && pathname === '/api/providers/ping') {
        try {
          let testTarget = body;
          // 若传入的是已有渠道的 ID，直接从配置中读取参数
          if (body.providerId || body.id) {
            const targetId = body.providerId || body.id;
            const cfg = configManager.getConfig();
            const p = (cfg.providers || []).find(item => item.id === targetId);
            if (p) {
              testTarget = {
                baseUrl: p.baseUrl,
                apiKey: p.apiKey,
                model: p.model,
                protocol: p.protocol
              };
            }
          }

          const result = await router.testConnection(testTarget);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      // 7.2 服务商模型动态拉取接口 [POST 方式由前端控制台触发]
      if (req.method === 'POST' && pathname === '/api/providers/fetch-models') {
        try {
          let testTarget = body;
          let targetId = body.providerId || body.id;
          if (targetId) {
            const cfg = configManager.getConfig();
            const p = (cfg.providers || []).find(item => item.id === targetId);
            if (p) {
              testTarget = {
                baseUrl: body.baseUrl || p.baseUrl,
                apiKey: body.apiKey !== undefined ? body.apiKey : p.apiKey,
                protocol: body.protocol || p.protocol
              };
            }
          }

          const result = await router.fetchModels(testTarget);

          // 若拉取成功且指定了渠道 ID，自动将模型列表存入配置库中的 models 数组
          if (result.success && targetId && Array.isArray(result.models) && result.models.length > 0) {
            try {
              const cfg = configManager.getConfig();
              const p = (cfg.providers || []).find(item => item.id === targetId);
              if (p) {
                p.models = result.models;
                configManager.saveConfig(cfg);
              }
            } catch (_) {}
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      // 8. 核心接口：Anthropic Messages 协议中转
      if (req.method === 'POST' && pathname === '/v1/messages') {
        const startTime = Date.now();
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
            const latencyMs = Date.now() - startTime;
            logger.log({
              clientIp: req.socket.remoteAddress || '127.0.0.1',
              modelRequested: requestedModel,
              modelRouted: targetModel || 'unknown',
              provider: route ? route.provider : 'Unknown',
              inputTokens: 0,
              outputTokens: 0,
              savingsUsd: 0,
              latencyMs,
              status: upstreamRes.status,
              error: errBody.substring(0, 200)
            });

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

            const inTokens = Math.floor(bodyText.length / 4);
            const outTokens = 150;
            const ledgerRes = costLedger.recordTransaction(
              inTokens,
              outTokens,
              route.name
            );

            const latencyMs = Date.now() - startTime;
            logger.log({
              clientIp: req.socket.remoteAddress || '127.0.0.1',
              modelRequested: requestedModel,
              modelRouted: targetModel,
              provider: route.provider,
              inputTokens: inTokens,
              outputTokens: outTokens,
              savingsUsd: ledgerRes.savingsUsd,
              latencyMs,
              status: 200
            });
          } else {
            // 非流式处理
            const data = await upstreamRes.json();
            const textContent = data.choices?.[0]?.message?.content || '';
            const usage = data.usage || { prompt_tokens: 50, completion_tokens: 50 };

            const ledgerRes = costLedger.recordTransaction(usage.prompt_tokens, usage.completion_tokens, route.name);
            const latencyMs = Date.now() - startTime;

            logger.log({
              clientIp: req.socket.remoteAddress || '127.0.0.1',
              modelRequested: requestedModel,
              modelRouted: targetModel,
              provider: route.provider,
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              savingsUsd: ledgerRes.savingsUsd,
              latencyMs,
              status: 200
            });

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
          const latencyMs = Date.now() - startTime;
          logger.log({
            clientIp: req.socket.remoteAddress || '127.0.0.1',
            modelRequested: requestedModel,
            modelRouted: 'none',
            provider: 'None',
            inputTokens: 0,
            outputTokens: 0,
            savingsUsd: 0,
            latencyMs,
            status: 502,
            error: dispatchErr.message
          });

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
    router,
    logger,
    configManager,
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
