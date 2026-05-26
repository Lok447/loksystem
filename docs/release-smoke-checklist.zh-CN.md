# 发版 Smoke Checklist

适用范围：LokSystem 桌面端发布前的最后一轮 smoke 验收，重点覆盖 Windows x64 安装包、macOS arm64 元数据、Lok CLI 主链路，以及升级迁移风险。

## 1. 打包前置

- 确认当前分支版本号已更新：`package.json`、发布 tag、变更日志一致。
- 在目标仓库根目录执行：`npm run package`。
- 若本地网络受限，确认 `resources/hub/` 已存在缓存资源；本地打包允许回退到缓存，不应再因为 Hub 资源刷新失败而阻塞。
- Windows 打包前确认没有正在运行的 `LokSystem.exe` / `electron.exe` 旧进程。

## 2. 产物命名与元数据

### Windows x64

- 产物名符合：`LokSystem-<version>-win-x64.exe`
- 若生成 zip，同步检查：`LokSystem-<version>-win32-x64.zip`
- `latest.yml` 存在，且其中 `path` / `files[].url` 指向 Windows x64 产物

### macOS arm64

- 产物名符合：`LokSystem-<version>-mac-arm64.dmg`
- `latest-arm64-mac.yml` 存在
- `latest-arm64-mac.yml` 中 `path` / `files[].url` 指向 `LokSystem-<version>-mac-arm64.dmg`
- 若仅构建了 arm64，仍需确认 `latest-mac.yml` 指向可用的 macOS 产物

### 通用检查

- 不应再出现旧仓库路径：`C:\tmp\loksystem-fork-sync`
- 发布镜像时必须同步上传 `latest*.yml`，不能只传安装包

## 3. 安装与桌面端外观

- 应用图标正确：安装包图标、桌面快捷方式图标、任务栏 / Dock 图标一致
- 安装后可执行文件名称仍为 `LokSystem`
- About 页面显示：
  - 产品名为 `LokSystem`
  - 版本号与本次发版一致
  - 品牌文案中不出现旧品牌 / 调试品牌
- 启动页 / Splash / 首屏加载状态中品牌为 `LokSystem`
- 默认语言符合预期（当前发版默认值），首次启动不出现错误 locale 或空白文案

## 4. Lok 品牌与静态页面

- 主窗口标题、HTML `title`、应用名元信息均为 `LokSystem`
- WebUI 静态官网页可正常打开
- 静态官网页中的 logo、标题、下载文案、页脚品牌均为 `LokSystem`
- 不出现 `LokSystem-Dev`、旧仓库路径、开发机个人目录等泄漏信息

## 5. Hermes / Lok CLI 主链路

按顺序验收以下链路：

1. 新建会话
2. 上传附件
3. Lok CLI 成功读取附件
4. Lok CLI 生成 workspace 文件
5. 桌面端 workspace 面板可见该文件
6. WebUI 同步后也可见该文件

通过标准：

- 首条消息发送不报错
- 附件不会退化为丢失引用
- workspace 文件创建后，前端列表刷新正常
- 不需要手工切换旧路径或修改本地临时目录

## 6. 旧用户升级迁移

- 使用旧配置启动时，应用可正常完成初始化
- 老用户数据保留：
  - 历史会话
  - 自定义助手
  - 旧 workspace 配置
  - MCP / 模型基础配置
- `assistants` / `acp.customAgents` 分流迁移后无重复、无丢失
- 不应把内置 MCP 的机器本地路径错误迁移到新环境
- 启动后数据库迁移不报错，不出现启动即崩或卡死

## 7. 交付结论模板

建议在每次 smoke 后记录以下结论：

- 打包：通过 / 失败
- 启动：通过 / 失败
- Windows x64 安装包：通过 / 失败
- macOS arm64 元数据：通过 / 失败
- Lok CLI 主链路：通过 / 失败
- 旧用户升级迁移：通过 / 失败
- 剩余风险：按阻塞 / 非阻塞列出
