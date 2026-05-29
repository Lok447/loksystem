# Team Runtime 重构方案

## 1. 背景

LokSystem 当前的“团队协作”功能，本质上是构建在多个 agent 运行时之上的一层产品级编排系统。它已经具备明确的业务价值：

- 以 leader 为中心的团队创建模型
- 每个成员独立的会话与聊天面板
- 共享工作区支持
- 团队级 mailbox、任务板与生命周期管理
- 基于 MCP 的团队协作工具

但随着系统复杂度提升，当前架构已经出现了明显的结构性摩擦：

- LokCLI 底层本身已经使用 Hermes 作为执行运行时
- 某些 backend 自己已经具备 agent / session 语义
- 团队编排又在 LokSystem 里重复实现了一层
- 不同类型 backend 被尽量塞进几乎同一套 team 控制流
- 很多关键协作规则仍然过度依赖 prompt，而不是显式 runtime contract

本文档提出一套正式的 Team Runtime 重构方案，目标是把当前团队功能演进成一个能力驱动、支持多编排模式的 Team Runtime：

- Hermes 优先，优先复用其原生多智能体能力
- 尽可能 backend 无关
- 必要时明确降级
- 同时兼容企业客户自有的 OpenClaw、OpenCode 或其他定制 CLI

## 2. 目标

### 2.1 核心目标

1. 将团队协作运行时重构为：在具备条件时，优先复用 Hermes 原生多智能体能力。
2. 保留 LokSystem 现有的产品体验：
   - Team 页面
   - 多成员聊天窗口
   - Workspace 集成
   - 权限展示
   - 成员级诊断与状态
3. 在可行范围内支持单个 team 内混用不同 backend。
4. 对非 Hermes backend 也尽可能发挥其协作优势，而不是简单视为“不支持”。
5. 将“基于 backend 名字写死逻辑”的实现方式，升级为“基于 capability 决定 orchestration mode”。

### 2.2 次级目标

1. 降低 prompt-only coordination 的比例。
2. 明确不同 backend 的 leader / worker 推荐角色。
3. 在 backend 能力不足时提供可感知、可解释的降级协作模式。
4. 通过分层降低长期维护成本，把产品体验与运行时内核解耦。

### 2.3 成功定义

后续实施时，必须明确“成功”不是一句笼统的“超过行业主流”，而应拆成三个层次：

1. 对齐层
   - 在团队协作运行时层面，达到当前主流 AI 协作方案的基本成熟度。
   - 包括：任务分发、成员状态、失败恢复、权限处理、长流程运行、可观测性。
2. 领先层
   - 在 LokSystem 擅长的方向形成差异化优势。
   - 包括：异构 backend 协作、产品化 team workspace、多成员可视化、企业自定义 CLI 接入。
3. 非目标层
   - 不把“底层模型能力强弱”误判为 Team Runtime 重构的直接结果。
   - 不把“框架生态规模”误判为单次重构可以立刻超越的目标。

换句话说，本次重构真正追求的是：

> 在“异构多智能体协作产品”这个方向达到行业一线水准，并在产品化协作体验与企业兼容性上形成领先优势。

## 3. 非目标

本次重构不以以下事项为目标：

1. 一次性重写所有现有 team UI。
2. 强行让所有 backend 都达到 Hermes 同等级别的原生协作能力。
3. 立即彻底删除全部现有 team runtime 代码。
4. 把所有 backend 都统一强制改造成 ACP。
5. 在第一阶段同时重构整个单聊运行时。

## 4. 现状

### 4.1 当前 runtime 形态

当前 team 栈主要围绕以下模块构建：

- `src/process/team/TeamSessionService.ts`
- `src/process/team/TeamSession.ts`
- `src/process/team/TeammateManager.ts`
- `src/process/team/TaskManager.ts`
- `src/process/team/mcp/team/TeamMcpServer.ts`

高层流程如下：

1. 创建 team 时指定一个 leader 和零个或多个 teammate。
2. 每个成员都拥有独立 conversation / session。
3. 团队协作由 LokSystem 自己实现，主要依赖：
   - mailbox 消息
   - task board 状态
   - wake / idle 生命周期
   - MCP team tools
4. 前端将每个成员渲染为 Team 页面中的独立聊天槽位。

### 4.2 当前 backend 接入形态

backend 检测与运行时接入目前散落在这些模块中：

- `src/process/agent/AgentRegistry.ts`
- `src/process/agent/acp/AcpDetector.ts`
- `src/common/types/acpTypes.ts`
- `src/process/task/*AgentManager.ts`
- `src/process/agent/openclaw/*`

关键现状：

