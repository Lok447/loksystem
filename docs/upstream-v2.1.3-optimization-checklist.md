# LokSystem Upstream v2.1.3 Optimization Checklist

基线：当前项目基于社区 `v1.9.25` 二次开发，本地版本显示为 `1.9.26`。

目标上游：`iOfficeAI/AionUi v2.1.3`，发布时间 `2026-05-26`。

说明：

- 上游 `v2.x` 已做较大的后端化和目录结构调整，桌面端代码迁到 `packages/desktop/...`，当前项目仍以根目录 `src/...` 为主。因此本清单建议按能力和风险分批吸收，不建议直接整体覆盖合并。
- 优先级含义：`P0` 线上稳定性和数据安全优先；`P1` 明显提升核心能力或高频体验；`P2` 中期架构演进；`P3` 产品体验和工程治理优化。
- 状态含义：`todo` 待处理；`in-progress` 处理中；`done` 已完成；`skip` 明确暂不做。

## 0. 跟进总览

| ID | 优先级 | 模块 | 优化项 | 状态 | 建议版本 |
| --- | --- | --- | --- | --- | --- |
| R-01 | P0 | 配置迁移 | 防止删除的 provider/assistant 重启后复活 | done | patch-1 |
| R-02 | P0 | 启动稳定性 | 后端/核心服务启动失败时桌面保持可见并展示诊断 | done | patch-1 |
| R-03 | P0 | 退出稳定性 | 串行化桌面退出清理，避免 Linux/桌面退出竞态 | done | patch-1 |
| R-04 | P0 | 上传/工作区 | 切换会话时中止未完成上传 | done | patch-1 |
| R-05 | P0 | 工作区 | paste/drop 文件时保留当前项目工作区 | done | patch-1 |
| R-06 | P0 | 对话流 | 修复 streaming reply 边界和 thinking timer | done | patch-1 |
| R-07 | P0 | Tool Call | 忽略缺少 call id 的工具调用，避免孤儿 UI 状态 | done | patch-1 |
| R-08 | P1 | 崩溃观测 | GPU crash 自愈和 Sentry 过滤 | done | patch-2 |
| R-09 | P1 | 日志诊断 | 反馈/崩溃报告附带更完整日志与环境标签 | done | patch-2 |
| C-01 | P1 | Agent | 统一 agent 元数据和能力发现 | done | minor-1 |
| C-02 | P1 | ACP/Aionrs | slash commands 按 agent 动态加载 | done | minor-1 |
| C-03 | P1 | 权限确认 | 统一工具权限确认、状态更新、结果展示 | done | minor-1 |
| C-04 | P1 | Team | 团队会话 agent/model/workspace 选择一致性 | done | minor-1 |
| C-05 | P1 | Cron | 定时任务使用真实 agent/provider/model 信息 | done | minor-1 |
| A-01 | P2 | Core 架构 | 明确本地 core service 与上游 aioncore 的边界 | todo | minor-2 |
| A-02 | P2 | API 适配 | 建立 HTTP/WS/core-client 适配层演进路线 | todo | minor-2 |
| A-03 | P2 | 配置服务 | 从分散 ConfigStorage 迁移到 typed config service | todo | minor-2 |
| A-04 | P2 | Provider | 模型 provider 从 `model.config` 文件式存储迁到 CRUD 服务 | todo | minor-2 |
| A-05 | P2 | Assistant/Skills | 内置和自定义 assistant/skills 后端化 | todo | minor-2 |
| A-06 | P2 | WebUI | WebUI 鉴权、状态和目录浏览统一到后端服务 | todo | minor-2 |
| U-01 | P1 | 移动端 | mobile sendbox 单行输入 + action sheet | todo | minor-1 |
| U-02 | P2 | Header | 对话 header 重构，模型/agent/项目状态更清晰 | todo | minor-2 |
| U-03 | P2 | Workspace | 工作区入口、树刷新、目录 reveal、搜索字段健壮性 | todo | minor-2 |
| U-04 | P2 | Settings | 模型设置、Base URL、主题/语言/window bounds 持久化 | todo | minor-2 |
| U-05 | P3 | Markdown | 代码块、移动端行高、blockquote/hr/inline code 样式 | todo | polish |
| U-06 | P3 | Sidebar | 项目/会话分组、侧边栏按钮、移动端可触达性 | todo | polish |
| E-01 | P1 | 测试 | 为 P0 修复补充单元/回归测试 | todo | patch-1 |
| E-02 | P2 | E2E | 建立核心链路 Playwright smoke | todo | minor-1 |
| E-03 | P2 | 发布 | 补齐 release smoke、升级/回滚检查清单 | todo | minor-1 |

