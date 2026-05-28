# LokCLI / Hermes 架构收口迁移指南

## 1. 背景

当前项目中，`LokCLI`、`hermes`、`aionrs` 三套概念在不同层面并存：

- 用户心智与产品表达希望统一为 `LokCLI`
- 进程侧默认内置 Agent 与一部分成熟能力体系仍基于 `hermes`
- 会话、模型、聊天等多个前端/运行时链路已大量使用 `aionrs`

这导致首次体验、运行时识别、配置命名、会话类型、设置页命名之间存在明显割裂。

本指南用于指导后续将项目逐步收口到以下目标架构，并持续跟踪落实情况。

## 2. 目标架构

### 2.1 用户侧唯一概念

- 用户只看到 `LokCLI`
- 首次体验只关心“是否已完成模型服务/API Key 配置”
- 其他 CLI 作为扩展能力存在，不参与首次主路径

### 2.2 内部运行时

- 安装包默认内置并部署 `Hermes Runtime`
- 首页默认内置的 `LokCLI` 实际调用本地 `hermes`
- `aionrs` 不再作为长期主运行时路线，仅保留兼容层职责

### 2.3 统一原则

- 产品名称统一：`LokCLI`
- 内核运行时统一：`hermes`
- 配置命名统一：`lokcli.*`
- 新会话类型统一：`lokcli`
- `aionrs` 仅保留历史兼容与迁移用途

## 3. 非目标

- 不在本阶段内重做全部聊天页 UI
- 不在本阶段内重构所有 ACP 体系
- 不在本阶段内删除全部历史兼容代码
- 不让其他 CLI 继续干扰普通用户首次体验

## 4. 分阶段计划

> 说明：
> - `[ ]` 未开始
> - `[~]` 进行中
> - `[x]` 已完成

### 阶段 0：统一语义与约束

目标：在团队和代码层先统一口径，避免继续扩散 `LokCLI / hermes / aionrs` 混用。

状态：`[ ]`

任务：

- [ ] 明确产品侧唯一名称为 `LokCLI`
- [ ] 明确内部默认 runtime 为 `hermes`
- [ ] 明确 `aionrs` 仅为兼容层，不再新增主功能依赖
- [ ] 明确新配置命名使用 `lokcli.*`
- [ ] 明确新会话类型使用 `lokcli`
- [ ] 在关键核心文件补充注释，说明迁移方向

建议关注文件：

- `src/common/types/acpTypes.ts`
- `src/process/agent/AgentRegistry.ts`
- `src/renderer/pages/guid/hooks/useGuidSend.ts`

### 阶段 1：运行时收口到 Hermes

目标：保证安装包安装后，默认可用的 LokCLI 实际由内置 Hermes Runtime 承接。

状态：`[~]`

任务：

- [x] 为 Hermes 增加 bundled runtime 解析链路
- [x] Hermes 优先从安装包资源目录解析，再 fallback 到环境变量/PATH
- [x] 打包链路补齐 `prepareHermes()`，并接入 `electron-builder` 资源
- [x] 首页默认内置 LokCLI 对应的运行时入口统一映射到 `hermes`
- [x] 对检测结果补充内部运行时标识，避免 UI 名称与 backend 再次混淆

建议关注文件：

- `scripts/build-with-builder.js`
- `src/process/agent/AgentRegistry.ts`
- `src/process/task/AcpAgentManager.ts`
- 新增 `src/process/agent/hermes/*` runtime resolver 或等价实现

阶段验收：

- [ ] 安装包安装后，不依赖用户 PATH，也能找到 Hermes
- [ ] 首页默认内置 LokCLI 能被稳定检测到

### 阶段 2：配置层从 `aionrs.*` 迁移到 `lokcli.*`

目标：完成模型配置与默认模型配置命名收口。

状态：`[~]`

任务：

- [x] 新增 `lokcli.config`
- [x] 新增 `lokcli.defaultModel`
- [x] 读取顺序优先 `lokcli.*`，再 fallback 到 `aionrs.*`
- [x] 新写入只写 `lokcli.*`
- [x] 启动时执行一次轻量迁移，将旧配置迁到 `lokcli.*`

建议关注文件：

- `src/renderer/pages/guid/hooks/useGuidModelSelection.ts`
- `src/renderer/pages/guid/hooks/agentSelectionUtils.ts`
- `src/renderer/pages/conversation/utils/createConversationParams.ts`
- `src/process/utils/initStorage.ts`

阶段验收：