1. LokCLI 以 ACP backend 元数据中 `hermes` backend 的形式暴露。
2. 许多 CLI 走 ACP 或 ACP-like 路径，例如：
   - codex
   - qwen
   - opencode
   - goose
   - kimi
   - codebuddy
   - droid
   - 其他 ACP backend
3. OpenClaw 采用 gateway-oriented runtime model。
4. remote / custom agent 可能结构化程度较弱，甚至接近黑盒执行器。

### 4.3 当前问题

#### 问题 A：双层编排

LokSystem 当前在一些本身就具有：

- session 语义
- worker 语义
- delegation 行为
- recovery 行为

的 runtime 之上，又额外实现了一层 team orchestration。

这在 Hermes 场景下尤其别扭，因为 LokCLI 底层本来就是 Hermes。

#### 问题 B：backend 支持模型过于粗糙

当前 team support 判断基本依赖：

- backend 的硬编码 allow / deny
- ACP initialize 结果里是否包含 MCP stdio

这不足以回答以下问题：

- 这个 backend 能否担任 leader？
- 是否只适合作为 worker？
- 是否支持结构化协作？
- 是否支持原生 orchestration？
- 是否应该以 degraded mode 运行？

#### 问题 C：不同 backend 被强行套进同一种协作模型

Hermes、ACP CLI、OpenClaw gateway、remote agent、custom agent 在运行时语义上并不相同，但当前实现仍然尽量让它们通过几乎同一套 team control flow 运作。

#### 问题 D：运行时行为过度依赖 prompt

很多关键规则依赖 prompt 自律：

- 先提 lineup proposal，再 spawn
- 不要在等待时长时间占着流式输出
- 依赖任务必须顺序派发
- 不要用错团队协作工具

这些规则本身正确，但其中相当一部分应该成为 runtime contract，而不仅是 prompt instruction。

#### 问题 E：team runtime 还不是真正的一等 orchestration domain

当前系统已经有不少有用原语，但尚未形成统一 orchestration abstraction，无法优雅支持：

- native orchestration
- protocol-coordinated orchestration
- gateway-coordinated orchestration
- degraded managed coordination

## 5. 架构方向

本次重构的核心变化是：

> 从“单一实现导向的 team orchestration”升级为“能力驱动、支持多 engine 的 Team Runtime”。

这意味着：

1. 保留产品壳层。
2. 引入正式的 Team Runtime 抽象。
3. 支持多种 orchestration engine。
4. 在可行时优先走 Hermes native orchestration。
5. 对非 Hermes backend 提供 protocol / gateway / degraded 的协作路径。

## 6. 设计原则

### 6.1 保留 UX，重做 runtime core

现有 team 产品体验本身很有价值，应当保留：

- 多成员视图
- 每个成员独立聊天面板
- workspace 侧边栏联动
- 模型与状态展示
- 权限可视化

因此这次重构聚焦 process / runtime 层，而不是推翻现有产品壳。

### 6.2 以 capability 为中心，而不是 backend 名字

不应继续主要以 backend 名字来决定 team 行为，例如：

- `backend === 'hermes'`
- `agentType === 'acp'`
- `backend in allowlist`

而应使用结构化 capability profile 来决定团队协作模式。

### 6.3 支持 heterogeneous team

单个 team 在理想状态下应能混合：

- Hermes leader
- ACP worker
- gateway worker
- managed custom worker

这对真实客户环境非常关键。

### 6.4 渐进式降级

不是所有 backend 都能提供同样强度的协作能力，这本身可以接受，前提是降级必须：

- 可感知
- 可解释
- 可观测
- 可建模
- 能在 UI 和诊断中体现

### 6.5 以 runtime contract 替代 prompt-only 规则

Prompt 仍然重要，但最关键的协作规则应该越来越多地由以下机制来保证：

- 明确任务图
- 成员状态机
- 显式派发 / 完成 / 失败事件
- 权限与工具边界
- 统一的恢复与重试策略

### 6.6 Hermes-first，但不做 Hermes-only

实施顺序应当是：

1. 先把 Hermes / LokCLI 路径做到最强。
2. 再把 ACP CLI 路径做成高质量 protocol worker。
3. 最后扩大到 OpenClaw / custom CLI / degraded worker。

同时必须避免三个误区：

- 不能一开始就追求所有 backend 完全等价。
- 不能为了“广覆盖”牺牲 Hermes-native 路径的深度。
- 不能为了“兼容”放弃 runtime contract 和可观测性建设。

### 6.7 多入口，同内核

后续产品演进可以存在多种协作入口，但不应为每一种入口再造一套协作运行时。

建议把协作能力分为三层：

1. 成员资产层
   - backend
   - preset assistant
   - custom assistant
   - future mention target
2. 协作入口层
   - 显式“组建团队”
   - 会话里 `@一个助手`
   - 会话里 `@多个助手`
   - future auto-escalated team