## 1. P0 稳定性和数据安全

### R-01 防止删除的 provider/assistant 重启后复活

- 上游参考：`e67ac7c12 fix(config-migration): stop deleted providers/assistants from resurrecting on launch (#3018)`
- 问题表现：旧版 `model.config` 或 assistant 配置迁移逻辑可能在每次启动时重复执行，把用户已经删除的 provider/assistant 再写回来。
- 当前项目关注点：`src/process/utils/configMigration.ts`、`src/common/config/storage.ts`、`src/process/bridge/modelBridge.ts`、assistant/preset 相关迁移逻辑。
- 建议动作：确认所有旧配置迁移都具备一次性完成标记；迁移函数保持幂等；保留旧数据用于降级但不能再次覆盖用户新状态。
- 验收标准：删除 provider 后重启不恢复；删除/禁用 assistant 后重启不恢复；从旧版本用户数据首次启动能完成迁移；重复启动不会改写用户配置。
- 建议测试：配置迁移单测；真实用户数据样本回归；Windows/macOS/Linux 启动 smoke。
- 风险：如果直接照搬上游，可能和本地二开 provider/assistant 字段冲突，需要先列出本地扩展字段。
- 实施结果（2026-05-27）：已新增 `assistants.deletedBuiltinIds` 持久化键；启动初始化内置助手时跳过用户明确删除过的 builtin preset；预设管理删除入口会同步写入 tombstone，避免重启自动补回。
- 验收备注：已覆盖“删除内置 preset 后重启不复活”主场景；provider 侧沿用 `migration.electronConfigImported` 一次性迁移机制，当前代码路径下不会因为空数组再次导入覆盖。

### R-02 后端/核心服务启动失败时桌面保持可见并展示诊断

- 上游参考：`210b2e167 fix(startup): report backend launch failures (#3020)`、`73d1f5872 fix(startup): handle backend launch failures (#3022)`、`3abb758f3 fix(startup): keep desktop open on backend failure (#3030)`
- 问题表现：核心服务、后端进程或 agent runtime 启动失败时，桌面直接退出或白屏，用户无法看到错误详情。
- 当前项目关注点：`src/index.ts`、`src/process/utils/initStorage.ts`、`src/process/core/CoreBackendServices.ts`、启动日志和错误弹窗。
- 建议动作：把启动流程拆成可诊断阶段；桌面模式下失败显示错误页/弹窗和日志路径；WebUI/headless 保持 fail-fast。
- 验收标准：模拟后端端口占用、二进制缺失、配置损坏时，桌面不直接退出；用户能看到失败原因和诊断报告入口。
- 建议测试：启动失败单测；打包后缺少核心依赖 smoke；WebUI 模式失败码检查。
- 风险：需要避免失败状态下 renderer 继续调用未初始化桥接接口造成二次报错。
- 实施结果（2026-05-27）：主进程启动 catch 已改为桌面模式优先保留窗口，并通过错误弹窗展示启动失败详情；仅 WebUI/resetpass 模式继续保持 fail-fast 退出。
- 验收备注：当前实现可以在桌面启动失败时保留可见诊断信息，避免原先直接 `app.quit()` 导致的无提示退出。

### R-03 串行化桌面退出清理