- [ ] 新用户仅产生 `lokcli.*`
- [ ] 老用户升级后无需重新配置模型

### 阶段 3：首次体验收口为“配置 API Key 后立即开始”

目标：让普通中文用户首次登录后只被引导做一件事：配置模型服务。

状态：`[ ]`

任务：

- [~] `/guid` 默认入口表达统一为 `LokCLI`
- [x] 未配置模型时显示轻量提示卡，不做全屏接管
- [x] 用户发送前若未配置模型，直接拉起快速配置弹层
- [ ] 快速配置只保留：
  - `DeepSeek`
  - `阿里百炼`
  - `自定义兼容接口`
- [~] 首用链路中去掉 `aionrs`、`Hermes`、CLI 安装等概念暴露

建议关注文件：

- `src/renderer/pages/guid/GuidPage.tsx`
- `src/renderer/pages/guid/hooks/useGuidSend.ts`
- `src/renderer/pages/settings/components/AddPlatformModal.tsx`
- `src/renderer/pages/settings/AionrsSettings.tsx`

阶段验收：

- [ ] 新用户只感知“先配模型服务，再开始用 LokCLI”
- [ ] 首用链路不再暴露 `aionrs` 和 `Hermes`

### 阶段 4：会话类型从 `aionrs` 迁移到 `lokcli`

目标：把新会话、新 draft、新 sessionStorage、新数据库写入统一到 `lokcli`。

状态：`[~]`

任务：

- [x] 新建 LokCLI 会话统一写 `type: 'lokcli'`
- [ ] 运行时再映射到底层 Hermes
- [x] 旧 `aionrs` / `gemini` 会话读取兼容到 `lokcli`
- [x] sessionStorage 键迁移到 `lokcli_initial_message_*`
- [x] 保留旧键读取兼容窗口

建议关注文件：

- `src/renderer/pages/guid/hooks/useGuidSend.ts`
- `src/renderer/pages/conversation/components/ChatConversation.tsx`
- `src/renderer/hooks/chat/useSendBoxDraft.ts`
- `src/process/services/database/types.ts`
- `src/process/services/database/migrations.ts`

阶段验收：

- [ ] 新会话全部使用 `lokcli`
- [ ] 旧 `aionrs` 会话仍能正常打开与续聊

### 阶段 5：其他 CLI 下沉到“扩展能力”

目标：把主路径与扩展路径彻底分开。

状态：`[ ]`

任务：

- [ ] 其他 CLI 不再干扰首页默认体验
- [ ] 本地 Agent 设置页聚焦“已检测到的扩展 CLI”
- [ ] 提供“一键安装 / 重新检测”入口
- [ ] `openclaw`、`opencode`、`kimi` 等作为扩展能力呈现

建议关注文件：

- `src/renderer/pages/settings/AgentSettings/LocalAgents.tsx`
- `src/renderer/components/agent/AgentSetupCard.tsx`
- `src/process/extensions/hub/HubInstaller.ts`

阶段验收：

- [ ] 普通用户首用链路不依赖其他 CLI 是否安装
- [ ] 进阶用户可在扩展区安装/管理其他 CLI

### 阶段 6：清理 `aionrs` 兼容层

目标：在迁移稳定后，移除 `aionrs` 作为主路径概念与主要代码分支。

状态：`[ ]`

任务：

- [ ] 停止新增 `aionrs.*` 读写
- [ ] 下线 `Aionrs*` 命名组件和目录
- [ ] 清理 `aionrs` 主分支判断
- [ ] 保留必要的历史会话/数据库读取兼容

建议关注文件：

- `src/renderer/pages/settings/AionrsSettings.tsx`
- `src/renderer/pages/conversation/platforms/aionrs/*`
- `src/renderer/pages/guid/hooks/useAgentAvailability.ts`

阶段验收：

- [ ] `aionrs` 不再是主运行时与主会话路径
- [ ] 仅剩少量受控兼容代码

## 5. 推荐实施顺序

1. 阶段 0：统一语义与约束
2. 阶段 1：运行时收口到 Hermes
3. 阶段 2：配置层迁移到 `lokcli.*`
4. 阶段 3：首次体验收口
5. 阶段 4：会话类型迁移到 `lokcli`
6. 阶段 5：其他 CLI 下沉到扩展区
7. 阶段 6：清理 `aionrs` 兼容层

## 6. 实施原则