3. 统一运行时层
   - Team Runtime
   - capability resolver
   - orchestration mode
   - diagnostics / recovery / task graph

这意味着：

1. “组建团队协作”继续作为正式、显式建队的主路径。
2. “@助手协作”未来可以作为更轻量的产品入口。
3. 但两者底层都应尽量落到同一个 Team Runtime / execution plane 上，而不是分别实现两套 leader / worker、任务派发、降级恢复逻辑。

设计要求：

1. 产品入口可以并列演进，但技术实现不能同核分叉。
2. assistant identity 与 runtime identity 必须分离：
   - assistant 是人格 / 规则 / 技能 / 默认 backend 的封装
   - runtime 仍然要解析到底层 capability 与 orchestration mode
3. runtime 需要原生支持不同的协作发起方式，例如：
   - `manual_team_create`
   - `mention_single_assistant`
   - `mention_multi_assistant`
   - `auto_escalated_team`
4. runtime 需要支持不同的 team 生命周期形态：
   - 持久 team
   - 临时 team
   - 会话内临时协作 run

这部分不是当前阶段要立即完整实现的产品功能，但必须在 Phase 1 之后的 execution plane 设计里预留扩展点，避免后续“@助手协作”只能通过旁路逻辑接入，重新制造第二套 team runtime。

## 7. 目标架构

目标架构由五层组成，外加一个横切的可观测 / 可恢复平面。

### 7.1 Team Product Layer

职责：

- Team 页面
- Team 创建与管理 UI
- 成员聊天面板
- 状态标签、模式标签、告警与诊断展示
- 呈现 orchestration mode 与 degraded 状态

预期保留：

- team tabs 与 member panes
- team create modal 及相关 UI
- workspace 集成与会话切换体验

这一层不应拥有编排策略。

### 7.2 Team Domain Layer

引入新的 runtime-oriented domain layer。

建议核心对象：

- `TeamRuntime`
- `TeamRunContext`
- `TeamMemberHandle`
- `TeamTaskGraph`
- `TeamCapabilityProfile`
- `TeamDiagnostics`

职责：

- 表达团队运行时
- 选择 orchestration mode
- 协调 engine 与 adapter
- 汇总诊断、恢复、状态投影

### 7.3 Orchestration Engine Layer

定义统一 orchestration engine 接口。

建议接口：

- `ITeamOrchestrationEngine`
- `initialize()`
- `startRun()`
- `dispatchTask()`
- `interruptMember()`
- `resumeRun()`
- `collectDiagnostics()`
- `shutdown()`

建议实现：

- `HermesNativeOrchestrationEngine`
- `ProtocolCoordinatedEngine`
- `GatewayCoordinatedEngine`
- `ManagedMailboxEngine`
- `LegacyMailboxEngine` 作为过渡期兼容包装

### 7.4 Agent Adapter Layer

为不同 backend family 提供统一 member adapter 抽象。

建议接口：

- `ITeamMemberAdapter`
- `probeCapabilities()`
- `createSession()`
- `runTask()`
- `interrupt()`
- `resume()`
- `collectState()`

建议实现：

- `HermesMemberAdapter`
- `AcpMemberAdapter`
- `OpenClawMemberAdapter`
- `ManagedCliMemberAdapter`
- `RemoteMemberAdapter`

### 7.5 Capability Layer

引入专门的 team capability resolver，把 backend / runtime 元数据转换成协作能力。

建议输出结构：

```ts
type TeamBackendCapabilities = {
  backend: string
  family: 'hermes' | 'acp' | 'gateway' | 'managed' | 'remote' | 'unknown'
  teamCapable: boolean
  canLead: boolean
  canWork: boolean
  supportsNativeOrchestration: boolean
  supportsStructuredTasking: boolean
  supportsSharedWorkspace: boolean
  supportsInterruptResume: boolean
  supportsDiagnostics: boolean
  preferredRoles: Array<'leader' | 'worker'>
  preferredModes: Array<
    'native_orchestrator' | 'protocol_coordinated' | 'gateway_coordinated' | 'managed_mailbox'
  >
  caveats: string[]
}
```

这一能力层应替代当前粗粒度的 team support 判断。

### 7.6 Observability & Durability Plane

如果希望本方案最终对齐甚至部分超过当前主流 AI 协作方案，那么 Team Runtime 不能只有“能跑”，还必须具备一等公民级别的：

- 可观测性
  - 当前 team mode
  - 每个 member 的 capability / execution mode / degraded reason
  - 当前任务图、等待关系、失败原因、重试历史
  - 关键 runtime event 时间线
- 可恢复性
  - team runtime snapshot 持久化
  - member 状态恢复
  - task graph 恢复
  - 中断后恢复运行
  - 降级 / 回退后的状态一致性