- 上游参考：`3d1309a1f fix(desktop): serialize quit cleanup (#3031)`
- 问题表现：退出时后端关闭、托盘销毁、悬浮/pet 窗口清理并发执行，可能出现进程残留或 Linux crash。
- 当前项目关注点：`src/index.ts`、tray/pet/ambient/window cleanup、agent worker cleanup。
- 建议动作：建立单一 quit cleanup coordinator；所有退出路径复用同一个 Promise；重复触发退出时等待已有清理完成。
- 验收标准：连续点击退出、系统关机、托盘退出、窗口关闭都不会残留 agent/core 进程；Linux 下退出无 crash。
- 建议测试：退出流程单测；Windows 和 Linux 桌面 smoke；检查子进程残留。
- 风险：清理超时策略要明确，避免应用无法退出。
- 实施结果（2026-05-27）：`before-quit` 已引入单例 `quitCleanupPromise`，托盘销毁、worker 清理、team session 释放、channel/webserver/office watch 停止统一串行复用同一条清理链。
- 验收备注：重复触发 quit 时不再重复并发执行清理逻辑，保留 10 秒超时保护，兼顾“能退得干净”和“不会卡死不退出”。

### R-04 切换会话时中止未完成上传

- 上游参考：`507874e79 fix(upload): abort in-flight uploads when switching conversations (#3019)`
- 问题表现：用户拖拽/粘贴大文件上传中切到另一个会话，上传结果可能落到错误会话或造成状态错乱。
- 当前项目关注点：`src/renderer/hooks/file/useUploadState.ts`、`usePasteService.ts`、`useDragUpload.ts`、各平台 SendBox。
- 建议动作：引入 per-conversation AbortController；conversation id 变化时中止 sendbox/workspace 上传；UI 展示已取消状态。
- 验收标准：上传大文件时切换会话，原上传被取消；新会话不会出现旧文件；回到旧会话状态可恢复或清晰失败。
- 建议测试：上传 hook 单测；Playwright 模拟大文件上传切换。
- 风险：需要区分用户主动取消和网络失败，避免误报错误 toast。
- 实施结果（2026-05-27）：已在 `FileService` 增加按 `conversationId` 注册的上传中止注册表，`paste/drop` 上传都会挂到对应会话；各平台 Chat 容器在会话切换或卸载时自动中止该会话未完成上传。
- 验收备注：主动会话切换导致的取消会返回 `UPLOAD_ABORTED_CONVERSATION_SWITCH`，前端已避免将其当成普通上传失败 toast 提示。

### R-05 paste/drop 文件时保留当前项目工作区

- 上游参考：`25aa0beb6 fix(guid): keep workspace dir when pasting/dropping files (#3040)`
- 问题表现：在“Work in project”模式下粘贴图片或拖入文件，可能丢失当前 workspace/project 目录。
- 当前项目关注点：`src/renderer/hooks/file/usePasteService.ts`、`src/renderer/hooks/file/useDragUpload.ts`、`src/renderer/pages/conversation/utils/createConversationParams.ts`、workspace selector。
- 建议动作：统一 sendbox 上传、dialog 上传、drag/drop 上传的 workspace 参数来源；新增守卫，禁止上传流程重置工作区。
- 验收标准：选定项目后 paste 图片、drop 文件、手动选择附件都保持同一 workspace；team/single chat 行为一致。
- 建议测试：hook 单测；三种上传入口 E2E；WebUI 模式回归。
- 风险：如果当前项目区分“附件上传”和“工作区写入”，要避免把普通附件误写到项目目录。
- 实施结果（2026-05-27）：已把 `workspace` 参数从 `ConversationContext -> SendBox -> usePasteService/useDragUpload -> PasteService/FileService -> CoreUploadService` 全链路透传；Electron 与 WebUI 上传口径已统一。
- 验收备注：paste、drop、以及基于 `createUploadFile` 的附件创建现在都会显式带上当前工作区，避免“Work in project”下附件流程丢失 workspace 上下文。

### R-06 修复 streaming reply 边界和 thinking timer

