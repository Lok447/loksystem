# 仓库迁移备注

本备注用于说明 `loksystem-fork-sync` 仓库迁移后，哪些路径依赖已经收口，哪些仍需人工关注。

## 已收口

- Hermes CLI 本地探测不再内置开发机专用路径 `D:\AI\hermes-agent-main\...`
- 打包产物会额外扫描旧仓库路径 `C:\tmp\loksystem-fork-sync`，若仍被写入产物会直接失败
- Manual Build 工作流不再只上传安装包，现会保留 updater 元数据，方便核对 macOS arm64 / Windows x64 更新链路
- Release 分发工作流会同步镜像 `latest*.yml`，避免 CDN 只有安装包、缺少更新元数据

## 仍需人工确认

### 1. 外部 Hermes CLI 安装位置

- 若团队机器仍使用独立安装的 Hermes CLI，请优先通过环境变量 `HERMES_CLI_PATH` 指定
- 若未设置该变量，系统会尝试：
  - 用户目录下的 `hermes-agent-main/.venv/...`
  - `PATH` 中的 `hermes`

### 2. 日志与缓存目录说明

- 生产环境日志目录由平台标准目录决定，不应再手工写死仓库路径
- 开发模式仍可能出现 `LokSystem-Dev`、`LokSystem-Dev-2` 目录，这属于 userData / 日志隔离策略，不属于仓库迁移残留
- 若对外编写操作文档，应明确区分：
  - 生产：`LokSystem`
  - 开发：`LokSystem-Dev`
  - 多实例开发：`LokSystem-Dev-2`

### 3. 本地脚本与说明文档

- 个别说明文档仍可能提到历史目录示例（如 `C:\tmp\loksystem-fork-sync`）
- 这类内容不影响运行，但在对外文档或团队交接材料中建议统一改成相对路径或当前仓库路径
- `scripts/create-mock-release-artifacts.sh`、`scripts/prepare-release-assets.sh`、`scripts/verify-release-assets.sh` 仍然依赖 Bash / Unix 工具链；Windows 本地验收时请通过 Git Bash 或 WSL 执行，而不是直接在 PowerShell 中裸跑 `.sh`
- 已验证可用的 Windows 调用方式：

```powershell
& "C:\Program Files\Git\bin\bash.exe" -lc "cd /d/tmp/loksystem-fork-sync && ./scripts/create-mock-release-artifacts.sh build-artifacts LokSystem 1.0.0 && ./scripts/prepare-release-assets.sh build-artifacts release-assets && ./scripts/verify-release-assets.sh release-assets LokSystem"
```

### 4. 快捷方式 / 部署辅助脚本

- 打包后生成的 `LokSystem-Deploy.*` 仍需按 smoke checklist 验证：
  - 文件名
  - 图标
  - README 文案
  - 启动后是否引用了错误的旧路径

## 建议的迁移后验证动作

- 在新仓库目录执行一次 `npm run package`
- 对 `out/` 产物全文搜索 `C:\tmp\loksystem-fork-sync`
- 启动应用并验证 Lok CLI 主链路
- 用旧配置目录做一次冷启动升级验证

## 当前验收目标

下周结束前，至少达到以下状态：

- 可打包
- 可启动
- Lok CLI 可完成主链路
- 旧用户升级不炸