- 可审计性
  - 谁派发了任务
  - 哪个 backend 以何种 mode 执行
  - 为什么某个 member 被降级或替换

这部分不是“锦上添花”，而是后续长流程协作、企业交付和稳定性治理的基础设施。

## 8. 四种协作模式

新的 runtime 应支持四种协作模式。

### 8.1 模式 A：Native Orchestrator

最佳适配：

- Hermes
- 未来任何支持真正 native delegation / subagent orchestration 的 backend

行为：

1. LokSystem 将 backend 视为真正的 orchestrator。
2. Team member 可以映射为 backend-native subagent。
3. LokSystem 主要承担：
   - control plane
   - UI 投影
   - 诊断与观测
   - 权限与 workspace 接入

适用场景：

- leader 能原生调度多个 worker
- runtime 能反馈明确的成员与任务状态

优势：

- 与底层 runtime 语义最一致
- 可以最大化复用 Hermes 后续演进成果

### 8.2 模式 B：Protocol Coordinated

最佳适配：

- Codex
- OpenCode
- Qwen
- 其他 ACP / ACP-like CLI

行为：

1. LokSystem 仍然担任顶层 orchestrator。
2. 成员通过结构化 coordination protocol 作为 worker 执行任务。
3. 协作更多依赖 runtime API，而不是 prompt 自律。

这是非 Hermes CLI 最主要的协作路径。

### 8.3 模式 C：Gateway Coordinated

最佳适配：

- OpenClaw
- 未来采用 gateway session model 的 backend

行为：

1. LokSystem 通过 gateway-aware adapter 进行协调。
2. Session lifecycle 与 communication 不再被强行套进 ACP 假设。
3. OpenClaw 作为独立 backend family 被一等公民化，而不是被当成 ACP 的变体。

### 8.4 模式 D：Managed Mailbox

最佳适配：

- remote agent
- 部分兼容的 custom CLI
- 实验性企业 backend

行为：

1. LokSystem 提供协作壳层。
2. backend 以较低保真度参与 team。
3. 可用能力会变弱，例如：
   - 结构化任务流较弱
   - 状态反馈较弱
   - 恢复能力有限

这个模式是实现企业兼容性的必要基础。

## 9. Backend 兼容策略

### 9.1 Hermes / LokCLI

Hermes 应成为 team orchestration 的优先原生 orchestrator。

建议角色：

- 默认 leader
- 也可承担关键 worker
- 最强的 recovery 与 orchestration 语义

策略：

1. 如果 Hermes 原生支持 delegation / subagent API，则使用 `HermesNativeOrchestrationEngine`。
2. 将 Hermes-native member 映射到 LokSystem 的 team UI。
3. LokSystem 主要负责：
   - 可视化
   - 状态同步
   - 权限展示
   - 诊断汇总

### 9.2 ACP CLI，例如 Codex / OpenCode / Qwen

这些 backend 非常适合作为专项 worker。

建议角色：

- protocol worker
- 在 protocol mode 下可选 leader
- 强工具执行能力

策略：

1. 使用 `ProtocolCoordinatedEngine`。
2. 把它们视为 task-oriented worker，而不是假设它们具备 Hermes 那种原生 multi-agent。
3. 在 UI 上明确推荐角色：
   - leader 可选但非默认推荐
   - worker 推荐

### 9.3 OpenClaw

OpenClaw 应被当成 gateway family，而不是硬塞进 ACP 心智模型。

建议角色：

- gateway worker
- 特定场景下可作为 gateway leader

策略：

1. 使用独立的 `OpenClawMemberAdapter`。
2. 在适当场景下使用 `GatewayCoordinatedEngine`。
3. 避免强行把 OpenClaw 行为假设为 ACP stdio worker。

### 9.4 企业自定义 CLI

企业客户可能拥有行为各异的定制 CLI。

策略：

1. 能自动探测 capability 的尽量自动探测。
2. 当自动探测不够时，允许管理员手工标注 capability。
3. 至少支持以 managed mode 参加团队协作。
4. 在 capability 不完整时限制高风险角色：
   - 只能做 worker
   - 禁止原生编排
   - 视情况禁用 interrupt / resume

## 10. Team Capability 建模

目标不是仅判断“支不支持 team”，而是回答：

1. 这个 backend 能否做 leader？
2. 是否只能做 worker？
3. 是否支持 shared workspace？
4. 是否支持 structured task execution？
5. 是否支持 interrupt / resume？
6. 是否能参与 native orchestration？
7. 推荐的 team mode 是什么？

### 10.1 新的 capability resolver

新增：

- `TeamCapabilityResolver`

输入：

- backend metadata
- detector 输出
- runtime family
- initialize / probe 结果
- 可选的管理员 overrides