- 上游参考：`89a1a7723 fix: preserve chat stream boundaries and thinking timers (#3036)`
- 问题表现：工具调用插入流式回复时，text/thinking 段可能合并错误；thinking 计时器在恢复历史会话时重新计时。
- 当前项目关注点：`src/common/chat/chatLib.ts`、`src/renderer/pages/conversation/ Messages hooks`、各平台 `use*Message.ts`、`ThoughtDisplay`/thinking 组件。
- 建议动作：把 message segment 边界作为一等状态处理；thinking 结束依赖下一个非 thinking event 或显式 done；历史消息使用持久化 duration。
- 验收标准：工具调用前后文本不串段；thinking 展示不重复计时；重开会话后 duration 固定；多轮工具调用 UI 稳定。
- 建议测试：message merging 单测；ACP/Aionrs 流式事件模拟；历史会话重开 DOM 测试。
- 风险：这是对话显示核心逻辑，需先构造事件样本再改。
- 实施结果（2026-05-27）：ACP 消息状态机已补充 `thinking` 收口逻辑，在 `content/agent_status/acp_permission/user_content/error/default` 等非 thinking 事件到达时主动结束 thinking 展示，减少只依赖 `finish` 导致的悬挂计时。
- 验收备注：本轮已完成首轮核心修复，优先解决“thinking 不结束/恢复时重复跑计时”的高频问题；后续建议再补事件样本级回归测试，覆盖更多多段 tool-interleave 场景。

### R-07 忽略缺少 call id 的工具调用

- 上游参考：`7eb92af1b fix(tool-calls): ignore calls without call IDs (#3035)`
- 问题表现：某些 agent/backend 返回无 call id 的 tool call，前端无法 merge/update，导致孤儿工具卡片或权限状态错乱。
- 当前项目关注点：`src/common/chat/chatLib.ts`、`src/process/agent/*`、`src/renderer/pages/conversation/Messages/hooks.ts`。
- 建议动作：在 normalize/merge 入口校验 call id；缺失时记录 warn 和原始 event 摘要；不要渲染不可追踪工具调用。
- 验收标准：缺 call id 的工具事件不会污染 UI；日志能定位来源；正常工具调用不受影响。
- 建议测试：tool call normalize 单测；message merge 单测。
- 风险：如果某个本地自研 agent 确实不提供 call id，需要先在 adapter 层补生成策略。
- 实施结果（2026-05-27）：`chatLib.transformMessage` 已对 `tool_call/acp_tool_call/codex_tool_call` 增加缺失 `callId/toolCallId` 的 warn+忽略；`composeMessage` 与消息列表增量合并逻辑也增加了二次防御，避免脏数据落到 UI。
- 验收备注：当前实现可确保无 id 的工具事件不会渲染成孤儿卡片，也不会污染后续 merge/update；正常 tool call 更新链路保持不变。

## 2. P1 核心能力增强

### R-08 GPU crash 自愈和 Sentry 过滤

- 上游参考：`5f7197235 fix(desktop): self-heal repeated GPU process crashes (#2945)`、`8b12b0b05 fix(sentry): filter native GPU crashpad fatals (#3033)`
- 建议动作：识别 Chromium GPU fatal；可恢复场景提示或切换 GPU 参数；不可恢复 crash 不刷屏 Sentry。
- 当前项目关注点：`src/process/utils/configureChromium.ts`、Sentry 初始化、主进程日志。
- 验收标准：重复 GPU crash 时应用尝试降级；Sentry 不被原生 GPU fatal 淹没；真实 JS crash 仍上报。

- ?????2026-05-27????? GPU crash ???????????????????? `child-process-gone/GPU` ??? `gpu-process-crashed` ?????????????? GPU fallback?????????Sentry ??? `beforeSend` ?? GPU crashpad ????????????????????GPU fallback ??? tags/context?
- ?????`npx tsc --noEmit --pretty false` ????????????? GPU fatal ???? Sentry????? JS ?????????
### R-09 反馈和诊断日志增强

- 上游参考：`ae59ef606 feat(sentry): startup log report + device_id + environment tags (#2982)`、`14c778a13 fix(feedback): include aionrs logs in Sentry feedback attachments`
- 建议动作：反馈入口收集主进程、renderer、agent/core、最近 N 天有效日志；附带 app.version、arch、os、device_id、运行模式。
- 当前项目关注点：`src/process/bridge/feedbackBridge.ts`、`src/process/feedback`、Sentry 配置、日志目录。
- 验收标准：用户提交问题时能自动附诊断包；日志不包含密钥；异常页面能一键打开反馈。