- 先收口运行时与配置，再改首页体验
- 先做兼容读写，再做物理重命名
- 不要让普通用户路径受其他 CLI 安装状态影响
- 不要在未完成 runtime 收口前，提前承诺“安装完成后只需填 Key 就能用”

## 7. 当前落实记录

### 最新状态

- `[x]` 已回退此前的全屏首次引导实验，回到讨论前状态
- `[x]` 本迁移指南已建立，作为后续持续跟踪文档
- `[~]` 已开始第一阶段代码实施：已完成 Hermes runtime 统一解析入口与 bundled 打包资源接入
- `[x]` 阶段 1 剩余项已完成：检测结果 DTO 与前端 Agent 归一化已补充 `productKey / runtimeKey / isBuiltinRuntime`，设置页可明确识别“内置 LokCLI / Hermes Runtime”
- `[~]` 阶段 2 已进入实装：`lokcli.config` / `lokcli.defaultModel` 已落地，读取优先 `lokcli.*`，并保留对 `aionrs.*` 的兼容回退
- `[~]` 阶段 3 已按轻量方案落地首批实现：`/guid` 在未配置模型时显示轻提示卡；用户尝试发送时会弹出“去模型管理配置”弹窗，不再使用全屏首次引导
- `[~]` 阶段 4 已进入实装：新建 LokCLI 会话开始写入 `type: 'lokcli'`，旧 `gemini` / `aionrs` 会话、draft 与 initial message 已兼容迁移到 `lokcli`
- `[~]` LokCLI 进程侧已补出独立 `LokCliManager` 包装层，运行中事件、活动快照、聊天页 backend 开始按 `lokcli` 对外表述，不再只以 `aionrs` 身份暴露
- `[x]` 首用主链路中的“请安装 aionrs”类提示已去除，未配模型/创建失败时改为引导检查模型服务配置
- `[~]` 团队页、会话页、设置页已继续将 `Aionrs*` 对外命名壳收口到 `LokCli*`：Router 新增 `/settings/lokcli`，TeamPage / TeamChatView / ChatConversation 已优先切换到 `LokCliChat`、`LokCliModelSelector`、`useLokCliModelSelection`
- `[~]` LokCLI 工作区事件、草稿存储与发送框交互已继续从 `aionrs.*` 迁到 `lokcli.*`：`ChatWorkspace` 默认 `eventPrefix` 改为 `lokcli`，ChatSider / TeamChatEmptyState / SendBox / AionrsSendBox 的新链路已优先使用 `lokcli.selected.file*` 与 `lokcli.workspace.refresh`
- `[x]` 本轮验证通过：`npm run build:renderer:web`

### 备注

- 后续每完成一个阶段或关键子任务，直接更新本文件状态与记录
- 如实施过程中发现目标架构需调整，也应先更新本文件再继续改代码
- 本轮已覆盖的关键链路：
  - Guid 首页、会话创建参数、团队创建/切换入口，新的 LokCLI 会话默认写入 `lokcli`
  - `sessionStorage` 初始消息键优先使用 `lokcli_initial_message_*`，同时兼容旧 `aionrs_initial_message_*`
  - 团队页、空态草稿、审批检查、运行中 token/sessionMode 持久化、数据库读取均已兼容 `lokcli`
  - Agent 检测结果新增 `LokCLI -> Hermes` 运行时映射元信息，前端展示层可在不暴露内部复杂度的前提下识别内置运行时
  - 首页首用体验改为轻量提示卡 + 发送拦截弹窗，统一引导到 `/settings/model`
  - `lokcli` 会话的进程侧创建与任务管理已开始从 `AionrsManager` 兼容命名中抽离，对外事件源与活动归类改为 `lokcli`
- 当前仍保留的兼容实现：
  - 团队页、会话页、设置页主入口已经新增 `src/renderer/pages/conversation/platforms/lokcli/*` 包装层，以便在不打断历史 `Aionrs*` 实现的情况下继续对外收口
  - 渠道与助手配置弹窗（ChannelModalContent、DingTalk/Lark/Wecom/Weixin ConfigForm 等）仍使用 `AionrsModelSelector` / `useAionrsModelSelection` 命名，暂未纳入本轮主链路改造，可作为后续阶段 6 的清理项
  - `Aionrs*` 目录、事件前缀与部分运行时命名暂未物理重命名，当前仍作为 LokCLI 的兼容承载层
  - `lokcli -> hermes` 的最终运行时收口仍需继续推进，现阶段 `lokcli` 会话已能稳定走兼容运行链路