输出：

- 结构化 `TeamBackendCapabilities`
- 推荐角色与 orchestration mode

### 10.2 在 UI 上可见的 capability 标签

Team 创建与 team 管理 UI 应展示：

- leader recommended
- worker recommended
- future support
- experimental
- degraded mode
- unsupported

同时提供简短解释文案，帮助用户理解为什么该 backend 当前适合某个角色。

## 11. 数据模型变更

当前持久化的 team model 应扩展 orchestration metadata。

### 11.1 建议新增的 team 级字段

```ts
type TeamRuntimeMetadata = {
  orchestrationMode?:
    | 'native_orchestrator'
    | 'protocol_coordinated'
    | 'gateway_coordinated'
    | 'managed_mailbox'
    | 'legacy_mailbox'
  runtimeVersion?: string
  capabilitySnapshotVersion?: string
  diagnosticsSummary?: string[]
}

type TeamMemberRuntimeMetadata = {
  backendFamily?: 'hermes' | 'acp' | 'gateway' | 'managed' | 'remote' | 'unknown'
  resolvedRole?: 'leader' | 'worker'
  executionMode?:
    | 'native'
    | 'protocol'
    | 'gateway'
    | 'managed'
    | 'legacy'
  parentRuntimeId?: string
  nativeSubagentId?: string
  protocolSessionId?: string
  capabilitySnapshot?: TeamBackendCapabilities
  degradedReasons?: string[]
}
```

### 11.2 Migration 预期

1. 根据 leader / backend capability 为存量 team 回填 orchestration mode。
2. 在迁移时快照每个 member 的 capability。
3. 对无法准确推断的 team 标记 legacy 状态。

## 12. 任务模型变更

当前 task board 是一个不错的基础，但应演进为更强的协作任务模型。

### 12.1 建议新增字段

扩展任务模型：

- `taskId`
- `parentTaskId`
- `dependsOn`
- `assignedMemberId`
- `taskType`
- `taskStatus`
- `dispatchReason`
- `retryCount`
- `lastFailureReason`
- `runtimeEvents`

示例方向：

- 支持并行任务
- 支持依赖链
- 支持失败重分配
- 支持等待原因可视化

### 12.2 为什么重要

更强的 task model 能支持：

- 可恢复执行
- 可解释等待
- 更精确的 leader 调度
- 更可信的诊断与回放

## 13. 运行时行为变更

### 13.1 Leader 行为

当前 leader 的很多职责应逐步从 prompt 迁移到 runtime enforcement：

- lineup proposal 的结构化输出
- spawn 前置校验
- task 派发与依赖检查
- 失败后的重试 / 改派
- 对成员状态的超时与等待管理

### 13.2 Worker 行为

worker 应根据 backend family 区分处理：

- Hermes worker：尽量复用原生能力
- ACP worker：走结构化 protocol
- gateway worker：走 gateway adapter
- managed worker：走受限模式

不能继续假设所有 worker 具有同样的控制保真度。

### 13.3 事件模型

新的 runtime 应围绕结构化 team events 工作，而不是主要依赖 mailbox 约定与 prompt 驱动解释。

建议事件：

- `team.run.started`
- `team.run.mode_selected`
- `team.member.spawned`
- `team.member.degraded`
- `team.task.dispatched`
- `team.task.blocked`
- `team.task.completed`
- `team.task.failed`
- `team.run.interrupted`
- `team.run.resumed`

### 13.4 协作竞争力的核心不只是“能调起多个 agent”

真正的竞争力来自以下能力：

1. 长流程任务
   - 多轮依赖任务
   - 跨回合协作
   - 运行中断后的恢复
2. 异构 backend 分工
   - 让 Hermes / Codex / OpenCode / OpenClaw 各自做最合适的工作
3. 失败后继续推进
   - 某个 worker 崩溃后自动重分配
   - 某个 backend 能力不足时自动降级
4. 团队态势可理解
   - 用户和开发者都能看懂当前 team 为什么这样运行

如果这些做不好，那么即使形式上支持多 backend、多 member，也很难达到主流方案的成熟度。

## 14. 故障与降级策略

降级必须成为正式支持的一部分。

### 14.1 Hermes 不可用

回退策略：

- 优先从 `native_orchestrator` 降级到 `protocol_coordinated`
- 再不行则降级到 `managed_mailbox`

同时记录：

- native orchestration 不可用原因
- 当前 fallback mode
- 对用户的能力影响

### 14.2 Worker 不支持 MCP stdio 或 structured coordination

回退策略：

- 降级到 managed worker
- 对复杂依赖任务链做限制
- 在 UI 上提示能力边界

### 14.3 OpenClaw gateway 异常

行为：

