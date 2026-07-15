# ChatSession Full-Stack Demo (JavaScript / TypeScript)

这是 `openai-iztro-agents` JS SDK 的完整聊天应用示例，功能和界面与 Python SDK
的 fullstack demo 一致。聊天由 OpenAI Agents SDK 的 `run()`、Iztro hosted model 和
`ChatSession` 驱动。

## 包含的能力

- 新建、恢复和列出某个 `external_user_id` 的服务器端会话
- 会话改名、删除和完整 Fork
- 编辑任意历史用户消息；编辑会从该位置创建分支，不破坏原会话
- `run(agent, input, { stream: true })` 流式输出
- Assistant 回复安全渲染 Markdown，并支持 GFM 表格、任务列表和代码块
- 实时显示 `IztroToolEvent`，记录每个会话及每条回答调用过的命盘工具
- API Key 只存在于 Node 后端，浏览器不会收到密钥

## 数据边界

```text
React browser
    |  demo JSON API + SSE（无 Iztro API Key）
Express backend
    |-- ChatSession -------> Iztro Conversations（真实消息历史）
    |-- streaming run() ---> Iztro hosted model（回答与命盘工具）
    `-- metadata.json -----> 标题、分支关系、列表摘要、命盘调用记录
```

本地 JSON 文件不是聊天历史的第二份副本。删除会话时，后端会调用
`ChatSession.clearSession()` 删除 hosted conversation，再清理本地 UI 元数据。

## 本地启动

需要 Node.js 20.19+（或 22.12+）和一个 `sk_ziwei_...` API Key。

### 1. 构建本地 SDK

从仓库根目录执行：

```powershell
npm install
npm run build
```

### 2. Node 后端

```powershell
cd examples\fullstack-demo\backend
npm install
# 打开 src/app.ts，把 INLINE_ZIWEI_API_KEY 改成你的 sk_ziwei_... 测试密钥
npm run dev
```

这种 inline string 是为了让第一次接入的客户更容易运行。提交代码前请恢复
`sk_ziwei_replace_me` 占位符。正式环境仍建议通过可选的 `.env` / `ZIWEI_API_KEY`
提供密钥，避免把真实凭证写入 Git。

后端通过 `file:../../..` 使用当前仓库构建的 JS SDK，因此可以直接验证正在开发的
`ChatSession.fork(...)`。

### 3. React 前端

另开一个终端：

```powershell
cd examples\fullstack-demo\frontend
npm install
npm run dev
```

打开 Vite 输出的地址，默认是 `http://localhost:5193`。前端默认访问当前主机的
`8789` 端口；如需修改，复制 `frontend/.env.example` 为 `.env`。

## Demo API

| Method | Path | 用途 |
|---|---|---|
| `GET` | `/api/conversations` | 会话列表 |
| `POST` | `/api/conversations` | 新建会话 |
| `GET` | `/api/conversations/{id}` | 消息与命盘调用 |
| `PATCH` | `/api/conversations/{id}` | 修改标题 |
| `DELETE` | `/api/conversations/{id}` | 删除 hosted 会话 |
| `POST` | `/api/conversations/{id}/fork` | Fork 全部或前 N 个 session items |
| `POST` | `/api/conversations/{id}/messages/stream` | 流式运行一个新 turn |
| `POST` | `/api/conversations/{id}/messages/{index}/edit/stream` | 从历史消息处编辑并分支 |

流接口使用 SSE，依次可能发出 `conversation`、`chart`、`delta`、`done` 或 `error`
事件。`chart` 来自 SDK 的 `IztroToolEvent`，不是前端推测出来的标签。

## 用到生产环境前

界面里的“演示用户”切换器是为了直观看到 `external_user_id` 的会话隔离。正式应用中
不要信任浏览器提交的用户 ID；应由后端登录态解析用户并传给 `ChatSession`，同时为所有
读取、改名、Fork 和删除接口做权限校验。API Key 仍应只配置在后端环境变量中。

## 验证

```powershell
# SDK
npm test
npm run build

# demo backend
cd examples\fullstack-demo\backend
npm test
npm run build

# demo frontend
cd ..\frontend
npm run build
npm audit
```
