# 🐾 FreeDog Gateway · 旺财算力网关

> **全网首个深度融合云端免费算力雷达的终端 Coding Agent 自愈型本地网关**  
> 0 元挂载 Gemini 2.5 Flash / DeepSeek-V3 / Ollama，无缝跑满 Claude Code、Codex 与 Antigravity CLI。  
> 官网协同中台: https://freeaidog.com

---

## 💡 为什么需要 FreeDog Gateway？

使用 Claude Code 官方 API 编写复杂代码时，动辄几万 tokens 的上下文刷新极易导致账单飞涨。市面上的反向代理通常存在三大痛点：
1. **纯静态空壳**：用户必须手动满世界找可用免费渠道，一旦渠道限流或故障，终端当场崩溃；
2. **看门狗与超时报错**：Claude Code 官方客户端内置严苛心跳检测，遇到中转延迟往往自行掐断；
3. **思维链丢失**：Gemini 与 DeepSeek 专有的思考签名在交替轮次中常被清洗，导致思考死循环。

**FreeDog Gateway** 将 **FreeAI Dog** 现有的全网免费模型雷达实时探测流深度植入本地网关，实现全自动智能选路、协议无损转译与断连自愈。

---

## 🚀 核心特性

- **动态雷达驱动路由**：自动同步 FreeAI Dog 云端雷达，永远将流量分流至当前可用率最高、延迟最低的免费算力通道。
- **全协议无损双向转译**：兼容 Anthropic Messages API、OpenAI Chat Completions 与 Gemini 原生格式。
- **客户端看门狗深度欺骗**：自动注入底层参数，关闭客户端超时掐断，给多 Key 故障转移留足时间。
- **思维签名临时缓存补丁**：无损维护会话级 `thought_signature`，支持思维链流式实时展示。
- **透明算力账本跟踪**：自动统计每次对话节省的美金额度与 Token 吞吐量，本地持久化记账。
- **现代极客暗黑 WebUI**：集成零依赖本地 Web 控制台，支持雷达巡检、实时日志审计与一键启动。
- **极速零依赖架构**：纯原生 Node.js 构建，无需编译工具链或重型环境，毫秒级冷启动。

---

## 🖥️ 现代化 Web 控制台

本地网关启动后，访问 `http://127.0.0.1:8000` 即可开启专属极客控制台：
- **实时雷达看板**：可视化检视全网各路免费算力健康分、配额与可用特性；
- **累计算力账本**：直观展示已处理 Token 总量与对标 Claude 3.7 Sonnet 价格的累计节省美元总额；
- **请求审计日志**：近 50 次请求的耗时、模型映射、Token 开销与命中服务商毫秒级流水；
- **一键快捷拉起**：多终端快捷启动命令复制，即拷即用；
- **本地 Key 保险箱**：图形化配置本地各厂商 API Key，仅保存在用户本地磁盘。

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

### 4. 查看实时雷达与账本

```bash
# 查询当前全网健康度前列的免费通道
node bin/freedog.mjs radar

# 查看累计为你节省的美元账单
node bin/freedog.mjs status
```

---

## 🧩 命令行参考

| 命令 | 说明 |
| :--- | :--- |
| `freedog start [--port 8000]` | 启动本地代理网关与 Web 控制台服务 |
| `freedog claude` | 一键注入代理环境变量并拉起 Claude Code 客户端 |
| `freedog radar` | 查询并打印 FreeAI Dog 最新全网免费模型雷达 |
| `freedog status` | 查看本地累计节省额度与渠道分流统计 |

---

## 📄 开源许可证

本项目基于 MIT 许可证开源。