- 将 member 标记为 degraded
- 尽量重分配任务
- 只要 leader 和其他成员正常，不应拖垮整个 team runtime

### 14.4 企业 custom CLI capability 不完整

行为：

- 限制其只能承担低风险 worker 职责
- 在 team 创建与 runtime diagnostics 中清晰提示 caveats

## 15. 建议的代码组织

### 15.1 新增模块

建议新增：

- `src/common/team/TeamCapabilityResolver.ts`
- `src/process/team-runtime/TeamRuntime.ts`
- `src/process/team-runtime/engines/*`
- `src/process/team-runtime/adapters/*`
- `src/process/team-runtime/diagnostics/*`
- `src/process/team-runtime/recovery/*`

### 15.2 现有模块可保留或包装

建议保留并适配：

- team UI
- team create flow
- agent registry 与 detector 基础设施
- renderer 侧状态展示
- mailbox / task board 中仍有价值的原语

### 15.3 现有模块需要缩小职责或重定义角色

随着重构推进，以下模块不应继续作为唯一的 orchestration truth source：

- `TeamSessionService`
- `TeammateManager`
- prompt 文件作为 runtime enforcement 的主要来源
- backend allowlist / denylist 风格的判断逻辑

## 16. 实施计划

### Phase 0：Capability 建模

目标：

- 在不改变现有 team runtime 行为的前提下，引入 capability-driven backend classification

交付物：

- `TeamCapabilityResolver`
- 新的 capability types
- team UI 标签与 backend recommendation
- capability-aware team filtering

验收标准：

1. Team 创建 UI 能解释某个 agent 为什么是：
   - leader recommended
   - worker recommended
   - degraded
   - unsupported
2. team support 不再只是简单依赖硬编码 backend 列表。

建议补充的界面体验 / 手动验证：

1. 打开 Team 创建弹窗，逐个查看可选 backend / preset assistant 的文案是否能明确说明：
   - 哪些更适合 leader
   - 哪些更适合 worker
   - 哪些只是未来支持或实验性支持
2. 在 Hermes、Codex、Qwen、OpenClaw Gateway、custom CLI 之间来回切换，确认推荐标签与解释文案符合直觉：
   - Hermes 更偏 leader
   - Codex / Qwen 更偏 worker
   - gateway / custom CLI 会显示约束说明
3. 在 Team guide 或团队引导文案里确认当前 runtime 是否明确提示其更适合 leader 还是 worker。

### Phase 1：Runtime 抽象

目标：

- 把当前 team implementation 收口到统一 engine abstraction 后面

交付物：

- `ITeamOrchestrationEngine`
- `TeamRuntime`
- `LegacyMailboxEngine`
- 与现有 team session factory 的集成

验收标准：

1. 现有 team feature 行为基本保持不变。
2. 当前 runtime 能通过新的 engine abstraction 被访问。

建议补充的界面体验 / 手动验证：

1. 创建一个最基础的 team：
   - 1 个 leader
   - 1 到 2 个 teammate
   确认创建成功后 Team 页面交互、成员面板和消息流没有明显回退。
2. 在 Team 页面中让 leader 发起一次简单任务，确认：
   - leader 能正常响应
   - teammate 仍能被正常唤起
   - 当前 runtime 重构不会导致可见行为异常
3. 验证从创建 team 到执行任务再到查看结果的路径，对普通用户来说没有额外学习成本。

### Phase 2：Hermes Native Path

目标：

- 让 Hermes / LokCLI 成为首个真正的 native team orchestration backend family

交付物：

- `HermesNativeOrchestrationEngine`
- Hermes team bridge
- subagent-to-UI mapping
- native team member state mirroring

验收标准：

1. Hermes-led team 可以不再主要依赖 legacy mailbox / wake 模型来完成编排。
2. Team UI 仍然能展示 member-level activity 与 output。
3. Task 与 member state 对用户仍然清晰可见。

建议补充的界面体验 / 手动验证：

1. 使用 LokCLI(Hermes) 创建 team，让 leader 承担一个真实的多步骤任务，确认能看到明显的团队协作过程：
   - leader 先分析任务
   - leader 分派子任务
   - 各成员状态同步到 UI
2. 在 Team 页面观察完整链路：
   - leader 提 proposal
   - 确认阵容
   - spawn teammates
   - 派发任务
   - 执行中
   - 汇总结果
   尽量确认这套过程不是依赖 legacy mailbox 假装出来的。
3. 对比重构前后的 Hermes-led team，确认用户主观上能感受到“更像真的团队在协作”，而不是多个单聊拼起来。

### Phase 2.5：Observability / Durability 加固

目标：

- 在扩展更多 backend 之前，先补齐团队运行时的可观测、可恢复、可审计基础设施

交付物：

