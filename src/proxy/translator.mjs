import crypto from 'node:crypto';

// 将 Anthropic Messages API 入参转为 OpenAI Chat Completions 规范
export function translateAnthropicToOpenAI(body) {
  const { messages = [], system, tools, max_tokens, temperature, stream } = body;

  const openAIMessages = [];

  // 1. 处理 System 提示词
  if (system) {
    const systemText = Array.isArray(system)
      ? system.map(s => (typeof s === 'string' ? s : s.text || '')).join('\n')
      : String(system);
    openAIMessages.push({ role: 'system', content: systemText });
  }

  // 2. 转换各轮次对话
  for (const msg of messages) {
    const role = msg.role;

    if (typeof msg.content === 'string') {
      openAIMessages.push({ role, content: msg.content });
      continue;
    }

    if (!Array.isArray(msg.content)) continue;

    // 检查是否包含 tool_result
    const toolResults = msg.content.filter(b => b.type === 'tool_result');
    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        let contentStr = '';
        if (typeof tr.content === 'string') {
          contentStr = tr.content;
        } else if (Array.isArray(tr.content)) {
          contentStr = tr.content.map(c => c.text || JSON.stringify(c)).join('\n');
        } else {
          contentStr = JSON.stringify(tr.content || '');
        }
        openAIMessages.push({
          role: 'tool',
          tool_call_id: tr.tool_use_id,
          content: contentStr
        });
      }
      continue;
    }

    // 检查是否包含 tool_use
    const toolUses = msg.content.filter(b => b.type === 'tool_use');
    const textBlocks = msg.content.filter(b => b.type === 'text');
    const combinedText = textBlocks.map(t => t.text).join('\n');

    if (toolUses.length > 0) {
      const toolCalls = toolUses.map(tu => ({
        id: tu.id,
        type: 'function',
        function: {
          name: tu.name,
          arguments: typeof tu.input === 'string' ? tu.input : JSON.stringify(tu.input || {})
        }
      }));

      openAIMessages.push({
        role: 'assistant',
        content: combinedText || null,
        tool_calls: toolCalls
      });
      continue;
    }

    // 普通文本消息
    openAIMessages.push({
      role,
      content: combinedText || ''
    });
  }

  // 3. 转换 Tools 声明
  let openAITools = undefined;
  if (Array.isArray(tools) && tools.length > 0) {
    openAITools = tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema || { type: 'object', properties: {} }
      }
    }));
  }

  return {
    messages: openAIMessages,
    tools: openAITools,
    max_tokens: max_tokens || 4096,
    temperature: temperature !== undefined ? temperature : 0.7,
    stream: Boolean(stream)
  };
}

// 流式转译器：将 OpenAI SSE 转换为 Anthropic 标准 SSE 数据包并泵送至客户端
export async function streamOpenAIToAnthropic(openAIResponseStream, clientResponse, options = {}) {
  const { model = 'claude-3-7-sonnet', inputTokens = 50, thinkingManager = null, sessionId = null } = options;
  const messageId = 'msg_' + crypto.randomBytes(12).toString('hex');

  // 发送初始 SSE 响应头
  clientResponse.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const sendEvent = (event, data) => {
    clientResponse.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // 1. 发送 message_start 事件
  sendEvent('message_start', {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: model,
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: inputTokens,
        output_tokens: 1
      }
    }
  });

  let textBlockStarted = false;
  let textBlockIndex = 0;
  let toolIndexOffset = 1;
  let activeToolIndex = -1;
  let totalOutputTokens = 0;
  let reasoningAccumulator = '';

  const decoder = new TextDecoder('utf8');
  let buffer = '';

  try {
    for await (const chunk of openAIResponseStream) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') continue;

        let parsed;
        try {
          parsed = JSON.parse(dataStr);
        } catch (e) {
          continue;
        }

        const choice = parsed.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta;
        if (!delta) continue;

        // 捕获思维链输出 (DeepSeek-R1 / Gemini 思考块)
        if (delta.reasoning_content) {
          reasoningAccumulator += delta.reasoning_content;
          continue;
        }

        // 处理常规文本输出
        if (delta.content) {
          if (!textBlockStarted) {
            sendEvent('content_block_start', {
              type: 'content_block_start',
              index: textBlockIndex,
              content_block: { type: 'text', text: '' }
            });
            textBlockStarted = true;
          }
          sendEvent('content_block_delta', {
            type: 'content_block_delta',
            index: textBlockIndex,
            delta: { type: 'text_delta', text: delta.content }
          });
          totalOutputTokens += 1;
        }

        // 处理工具调用
        if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = (tc.index !== undefined ? tc.index : 0) + toolIndexOffset;
            if (tc.id) {
              if (textBlockStarted) {
                sendEvent('content_block_stop', { type: 'content_block_stop', index: textBlockIndex });
                textBlockStarted = false;
              }
              activeToolIndex = idx;
              sendEvent('content_block_start', {
                type: 'content_block_start',
                index: activeToolIndex,
                content_block: {
                  type: 'tool_use',
                  id: tc.id,
                  name: tc.function?.name || '',
                  input: {}
                }
              });
            }

            if (tc.function?.arguments) {
              sendEvent('content_block_delta', {
                type: 'content_block_delta',
                index: activeToolIndex,
                delta: {
                  type: 'input_json_delta',
                  partial_json: tc.function.arguments
                }
              });
              totalOutputTokens += 1;
            }
          }
        }
      }
    }

    if (textBlockStarted) {
      sendEvent('content_block_stop', { type: 'content_block_stop', index: textBlockIndex });
    }
    if (activeToolIndex !== -1) {
      sendEvent('content_block_stop', { type: 'content_block_stop', index: activeToolIndex });
    }

    // 保存思考签名缓存以备下一轮补齐
    if (reasoningAccumulator && thinkingManager && sessionId) {
      thinkingManager.storeSignature(sessionId, 'freedog_sig_' + messageId, reasoningAccumulator);
    }

    // 2. 发送 message_delta 结束标记
    sendEvent('message_delta', {
      type: 'message_delta',
      delta: {
        stop_reason: activeToolIndex !== -1 ? 'tool_use' : 'end_turn',
        stop_sequence: null
      },
      usage: {
        output_tokens: Math.max(totalOutputTokens, 1)
      }
    });

    // 3. 发送 message_stop
    sendEvent('message_stop', { type: 'message_stop' });
  } catch (err) {
    // 异常保活终止
    sendEvent('error', { type: 'error', error: { type: 'api_error', message: err.message } });
  } finally {
    clientResponse.end();
  }
}