- ?????2026-05-27??????????????????????`userData/logs`?`aionrs/core/webui` ??????? `metadata.json`????????????hostname?deviceId????????????????????? token/key ???
- ???????????????????????????????????????????????????? token?
### C-01 统一 agent 元数据和能力发现

- 上游参考：`7a3b471c9 refactor(agent): unified AgentMetadata + fix Electron startup deadlock (#2707)`、`88085027d refactor(agent): drop acp.cachedModels fallback, read model list from backend /api/agents (#2869)`
- 建议动作：统一 agent_type、backend、name、logo、team_capable、supported_modes、model list 等字段；避免各页面各自判断。
- 当前项目关注点：`src/process/agent/AgentRegistry.ts`、`src/renderer/hooks/agent/*`、team/guid/settings agent 选择。
- 验收标准：Guid、Settings、Conversation、Team、Cron 显示同一套 agent 信息；新增 agent 只需注册一次。

- ?????2026-05-27??`CoreAcpGatewayService.getAvailableAgents()` ????????? agent descriptor??? `displayName/teamCapable/conversationType/supportedModes/modelInfo`?renderer ? `agentTypes/useConversationAgents/guid types` ????????????? preset assistant ???????
- ?????Cron?Conversation?Guid ????????? agent ???????? agent ??????????????? logo/?????
### C-02 slash commands 按 agent 动态加载

- 上游参考：`798e6bd5e feat(aionrs): enable slash command menu for aionrs conversations`、`f49a5903e fix(acp): display agent-specific slash commands for ACP conversations (#2914)`、`d5236dd94 fix(slash-commands): fix API response parsing and defer fetch until agent ready`
- 建议动作：slash commands 由当前会话 agent 提供；agent 未 ready 前延迟拉取；Skills 快捷命令和内置命令统一展示。
- 当前项目关注点：`src/renderer/hooks/chat/useSlashCommands.ts`、`useSlashCommandController.ts`、各 SendBox。
- 验收标准：Aionrs/ACP/Remote/team 会话命令准确；未初始化时不报 404；切换 agent 后命令刷新。

- ?????2026-05-27??`useSlashCommands` ?? `deferUntilReady` ? `agentStatus` gating?ACP SendBox ? agent ? ready ??????? slash commands????????????? `slash_commands_updated`/agent ready ?????
- ??????????? ACP/Aionrs ????????????? 404 ??????????????? agent readiness ?????
### C-03 统一工具权限确认和展示

- 上游参考：`936515b20 feat(acp): fix confirmation API params and deep-merge tool call updates (#2669)`、`c0278809e fix(acp): resolve Kimi tool confirmation 404 and workspace auto-refresh`
- 建议动作：统一 confirm payload；工具调用更新 deep merge；权限选项国际化；确认结果驱动 workspace 自动刷新。
- 当前项目关注点：`src/process/acp/session/PermissionResolver.ts`、`src/renderer/pages/conversation/Messages/components/MessageToolGroup.tsx`、`MessageAcpPermission.tsx`。
- 验收标准：不同 agent 的工具确认按钮行为一致；确认后工具状态准确更新；拒绝/超时有明确状态。

- ?????2026-05-27??ACP tool call ?????????? `content.update`??????????ACP ?????????????? `toolCallId` ???????????? ACP ???????????? workspace refresh?
- ???????????????? 404/????/?????????????`toolCallId` ???????????? fallback?
### C-04 团队会话 agent/model/workspace 一致性

- 上游参考：`94a12b8ed fix(team): include workspace in create team API request (#2915)`、`6b762f52d fix(team): resolve real model ID from handshake for ACP agents on team create`、`4e6ce73a8 perf(team): defer agent warmup until user starts typing (#2922)`
- 建议动作：创建 team 时写入 workspace；从 agent handshake 解析真实 model；延迟 warmup 降低启动成本。
- 当前项目关注点：`src/process/team`、`src/renderer/pages/team`、`TeamCreateModal`、team sendbox。
- 验收标准：team 创建后工作区正确；agent 模型与 UI 显示一致；进入 team 页面无明显卡顿。

- ?????2026-05-27??????/?????????????? `workspace + currentModelId + sessionMode` ????????? `useTeamSession` ????? `ensureSession` ?????????????????? Team session?
- ??????? Team ????????????? agent????????????Team ????????????????????? workspace/model/sessionMode?
### C-05 定时任务使用真实 agent/provider/model 信息