- `TeamEventStore`
- `TeamRuntimeSnapshotStore`
- `TeamDiagnosticsService`
- `TeamRecoveryCoordinator`
- runtime timeline / degraded reason / task graph diagnostics

验收标准：

1. 任意一个 team run 都能回答：
   - 当前使用什么 orchestration mode
   - 为什么选择这个 mode
   - 哪些 member 已降级，原因是什么
   - 哪些 task 在等待，为什么等待
2. Runtime 中断后，能够恢复 team snapshot 与 task graph 的核心状态。
3. 关键故障能够形成结构化诊断输出，而不仅是散落日志。

建议补充的界面体验 / 手动验证：

1. 在 Team 页面或诊断面板里查看一个正在运行的 team，确认用户能直接看懂：
   - 当前 orchestration mode
   - 当前 leader / worker runtime 角色
   - 是否存在 degraded member
2. 人为制造一次中断或异常：
   - 关闭一个成员
   - 重新打开 team
   确认系统能恢复到可继续工作的状态，而不是只能重新开始。
3. 检查失败任务的诊断展示是否足够清晰：
   - 为什么失败
   - 由谁失败
   - 后续如何恢复或重试

### Phase 3：Protocol Worker Path

目标：

- 将 ACP CLI 升级为结构化 team worker

交付物：

- `ProtocolCoordinatedEngine`
- `AcpMemberAdapter`
- 升级后的 team coordination protocol
- 减少 prompt-only coordination 依赖

验收标准：

1. Codex / OpenCode / Qwen 作为 worker 能在 Hermes 或 protocol leader 之下稳定协作。
2. 任务派发、完成、失败、重分配通过显式 runtime path 处理。

建议补充的界面体验 / 手动验证：

1. 创建一个 Hermes leader + Codex / Qwen worker 的 team，观察用户是否能自然理解：
   - leader 负责统筹
   - codex 负责实现
   - qwen 负责补充分析
   而不是感觉只是把多个 agent 并排摆放。
2. 让 leader 给 worker 派发真实任务，确认状态流可见：
   - 已派发
   - 执行中
   - 阻塞或等待
   - 执行完成
   - leader 汇总
3. 故意让某个 worker 失败，确认界面能够表达重试、改派或降级后的行为变化。

### Phase 4：Gateway Worker Path

目标：

- 让 OpenClaw 以及未来 gateway backend 成为一等 team participant

交付物：

- `OpenClawMemberAdapter`
- `GatewayCoordinatedEngine`
- gateway-aware degradation 与 recovery logic

验收标准：

1. OpenClaw member 能参与 team，而不是假装自己是 ACP worker。
2. Gateway session lifecycle 被显式建模。

建议补充的界面体验 / 手动验证：

1. 把 OpenClaw 成员加入 gateway member 型 team，确认 team 页面能表达：
   - 它是 gateway 成员
   - 它不是 ACP worker 伪装形态
2. 让 OpenClaw member 参与一次真实任务，观察：
   - 是否能被派发
   - 是否能回传结果
   - 异常时是否出现 degraded / fallback 提示
3. 验证 gateway 中断后的恢复体验是否对用户足够清晰，不会变成黑盒。

### Phase 5：企业兼容与 UX 完成

目标：

- 完成 mixed-backend enterprise team 的支持

交付物：

- custom backend capability override
- worker-only restriction
- degraded mode diagnostics
- UI 上的 role recommendation
- 更强的 runtime observability

验收标准：

1. 企业 custom CLI 可以通过手工 capability annotation 被接入。
2. mixed team 能在限制清晰的前提下安全创建与运行。

建议补充的界面体验 / 手动验证：

1. 配置一个企业自定义 CLI 的 capability annotation，并尝试加入 team，确认界面会明确说明：
   - 它支持什么
   - 它不支持哪些能力
   - 它是否只能作为 worker
2. 创建一个 mixed-backend team，例如：
   - Hermes leader
   - Codex worker
   - OpenClaw gateway worker
   - 一个 custom managed worker
   确认创建过程中的限制提示、推荐文案和风险提示足够清楚。
3. 以普通用户视角完整走一遍：
   - 创建团队
   - 提 proposal
   - 确认阵容
   - 运行复杂任务
   - 查看失败 / 恢复
   确认整体 UX 不是“能用”，而是真的可理解、可控、可纠偏。

## 17. 迁移策略

### 17.1 向后兼容

过渡期应支持已有 team：

1. 现有 team 能继续正常加载。
2. 现有 team 初期继续走 `LegacyMailboxEngine`。
3. 新 orchestration mode 在稳定前通过 capability 与 feature flag 渐进启用。

### 17.2 Rollout 策略

建议 rollout 顺序：

1. 初期先通过 feature flag 隐藏
2. 先落 Hermes-native path
3. 再补 protocol worker path
4. 最后再增强 gateway / enterprise compatibility

