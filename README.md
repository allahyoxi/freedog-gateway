# 🐾 FreeDog Gateway · 旺财算力网关

> **专为终端 Coding Agent 打造的极简本地算力网关与服务商工作台**  
> 0 元挂载 Gemini 2.5 Flash / DeepSeek-V3 / Ollama，无缝跑满 Claude Code、Codex 与 Antigravity CLI。  
> 官网协同中台: https://freeaidog.com

---

## 💡 为什么需要 FreeDog Gateway？

使用 Claude Code 官方 API 编写复杂代码时，动辄几万 tokens 的上下文刷新极易导致账单飞涨。市面上的反向代理通常存在三大痛点：
1. **看门狗与超时报错**：Claude Code 官方客户端内置严苛心跳检测，遇到中转延迟往往自行掐断；
2. **思维链丢失**：Gemini 与 DeepSeek 专有的思考签名在交替轮次中常被清洗，导致思考死循环；
3. **配置死板且依赖重**：多数工具基于复杂环境构建，不支持多服务商自由增减。

**FreeDog Gateway** 采用纯原生 Node.js 零依赖架构构建，提供类似顶级控制台的卡片式服务商管理，并深度支持从 FreeAI Dog 官网一键直达挂载端点。

---

## 🚀 核心特性

- **云端服务商卡片大厅**：预置主流免费/低价服务商模板 [Gemini、DeepSeek、Groq、Cerebras、NVIDIA NIM、OpenCode Zen、Local Ollama]，并支持无限添加自定义私有渠道。
- **网站一键直达挂载 [Web-to-Desktop]**：在 FreeAI Dog 官网看到心仪模型，点击一键挂载即可自动填入端点与模型标识，无需繁琐复制。
- **全协议无损双向转译**：兼容 Anthropic Messages API、OpenAI Chat Completions 与 Gemini 原生格式。
- **客户端看门狗深度欺骗**：自动注入底层参数，关闭客户端超时掐断，给多 Key 故障转移留足时间。
- **思维签名临时缓存补丁**：无损维护会话级 `thought_signature`，支持思维链流式实时展示。
- **透明算力账本跟踪**：自动统计每次对话节省的美金额度与 Token 吞吐量，本地持久化记账。
- **极速零依赖架构**：纯原生 Node.js 构建，无需编译工具链或重型环境，毫秒级冷启动。

---

## 🖥️ 现代化 Web 控制台

本地网关启动后，访问 `http://127.0.0.1:8000` 即可开启专属控制台：
- **Providers 服务商大厅**：卡片式网格直观管理所有大模型端点，自由开启、禁用、编辑与删除；
- **Model Config 映射**：将 Claude Code 的 Sonnet 主力任务与 Haiku 轻量任务精准绑定到指定渠道；
- **Sessions & Ledger 账本**：实时对标 Claude 3.7 Sonnet 价格计算节省美金额度，记录请求审计流水；
- **Connect 一键接管**：提供一键启动终端命令与环境变量复制面板；
- **底部吸底控制条**：直观展示本地配置路径 `~/.freedog/config.json` 与未保存状态，一键热应用。

---

## 🛠️ 快速上手

### 1. 启动本地网关

```bash
# 启动本地守护进程，默认监听 8000 端口并挂载 Web 控制台
node bin/freedog.mjs start
```

### 2. 访问 Web 控制台

打开浏览器访问:
```text
http://127.0.0.1:8000/
```

### 3. 一键接管 Claude Code

新开一个终端，执行接管指令即可启动官方 Claude Code：

```bash
# 自动注入看门狗拦截环境变量并拉起客户端
node bin/freedog.mjs claude
```

---

## 🧩 命令行参考

| 命令 | 说明 |
| :--- | :--- |
| `freedog start [--port 8000]` | 启动本地代理网关与 Web 控制台服务 |
| `freedog claude` | 一键注入代理环境变量并拉起 Claude Code 客户端 |
| `freedog status` | 查看本地算力账本节省统计与渠道状态 |

---

## 📄 开源许可证

本项目基于 MIT 许可证开源。
