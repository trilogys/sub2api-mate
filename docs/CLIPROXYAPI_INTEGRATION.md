# CLIProxyAPI 独立管理与单实例分组

Sub2API Mate 同时提供 Sub2API 管理和 CLIProxyAPI 管理，但两套数据域完全独立：

```text
Sub2API
  └─ 用户、API Key、分组、计费、上游账号

CLIProxyAPI
  └─ Client Key、CLI 分组、OAuth 凭据池、调度、实时配额
```

CLIProxy 分组不会读取或复用 Sub2API 分组。Mate 只是同一个管理客户端，不会把两套业务数据合并。

## 当前功能

- CLIProxyAPI 地址、Management Key 和连通测试。
- CLIProxy Client Key、模型列表和原生管理页入口。
- Claude、Codex、Antigravity、Kimi、Grok OAuth。
- 账号池状态、凭据启停和配额冷却清除。
- Codex 5h/7d、Gemini CLI、Antigravity 实时配额。
- 30 秒、1/5/15 分钟前台自动刷新。
- 单实例 CLIProxy 独立分组：专用 Client Key、组内凭据、Round Robin / Fill First、组启停和组配额汇总。

完整 YAML、插件商店、请求日志、错误日志以及全部高级 Provider 配置仍由 CLIProxyAPI 原生管理页提供。

## 为什么需要 Group Router 插件

CLIProxyAPI 原生顶层 `api-keys` 只做访问认证。所有 Key 默认进入同一个凭据池，原生配置没有 `Key -> Group -> Auth IDs` 绑定。

本仓库提供独立的 [`CLIProxy Group Router`](../integrations/cliproxy-group-router/README.md) Scheduler 插件，执行以下强制路由：

```text
Client Key
  -> CLIProxy caller_scope
  -> CLIProxy Group
  -> 该组允许的 auth IDs
  -> 组内 Round Robin / Fill First
```

安全规则：

- 未分组 Key 直接拒绝。
- 停用组直接拒绝。
- 组内无可用凭据时直接拒绝，不跨组回退。
- 默认禁止同一凭据属于多个组。
- Mate 保存分组时会把当前 CLIProxy 实例的全部凭据统一到优先级 `0`，保证 Scheduler 在分组过滤前能看到每个组的候选凭据；组内顺序和策略由 Group Router 接管。
- 分组配置保存失败时，Mate 会尝试回滚顶层 `api-keys`。

## 1. 配置 CLIProxyAPI

若 Mate 在手机上运行，`127.0.0.1` 和 `localhost` 指向手机本身。请使用局域网地址、VPN 地址或受控 HTTPS 域名。

基础配置：

```yaml
host: ""
port: 8317

remote-management:
  allow-remote: true
  secret-key: "请替换为高强度管理密钥"

plugins:
  enabled: true
  dir: "/CLIProxyAPI/plugins"
  configs: {}
```

不要把未加 TLS 的 Management API 直接暴露到公网。优先使用局域网、VPN、防火墙白名单或 HTTPS 反向代理。

## 2. 构建并安装 Group Router

在仓库根目录运行：

```bash
docker build \
  --output type=local,dest=./integrations/cliproxy-group-router/dist \
  ./integrations/cliproxy-group-router
```

把生成的 `cliproxy-group-router.so` 放入 CLIProxyAPI 的 `plugins.dir`，然后重启 CLIProxyAPI。仓库工作流 `CLIProxy Group Router` 也会生成 Linux AMD64 Artifact。

CLIProxyAPI 官方 Compose 已把本地 `./plugins` 挂载为 `/CLIProxyAPI/plugins`，因此可以直接复制到宿主机 `plugins` 目录。

## 3. 在 Mate 中创建 CLIProxy 分组

1. 使用管理员身份登录 Mate。
2. 打开“更多管理” → “CLIProxyAPI 管理”。
3. 保存 CLIProxyAPI 地址和 Management Key。
4. 打开“CLIProxy 分组管理”。
5. 确认 `CLIProxy Group Router 已生效`。
6. 创建分组并设置：
   - 分组名称
   - 专用 Client Key
   - Round Robin 或 Fill First
   - 一个或多个 CLIProxy OAuth 凭据
7. 保存后，Mate 会同步插件配置和 CLIProxyAPI 顶层 `api-keys`。

Client Key 只属于 CLIProxy 分组，不会写入 Sub2API 分组或 Sub2API API Key 数据。

## 4. 配额与自动刷新

Mate 通过 CLIProxyAPI 的 `/v0/management/api-call` 和稳定 `auth_index` 查询：

- Codex：5 小时、7 天窗口和重置时间。
- Gemini CLI：模型桶剩余比例和重置时间。
- Antigravity：模型剩余比例和重置时间。

分组页面会按组内 `auth_ids` 汇总耗尽和错误数量。自动刷新只在 CLIProxy 页面位于前台且 App 处于活动状态时执行；CLIProxyAPI 自己仍负责 OAuth Token 后台刷新。

## 故障排查

- 插件未发现：检查 `.so` 是否位于 `plugins.dir`，并重启 CLIProxyAPI。
- 插件已发现但未生效：确认 `plugins.enabled: true`，然后在 Mate 中点击“启用 Group Router 插件”。
- `group_not_found`：请求使用的 Client Key 没有绑定 CLIProxy 分组。
- `group_disabled`：目标 CLIProxy 分组已停用。
- `group_no_available_auth`：该组内没有当前模型可用的凭据；不会跨组回退。
- 配额查询失败但模型可调用：上游配额接口可能变化，或凭据缺少 Account ID / Project ID；账号卡片会保留具体错误。
- Web 网络/CORS 错误：使用 `npm run dev:web-proxy`，或配置 `EXPO_PUBLIC_SUB2API_WEB_PROXY_URL`。

参考：[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI) · [Scheduler Plugin API](https://github.com/router-for-me/CLIProxyAPI/blob/main/sdk/pluginapi/types.go) · [Management API](https://help.router-for.me/cn/management/api)