- 上游参考：`31cdd2cb8 fix(cron): source aionrs model from backend and fix agent display (#2880)`、`8e31f2ff6 fix(cron): show real vendor name and logo for ACP scheduled tasks (#2894)`
- 建议动作：cron job 保存 agent_type/backend/model/provider 快照；侧边栏和任务详情显示真实 vendor/logo。
- 当前项目关注点：`src/process/services/cron`、`src/renderer/pages/cron/useCronJobs.ts`、任务创建弹窗。
- 验收标准：Aionrs/ACP/team 定时任务显示准确；模型删除或变更后旧任务仍可解释。

- ?????2026-05-27??`ICronAgentConfig/CronStore` ??? `displayName/modelLabel/providerId/providerName/vendorName/logo` ???????????????? agent/provider/model ???????? `CronService` ??????? conversation/model ????????????????????????? agent/logo/provider/model?
- ??????????????????????????Cron UI ???? backend ??? logo/name??????????????????
## 3. P2 架构演进

### A-01 明确本地 core service 与上游 aioncore 的边界

- 上游参考：`a312ceedc` 到 `99076c480` 的 backend/API foundation 系列；后续 `aea815adb`、`db5aad399` 统一命名为 aioncore。
- 当前项目现状：已有 `src/process/core`、`src/common/coreClient`、Electron/HTTP adapter 的本地合流提交，但尚未完整迁到上游 `packages/desktop` 架构。
- 建议动作：先写边界文档，明确哪些留在 Electron main，哪些迁到独立 core/backend，哪些 renderer 只通过 client 调用。
- 验收标准：新增业务不再直接写 renderer/IPC 大杂烩；每个模块有清晰 owner 和接口。

### A-02 建立 HTTP/WS/core-client 适配层演进路线

- 上游参考：`feat(api): add HTTP client foundation`、`feat(api): add WebSocket client with reconnect`、`feat(adapter): replace IPC bridges with HTTP/WS API client`
- 建议动作：保留现有 IPC 兼容层，同时新增 typed core client；先迁移低风险读接口，再迁移写接口和 stream。
- 当前项目关注点：`src/common/adapter/ipcBridge.ts`、`src/common/coreClient/index.ts`、`src/process/adapters/*`。
- 验收标准：renderer 不关心 Electron/WebUI 运行环境；同一业务可通过 Electron adapter 或 HTTP adapter 访问。

### A-03 typed config service

- 上游参考：`feat(config): implement ConfigService with cache and subscriptions`、`refactor(config): migrate all consumer files from ConfigStorage to configService`
- 建议动作：建立 `ConfigKeyMap`；配置读写带类型、缓存和订阅；逐步替换散落的 `ConfigStorage.get/set`。
- 当前项目关注点：`src/common/config/storage.ts`、`src/process/utils/configMigration.ts`、renderer settings/hooks。
- 验收标准：配置键有类型约束；设置页修改后相关 UI 自动更新；迁移逻辑集中。

### A-04 Provider CRUD 服务化

- 上游参考：`428eb6ffd refactor(model-config): migrate IProvider to /api/providers CRUD`
- 建议动作：把 `model.config` 从整包覆盖式存储改成 provider CRUD；避免并发保存互相覆盖；保留导入/导出。
- 当前项目关注点：`src/process/bridge/modelBridge.ts`、`ModelModalContent.tsx`、`useModelProviderList.ts`。
- 验收标准：新增/删除/编辑 provider 幂等；删除后不复活；模型列表拉取错误不影响设置页渲染。

### A-05 Assistant/Skills 后端化

- 上游参考：`80a7abd6e feat(assistants): combined skills menu + assistant migration polish (#2916)`、`refactor(skill): route AcpSkillManager through backend HTTP`
- 建议动作：内置 assistant 和 skills 不再散落于 renderer/local resources；建立统一存储、索引、导入和启停 API。
- 当前项目关注点：`src/process/resources/skills`、assistant presets、skills hub、SendBox skill quick invoke。
- 验收标准：assistant 可绑定 skills；会话能加载 skills snapshot；移动端/桌面端 Skills 菜单一致。