### 17.3 持久化迁移

建议：

- 尽量懒回填
- 对 runtime metadata 采用版本化字段
- 通过 versioned migration logic 管理

## 18. 测试与评测策略

测试范围应超出现有 e2e 团队用例。

### 18.1 单元测试

新增以下方向的 unit tests：

- capability resolver
- mode selection
- engine fallback
- member adapter 行为
- prompt / runtime capability 文案一致性

### 18.2 集成测试

新增以下集成测试覆盖：

- Hermes leader + ACP worker
- Hermes leader + gateway worker
- mixed backend degraded path
- runtime recovery path

### 18.3 端到端测试

扩展 team e2e 场景：

1. team create with role recommendation
2. proposal -> spawn -> dispatch -> complete
3. worker failure -> retry / reassign
4. degraded mode display
5. orchestration mode display 与 fallback behavior

### 18.4 Benchmark / Eval 体系

如果后续希望用这份方案指导实施，并判断是否真正达到主流水平，那么必须建立专门的 team benchmark，而不是只看单 agent 测试。

建议新增：

1. 团队协作基准任务
   - 并行调研
   - 实现 -> 评审 -> 测试流水线
   - 混合 backend 团队协作
2. 关键指标
   - 任务完成率
   - 首次完成时间
   - 失败恢复成功率
   - 错误降级率
   - 人工干预次数

## 19. 风险

### 风险 A：Hermes native integration surface 目前可能还不够稳定

缓解方式：

- engine abstraction 先行
- 过渡期保留 legacy path
- 不让 Hermes native path 直接污染全部 team 逻辑

### 风险 B：mixed-backend 语义会变得过于复杂

缓解方式：

- 明确 capability model
- 明确 role recommendation
- 用 mode label 与 caveat 清晰表达限制

### 风险 C：UI 复杂度上升

缓解方式：

- 只把关键模式信息前置
- 将高阶 mode 细节放到二级信息面板

### 风险 D：过渡期会同时存在两套 runtime

缓解方式：

- 明确过渡期边界
- 为 legacy 退役设定清晰 exit criteria

## 20. 退出标准

当满足以下条件时，可认为本次重构达到预期：

1. Hermes-led team 已将 native orchestration 作为首选生产路径。
2. ACP backend，例如 Codex、OpenCode，可以作为稳定的 protocol worker。
3. OpenClaw 能作为一等 gateway worker 参与 team。
4. 企业 custom CLI 能通过 managed mode 与 richer capability profile 参与 team。
5. team support 的判断已从硬编码 allowlist 升级为 capability-driven。
6. 关键协作规则更多由 runtime contract 保证，而不是主要依赖 prompt discipline。
7. Team UX 至少不弱于当前产品体验。
8. Team Runtime 已具备可观测、可恢复、可审计的基础能力，而不是只能依靠日志排障。
9. 已存在专门的 team benchmark / eval 体系来验证协作质量。

### 20.1 行业对齐的判断标准

后续实施时，不建议用“是不是全面超过所有主流方案”作为判断标准，而应采用更现实的三层判断：

1. 已对齐
   - 在 runtime 能力、稳定性、流程完整度上达到主流水平。
2. 局部领先
   - 在异构 backend 协作、企业 CLI 接入、产品化 team workspace 上形成优势。
3. 仍需追赶
   - 在底层模型能力、生态规模、通用框架成熟度上继续补齐。

这样可以避免实施过程中的目标漂移或不切实际的预期管理。

## 21. 推荐决策

推荐的产品与架构决策如下：

1. 将 Hermes 作为 team collaboration 的优先 native orchestration backend。
2. 不把 team collaboration 硬绑定为 Hermes-only。
3. 构建一个正式的 multi-engine Team Runtime，用于支持：
   - native orchestration
   - protocol worker collaboration
   - gateway collaboration
   - managed enterprise compatibility
4. 通过 backend capability profile，在尽可能保持协作质量的同时最大化企业兼容性。

这条路线能够在以下几个维度取得最好的平衡：

- 产品连续性
- 技术正确性
- 对 Hermes 演进能力的复用
- 对客户异构 CLI 环境的现实支持能力

### 21.1 实施优先级声明

后续所有开发工作都应遵循以下优先级：

1. 先做 `Hermes-led native team mode`
2. 再做 `protocol worker collaboration`
3. 再补 `observability / durability`
4. 最后扩展 `OpenClaw / custom CLI / degraded enterprise path`

如果出现资源冲突，应优先保证：

- Hermes-first 主链路深度
- Team Runtime 的可观测与可恢复能力
- 明确的 capability-driven 行为边界

而不是优先追求“所有 backend 看起来都能加入 team”。
