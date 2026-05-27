# 身份与认证域收尾说明

本文说明 2026-05-27 这轮针对 WebUI 身份与认证域的收尾与硬化范围。

## 目标

- 统一用户、token、session 的后端认证模型
- 把 token 失效从“仅内存黑名单”升级为“持久化会话状态机”
- 为登录、刷新、登出、WebSocket 校验补齐一致的设备会话绑定
- 补上账号迁移与失效策略的基础设施，但不扩展为 conversation/team/cron 的统一大仓储重构

## 本次落地

### 1. 用户认证元数据统一

`users` 表新增并统一使用以下字段：

- `auth_version`
- `auth_migrated_at`
- `tokens_invalid_before`

它们用于表达：

- 当前账号认证模型版本
- 账号何时完成认证域迁移
- 某个时间点之前签发的 token 是否应整体失效

### 2. 持久化会话模型

新增 `auth_sessions` 表，统一记录 WebUI 会话：

- token 对应的 `token_id`
- 逻辑会话 `session_id`
- 状态：`active` / `rotated` / `revoked` / `expired`
- 最近访问时间
- 撤销原因
- 设备标识与设备名称

这样登录、刷新、登出、过期就不再只依赖进程内状态，服务重启后仍然保持一致。

### 3. 统一失效策略

当前失效策略统一为：

- 登录签发 token 时创建 `auth_sessions`
- 刷新 token 时轮换旧会话，旧 token 进入黑名单，旧 session 标记为 `rotated`
- 主动登出时，token 进入黑名单，同时持久化 session 标记为 `revoked`
- token 过期时，校验链路会把原 session 标记为 `expired`
- 全局失效或密码重置时，更新 `jwt_secret`、提升 `auth_version`、写入 `tokens_invalid_before`，并撤销用户活跃 session

### 4. 设备会话绑定

认证入口统一解析并回写设备上下文：

- `x-loksystem-device-id`
- `x-loksystem-device-name`
- `loksystem-device` cookie

如果请求没有携带稳定设备标识，服务端会生成并回写一个设备 ID。该信息会写入 `auth_sessions.device_id/device_name`，用于后续会话追踪与失效分析。

### 5. WebSocket 与 HTTP 认证一致性

WebSocket 握手与 HTTP 登录态现在共用同一套 token 校验规则：

- 检查 JWT 签名与声明
- 检查 `tokens_invalid_before`
- 检查 `auth_version`
- 检查 `auth_sessions` 状态

这样 HTTP 已失效的 session，不会在 WebSocket 侧继续“假活着”。

## 迁移与兼容性

- 数据库版本升级到 `v28`
- 已有用户会在认证链路中懒迁移补齐认证元数据
- 旧 token payload 测试与新 contract 已同步更新
- 没有引入前端强制重构，旧入口仍可工作，只是现在会自动补齐设备 cookie

## 不在本次范围

以下内容明确不纳入本轮整改：

- conversation / team / cron 统一为单一物理 store
- 多业务域统一成单一 session/task 大模型
- 独立的设备注册中心或设备审批后台
- 全新的多账号体系

## 验证

本轮已补并通过认证域聚焦测试，包括：

- `CoreAuthService`
- `authRoutes login / refresh / logout`
- `AuthService.refreshToken`
- `WebSocketManager`
- cookie / WebSocket token 解析

建议后续发布前再跑一轮全仓回归，以补充非认证域的整体信心。