### A-06 WebUI 后端统一

- 上游参考：`a677b8647 refactor(webui): decouple WebUI from Electron (M1-M9)`、`20ad7289a feat(webui): consolidate auth onto backend SQLite (#2816)`、`9ac37098e fix(webui): Switch truthful state + end SW poisoning that caused white screen (#2844)`
- 建议动作：WebUI 鉴权、目录浏览、静态资源状态、WebSocket 连接都走统一后端能力；避免 Electron-only API 泄漏。
- 当前项目关注点：`src/server.ts`、`src/process/webserver`、`src/renderer/api`、WebUI settings。
- 验收标准：WebUI 独立部署可登录；刷新不白屏；目录浏览和上传与桌面一致。

## 4. UI 和体验优化

### U-01 mobile sendbox 单行输入 + action sheet

- 上游参考：`7d3327c82 feat(sendbox): mobile sendbox redesign with action sheet (#3039)`
- 建议动作：移动端 sendbox 改为单行输入，`+` 打开底部 sheet；集中放模型、权限、附件、Skills；桌面行为保持不变。
- 当前项目关注点：`src/renderer/components/chat/sendbox`、各平台 SendBox、mobile CSS。
- 验收标准：手机宽度下输入区不拥挤；Skills 一点插入 `/skill-name `；模型/权限切换能同步 team chat。

### U-02 对话 header 重构

- 上游参考：`29fa66061 refactor(conversation): restructure chat header layout`、`f5c69aa95 refactor(header): move model selector to right side of header`、`e518f5238 refactor(header): move agent logo to title editor leading slot`
- 建议动作：把 title、agent logo、model selector、team icon、project 状态分区；移动端压缩标题栏高度。
- 验收标准：单聊/team/主页 header 不错位；模型和 agent 状态一眼可见；移动端不遮挡操作。

### U-03 工作区体验增强

- 上游参考：`b68873f08 feat(workspace): show reveal in folder for directories`、`749512d24 fix(workspace): expand folder on click without spinner flicker`、`d31c7f8ef fix(chat): guard workspace mention search fields`
- 建议动作：目录右键 reveal；文件树点击展开更顺滑；workspace mention 搜索字段加防御；工具完成后自动刷新 workspace。
- 验收标准：文件创建/修改后列表自动更新；目录操作符合桌面习惯；异常 workspace 数据不导致崩溃。

### U-04 设置页和偏好持久化

- 上游参考：`52330ecbc fix(settings): persist theme/colorScheme/language and window bounds on restart (#2991)`、`f34daf88b fix(settings): auto-expand newly added model providers`、`2fcaa140e fix(settings): Base URL 输入框遮挡`
- 建议动作：主题、语言、窗口尺寸、缩放、provider 展开状态稳定持久化；修复表单遮挡和错误态。
- 验收标准：重启后偏好不丢；新增 provider 自动展开；Base URL 长文本编辑不遮挡。

### U-05 Markdown 和消息阅读体验

- 上游参考：`123c82af0 feat(markdown): tune spacing and add hr/strong/code/blockquote styles`、`2e5579bb1 style(markdown): redesign code block and customize scrollbar`、`926797cb6 fix(markdown): apply mobile line-height to shadow DOM content`
- 建议动作：优化 code block、inline code、blockquote、hr、移动端行高；thinking/tool summary 样式统一。
- 验收标准：长代码可读且复制方便；移动端 Markdown 不挤；工具摘要不抢正文焦点。

### U-06 侧边栏和历史项目分组

- 上游参考：`f5dd0a520 feat(history): Codex-style project/conversation split + remove-project flow`、`b95c5441b feat(sider): visual system refresh`
- 建议动作：项目和会话分层展示；侧边栏操作按钮移动端始终可见；删除项目和删除会话流程分清。
- 验收标准：历史会话更容易按项目找；移动端无需 hover；删除操作有明确确认。

## 5. 工程质量和发布保障

### E-01 P0 修复测试补齐

