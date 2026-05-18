# LokSystem 二次开发阶段存档

## Phase 1 - Hermes / Lok CLI 核心 Agent 集成

日期：2026-05-16

### 改造目标

- 将 Hermes v13.0 作为 LokSystem 默认本地核心 Agent。
- 以 `Lok CLI` 作为 Hermes 在界面和 Agent 注册层的显示名称。
- 保留国内及主流开源 CLI，如 Qwen、CodeBuddy、Kimi、OpenCode、OpenClaw、Codex 等。
- 禁用并隐藏用户明确要求移除的默认国外 CLI 入口：Gemini、Claude、Aionrs（旧默认 CLI）。
- 保持助手创建和团队协作能力继续基于 ACP 抽象层工作，并默认使用 Hermes/Lok CLI。

### 核心变更

- `src/common/types/acpTypes.ts`
  - 将 `hermes` 后端配置为 `Lok CLI`。
  - 配置 Hermes ACP 启动命令为 `hermes acp`。
  - 配置 Hermes 原生 skills 目录为 `.hermes/skills`。
  - 将 `claude.enabled` 设置为 `false`。
- `src/process/agent/AgentRegistry.ts`
  - 新增默认 `Lok CLI` 检测项，优先级高于其他检测项。
  - 默认检测列表过滤 `aionrs`、`claude`、`gemini`。
  - 不再创建默认 Gemini/Aionrs Agent。
- `src/renderer/pages/settings/AgentSettings/LocalAgents.tsx`
  - Agents 设置页隐藏 `gemini` 和 `aionrs`。
  - 移除旧 Aion/Gemini 特殊顶卡逻辑。
- `src/renderer/pages/guid/hooks/*`
  - 主聊天默认 Agent 从旧 Gemini/Aion 默认链路切换为 Hermes。
  - 预设助手默认 `presetAgentType` 回退为 `hermes`。
  - 空 Agent 不再回退创建 Gemini 会话。
- `src/common/config/presets/assistantPresets.ts`
  - 内置预设助手默认 Agent 类型从 `gemini` 改为 `hermes`。
- `src/process/utils/initStorage.ts`
  - 预设助手初始化 fallback 从 `gemini` 改为 `hermes`。
- 团队协作相关文件
  - `src/common/types/teamTypes.ts`
  - `src/process/team/TeamSessionService.ts`
  - `src/process/team/mcp/guide/TeamGuideMcpServer.ts`
  - `src/process/team/mcp/team/TeamMcpServer.ts`
  - `src/process/team/TeammateManager.ts`
  - `src/process/team/prompts/teamGuidePrompt.ts`
  - 团队模式默认和 fallback 切换到 Hermes/Lok CLI，并禁用 `aionrs`、`claude`、`gemini` 团队能力入口。
- `src/renderer/utils/model/agentModes.ts`
  - 新增 Hermes 模式配置：`default`、`yolo`。

### 测试与验证记录

- 依赖安装：
  - 安装 VS Build Tools 2022 Spectre 缓解库组件：`Microsoft.VisualStudio.Component.VC.Runtimes.x86.x64.Spectre`。
  - 重跑 `npm install` 后，`better-sqlite3`、`keytar`、`node-pty`、`tree-sitter-bash` 原生依赖 rebuild 全部成功。
- Windows symlink 环境：
  - 开启开发者模式注册表项：
    - `AllowDevelopmentWithoutDevLicense = 1`
    - `AllowAllTrustedApps = 1`
  - Node symlink smoke test 通过。
- Phase 1 目标测试：
  - `npx vitest run tests/unit/guidAgentHooks.dom.test.ts tests/unit/renderer/team/TeamCreateModal.dom.test.tsx tests/unit/aionMcpServer.test.ts tests/unit/acpDetector.test.ts tests/unit/team-agentSelectUtils.test.ts tests/unit/teamMcpServerEvents.test.ts tests/unit/teamGuideWhitelist.test.ts tests/unit/process/agent/agentRegistryDeduplicate.test.ts tests/integration/team-mcp-server.test.ts tests/unit/team-TeamMcpServer.test.ts tests/unit/AcpAgentManagerSkillInjection.test.ts tests/unit/process/team/modelListHandler.test.ts`
  - 结果：12 个测试文件通过，197 个测试通过。
- 类型检查：
  - `npx tsc --noEmit`
  - 结果：通过。

