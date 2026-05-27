# LokSystem 2.0.0 发布说明

发布日期：2026-05-27

## 发布定位

`2.0.0` 是当前分支在同步社区 `AionUi v2.1.x` 关键稳定性能力后的首个正式版本，重点完成了桌面端/WebUI 统一认证、会话与消息流稳定性修复、配置与助手访问口径收敛，以及发布前组合回归闭环。

## 本次重点优化

- 统一登录认证：
  - 桌面端补齐与网页端一致的账号密码认证。
  - 默认管理员账号统一为 `admin / Admin@123`，开发态、桌面端、WebUI 口径一致。
- 会话与消息流稳定性：
  - 修复 thinking 状态悬挂。
  - 忽略缺少 `callId/toolCallId` 的工具调用事件，避免脏 UI 状态。
  - 过滤空白/不可渲染消息与空 `tool_group` 事件，减少流式噪声。
  - 优化消息首屏 hydrate 与流式输出阶段的自动滚动到底部行为。
- 上传与工作区一致性：
  - 切换会话时自动中止未完成上传。
  - `paste / drop / 手动附件` 全链路保持当前 workspace，不再串会话。
- 启动与退出稳定性：
  - 后端/核心服务启动失败时，桌面端保留可见窗口并展示诊断信息。
  - 退出清理改为串行收口，降低残留子进程和重复清理风险。
- 配置与助手收敛：
  - `configService` / `providerService` / `assistantService` 已覆盖高频配置、provider、assistant 访问路径。
  - 渠道设置、语音输入、定时任务、团队创建、技能预设注册等入口已完成服务化接入。

## 回归与验收

已完成本轮 `2.0.0` 发布前定向组合回归：

- `npx tsc --noEmit --pretty false`
- `npx vitest run tests/unit/renderer/SpeechInputButton.dom.test.tsx tests/unit/ChannelModelSelectionRestore.dom.test.tsx tests/unit/renderer/team/TeamCreateModal.dom.test.tsx tests/unit/renderer/conversation/CreateTaskDialog.dom.test.tsx tests/unit/configServices.test.ts tests/unit/p0RegressionMapping.test.ts tests/unit/transformMessage.test.ts tests/unit/renderer/messageHooks.dom.test.tsx tests/unit/renderer/useAutoScroll.dom.test.tsx tests/unit/createConversationParams.test.ts tests/unit/renderer/conversation/useConversationAgents.dom.test.ts`

结果：`11` 个测试文件、`104` 个用例全部通过。

## 已知说明

- `A-04 / A-05` 已完成 2.0 发版所需的服务层收口，但尚未演进为完整独立后端 CRUD 体系，该部分属于后续 `2.x` 持续演进项，不阻塞本次正式发版。
- `A-03` 已完成业务层配置访问收口；当前仍保留 `configService -> ConfigStorage` 的底层持久化桥接，这是架构底座而非业务侧尾项。