- 建议范围：config migration、startup failure、quit cleanup、upload abort、workspace preservation、message merge、tool call normalize。
- 建议动作：每个 P0 项至少一个单测；关键用户链路补 DOM 测试或 Playwright smoke。
- 验收标准：`npm test` 或对应 vitest 子集通过；P0 回归有固定测试文件。

### E-02 核心链路 Playwright smoke

- 建议链路：首次启动、添加 provider、创建会话、选择项目、发送消息、工具权限确认、上传文件、创建 team、创建 cron、WebUI 登录。
- 验收标准：本地和 CI 能运行最小 smoke；失败截图和 trace 可定位。

### E-03 发布、升级、回滚检查清单

- 建议动作：维护 `release-smoke-checklist.zh-CN.md`、`windows-install-upgrade-rollback.zh-CN.md`；每次引入上游能力记录数据迁移和回滚策略。
- 验收标准：能从当前版本升级到新版本；能回滚且不损坏配置；打包产物包含必要 core/agent 资源。

## 6. 建议实施顺序

### 第一阶段：稳定性补丁包

目标：先减少用户可感知故障，不大改架构。

- R-01 配置迁移幂等
- R-02 启动失败诊断
- R-03 退出清理串行化
- R-04 上传切换取消
- R-05 paste/drop 保留 workspace
- R-06 streaming/thinking 修复
- R-07 tool call 缺 id 防御
- E-01 P0 测试补齐

### 第二阶段：Agent 和任务能力补齐

目标：让单聊、team、cron、skills、MCP 的 agent 体验一致。

- C-01 agent 元数据统一
- C-02 slash commands 动态加载
- C-03 工具权限确认统一
- C-04 team 会话一致性
- C-05 cron agent/model 展示准确
- R-08/R-09 观测增强
- E-02 Playwright smoke

### 第三阶段：核心架构演进

目标：决定是否全面靠拢上游 aioncore/API/WS 架构。

- A-01 core/aioncore 边界文档
- A-02 HTTP/WS/core-client 适配层
- A-03 typed config service
- A-04 provider CRUD
- A-05 assistant/skills 后端化
- A-06 WebUI 后端统一

### 第四阶段：移动端和体验 polish

目标：提升移动端、设置页、工作区、消息阅读和侧边栏体验。

- U-01 mobile sendbox action sheet
- U-02 header 重构
- U-03 workspace 体验增强
- U-04 设置页持久化和表单修复
- U-05 Markdown 阅读体验
- U-06 侧边栏/历史分组优化

## 7. 每项任务落地模板

后续拆具体 issue/任务时建议使用这个模板：

```md
## 背景

## 上游参考

## 当前项目差异

## 实施范围

## 不做范围

## 数据迁移/兼容性

## 验收标准

## 测试计划

## 回滚方案
```

## 8. 参考上游提交

- `v2.1.3`: `a815d07df chore: bump version to 2.1.3 and aioncore to v0.1.13`
- `#3040`: `25aa0beb6 fix(guid): keep workspace dir when pasting/dropping files`
- `#3039`: `7d3327c82 feat(sendbox): mobile sendbox redesign with action sheet`
- `#3036`: `89a1a7723 fix: preserve chat stream boundaries and thinking timers`
- `#3035`: `7eb92af1b fix(tool-calls): ignore calls without call IDs`
- `#3033`: `8b12b0b05 fix(sentry): filter native GPU crashpad fatals`
- `#3031`: `3d1309a1f fix(desktop): serialize quit cleanup`
- `#3030`: `3abb758f3 fix(startup): keep desktop open on backend failure`
- `#3019`: `507874e79 fix(upload): abort in-flight uploads when switching conversations`
- `#3018`: `e67ac7c12 fix(config-migration): stop deleted providers/assistants from resurrecting`
- `#2991`: `52330ecbc fix(settings): persist theme/colorScheme/language and window bounds`
- `#2916`: `80a7abd6e feat(assistants): combined skills menu + assistant migration polish`
- `#2898`: `44cdc6fc8 refactor(ipcBridge): align ACP endpoints with backend migration`
- `#2816`: `20ad7289a feat(webui): consolidate auth onto backend SQLite`
- `#2804`: `4a89db942 refactor(agent)!: migrate ACP/agent implementation to backend`