- 构建：
  - `npm run package`
  - 结果：通过。
- symlink 相关测试：
  - `npx vitest run tests/unit/channels/channelSendProtocol.test.ts tests/unit/extensions/fileResolver.test.ts tests/unit/extensions/pathSafety.test.ts`
  - 结果：3 个测试文件通过，17 个测试通过。
- 全量测试：
  - `npm test`
  - 结果：439 个测试文件通过，7 个跳过；4525 个测试通过，51 个跳过，22 个 todo。
  - 仅 `tests/integration/i18n-performance.test.ts` 在全量并发运行时出现一次性能阈值波动。
  - 单独重跑 `npx vitest run tests/integration/i18n-performance.test.ts` 通过，8 个测试通过。

### 当前验收结论

- Phase 1 Hermes/Lok CLI 集成主路径已完成并通过目标测试、类型检查、构建验证。
- Windows 本地原生依赖和 symlink 环境问题已处理完成。
- 全量测试剩余问题为性能阈值偶发波动，不属于 Hermes/Lok CLI 第一阶段改造逻辑失败。

### 手动验证问题修复记录

日期：2026-05-18

- 问题 1：创建助手弹窗的主 Agent 默认值仍为 `gemini`。
  - 修复：将助手创建、编辑、复制流程的默认 `presetAgentType` 回退值统一改为 `hermes`。
  - 修复：助手 Agent 下拉框过滤 `aionrs`、`claude`、`gemini`，避免被旧数据或检测结果带回。
- 问题 2：使用 Lok CLI 新建聊天后 Hermes ACP 进程立即退出。
  - 诊断：本机 `D:\AI\hermes-agent-main\.venv\Scripts\hermes.exe acp` 输出 `ACP dependencies not installed.`。
  - 环境修复：为 Hermes 虚拟环境安装 `agent-client-protocol==0.10.0`。
  - 环境修复：设置用户环境变量 `HERMES_CLI_PATH=D:\AI\hermes-agent-main\.venv\Scripts\hermes.exe`。
  - 代码修复：Lok CLI 默认注册逻辑优先读取 `HERMES_CLI_PATH`，并在本机开发环境下自动识别 Hermes venv 可执行文件。
  - 验证：使用 Hermes ACP `initialize` JSON-RPC 握手测试，返回 `agentInfo.name = hermes-agent`，`version = 0.11.0`。
- 修复后目标测试：
  - `npx vitest run tests/unit/acpDetector.test.ts tests/unit/process/agent/agentRegistryDeduplicate.test.ts tests/unit/guidAgentHooks.dom.test.ts tests/unit/renderer/team/TeamCreateModal.dom.test.tsx tests/unit/process/team/modelListHandler.test.ts`
  - 结果：5 个测试文件通过，51 个测试通过。
- 类型检查：
  - `npx tsc --noEmit`
  - 结果：通过。

## Phase 2 - UI / 品牌 / 功能删除改造

日期：2026-05-19

### 改造目标

- 完成产品品牌从 `AionUi` 到 `LokSystem`、从 `Aion CLI` 到 `Lok CLI` 的界面与文案替换。
- 删除用户明确要求移除的国外 CLI、市场安装、反馈、问题报告、远程连接、CSS 设置、桌面宠物和国外 WebUI Channel 入口。
- 保留 Lok CLI/Hermes 主线、国内 CLI、OpenCode/OpenClaw 等可切换能力。
- 保留“发现外部技能”能力模块，只隐藏 `Gemini CLI`、`Claude Code` 等国外来源按钮，避免影响本地技能发现链路。

### 主聊天页面改造

- 全局硬编码品牌文案已替换为 `LokSystem` / `Lok CLI`。
- 删除 Header 中的 `AionUi Skills Market` 入口。
- 删除 Header 中的“远程连接”入口。
- 删除 Footer 中“想吐槽或提建议？”、“喜欢我们？点个星吧”等按钮。
- 删除问题报告/反馈弹窗入口及相关调用，避免界面残留。

### 设置页面改造

