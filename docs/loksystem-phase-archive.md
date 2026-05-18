# LokSystem 二次开发阶段存档

## Phase 1 - Hermes / Lok CLI 核心 Agent 集成

日期：2026-05-16

### 改造目标

- 将 Hermes v13.0 作为 LokSystem 默认本地核心 Agent。
- 以 `Lok CLI` 作为 Hermes 在界面和 Agent 注册层的显示名称。
- 保留国内及主流开源 CLI，如 Qwen、CodeBuddy、Kimi、OpenCode、OpenClaw、Codex 等。
- 禁用并隐藏用户明确要求移除的默认国外 CLI 入口：Gemini、Claude、Aionrs/Aion CLI。
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