- 删除 Gemini CLI 设置页面入口与 `GeminiSettings.tsx` 页面。
- 删除 CSS 设置功能界面入口，保留底层 UnoCSS/主题能力配置。
- 删除桌面宠物设置页、渲染入口、preload 文件和主进程宠物管理模块。
- 删除 Agent 设置页“从市场安装”模块，并删除 `AgentHubModal.tsx`。
- 设置 - Agents / 能力扩展列表中过滤 Gemini、Claude、Anthropic、Aion CLI 等国外 CLI 展示入口。
- 模型平台列表按需求保留 OpenRouter、DeepSeek、MiniMax、Novita、Dashscope、SiliconFlow、Zhipu、Moonshot (China)、Ark、Qianfan、Hunyuan，并保留 OpenAI 兼容层。
- 关于页面已重新排版，仅保留“联系我”和“官网”两个必要入口。

### 能力扩展与外部技能

- 新增 MCP/Agent 展示过滤逻辑，避免 Gemini CLI、Claude Code、Anthropic、Aion CLI 在能力扩展、MCP 状态、添加 MCP 弹窗中出现。
- 根据复核要求回退“发现外部技能”能力模块删除动作，继续保留外部技能扫描与发现能力。
- 外部技能最终策略调整为：后端继续扫描 `~/.gemini/skills`、`~/.claude/skills` 等目录，前端隐藏 `Gemini CLI`、`Claude Code` 来源按钮。
- 新增外部技能来源过滤工具，供设置页和助手添加技能弹窗复用，保证界面不展示国外 CLI 按钮但不破坏技能发现能力。

### WebUI / Channel 改造

- 设置 - WebUI - Channel 仅保留 Lark/Feishu、DingTalk、WeChat、WeCom 等国内/本地可控渠道。
- 删除 Telegram、Slack、Discord 相关界面卡片、Tab、图标和配置入口。
- 删除 Telegram 配置表单与后端 Telegram 插件注册，移除 Telegram 插件实现文件。
- Channel 管理与桥接层同步移除国外 Channel 的默认注册与展示路径。

### 定时任务、助手与团队

- 定时任务页面描述从 “AionUi 帮你创建” 调整为 “LokSystem 帮你创建”。
- 创建助手、编辑助手、复制助手的默认主代理回退值统一为 `hermes`。
- 预设助手启动链路改为通过内置后端配置解析 Hermes/Lok CLI，避免使用旧的 `gemini` 默认值。
- 团队协作和助手能力继续复用 ACP 抽象层，Hermes/Lok CLI 可作为 Leader 或成员代理参与协作。

### 问题修复记录

- 修复 Lok CLI 聊天上传文件后只能显示图标、发送后无法读取附件内容的问题。
  - `InputPreprocessor` 改为异步读取并解析 Office/PDF 等附件内容。
  - `AcpSession` 发送用户消息前等待附件预处理完成。
- 修复创建助手后进入指定助手聊天窗口时报 `Session failed to start` 的问题。
  - `AcpAgentManager` 支持通过内置助手配置解析 preset assistant，并回退到 Hermes/Lok CLI 可执行路径。
  - 渲染端默认 agent 类型从旧 `gemini` 路径统一切换到 `hermes`。

### 验证记录

- UI 手动验收：
  - 主聊天页确认无 Skills Market、反馈/问题报告、GitHub Star、远程连接入口。
  - 设置 - Agents / 能力扩展确认保留 Lok CLI、国内 CLI、OpenCode/OpenClaw 等入口，隐藏 Gemini CLI、Claude Code 等国外按钮。
  - 设置 - 模型确认仅展示需求指定的平台与 OpenAI 兼容层。
  - 设置 - WebUI - Channel 确认仅展示 Lark/Feishu、DingTalk、WeChat、WeCom。
  - 关于页确认仅保留“联系我”和“官网”。
- 目标单测：
  - `npx vitest run tests/unit/process/acp/session/InputPreprocessor.test.ts`
  - `npx vitest run tests/unit/renderer/conversation/useConversationAgents.dom.test.ts tests/unit/createConversationParams.test.ts tests/unit/process/acp/session/InputPreprocessor.test.ts`
- 构建验证：
  - `npm run package`
  - 结果：通过；仅存在 Vite chunk/dynamic import 相关已知警告，不影响阶段二验收。

### 当前验收结论

- Phase 2 UI / 品牌 / 功能删除改造已完成，并经过手动 UI 验收、目标单测和打包构建验证。
- “发现外部技能”模块按用户最新要求保留，界面仅去除 Gemini CLI、Claude Code 等国外按钮。
- 阶段二已满足进入第三阶段 Hermes 深度集成优化的前置条件。
