# LokSystem 与上游 aioncore 边界说明

更新时间：2026-05-27

## 目标

这份文档用于补齐 `A-01` 和 `A-02` 在当前仓库中的落地边界，明确：

- 哪些能力继续保留在 Electron main / 本地进程侧
- 哪些能力已经收口到 `src/process/core`
- 哪些能力应逐步通过 `src/common/coreClient` 暴露给 renderer / WebUI
- 后续向上游 `aioncore + HTTP/WS` 结构靠拢时，应优先迁移哪一层

## 当前分层

### 1. Renderer 层

职责：

- 页面渲染、交互、表单状态、临时 UI 状态
- 仅消费 `ipcBridge` 或 `getRendererCoreClient()`
- 不直接持有主进程资源，不直接操作数据库、文件系统、子进程

当前约束：

- 新功能优先从 `getRendererCoreClient()` 进入，避免继续扩散 `conversation.*` / `database.*` 风格的直连 IPC
- 与 workspace、ACP session、conversation 读取有关的新读取链路，优先走 transport-neutral client

### 2. Adapter / Bridge 层

当前目录：

- `src/common/adapter/ipcBridge.ts`
- `src/process/bridge/*`
- `src/process/adapters/coreClient/*`
- `src/process/webserver/*`

职责：

- 把 renderer / HTTP 请求转换成 core service 可理解的 DTO
- 负责 Electron IPC、Express Route、事件流桥接
- 不承载业务规则，只做参数校验、错误映射、兼容旧接口

演进原则：

- 旧 IPC 可以继续保留，但应逐步改成“壳子接口”，内部统一委托给 core service / core client
- 新增 WebUI 接口优先挂在 `/api/core/*` 下，而不是再发明一套平行语义

### 3. Core Service 层

当前目录：

- `src/process/core/auth`
- `src/process/core/uploads`
- `src/process/core/sessions`
- `src/process/core/tasks`
- `src/process/core/acp`
- `src/process/core/workspaces`
- `src/process/core/shared`

职责：

- 业务规则、运行时状态、事件定义、领域契约
- 作为桌面端、WebUI、未来独立 backend 的共同收口层

落地判断标准：

- 只要一个能力会同时被桌面端和 WebUI 使用，就应优先沉到 core service
- 只要一个事件可能被多个 transport 复用，就应先定义到 `shared/CoreEvent.ts`

### 4. Electron main 专属层

保留在 main 进程、暂不向上游 `aioncore` 抽离的能力：

- BrowserWindow / Tray / Pet / Ambient 等桌面壳能力
- 安装包、更新、窗口生命周期、原生菜单
- 本地文件打开、系统 reveal、外部应用唤起
- Electron-only preload / crash / startup coordination

判断原则：

- 任何强依赖 Electron API 的能力，继续留在 main shell
- 如需给 renderer 暴露，只通过 bridge 或 core facade 暴露结果，不向 renderer 泄漏 Electron 对象

## 与上游 aioncore 的建议边界

### 适合逐步对齐到 aioncore / backend 的部分

- auth：登录态、token、密码校验、WebUI 鉴权
- sessions：会话读写、发送消息、停止会话、历史读取
- acp：session snapshot、mode / model / config option 的读取与写入
- workspaces：目录树、刷新、检索、workspace 元信息
- tasks：运行时任务状态、队列、事件流
- uploads：上传元数据、目标 workspace、取消与清理

### 暂不建议抽离的部分

- 标题栏、窗口布局、托盘、桌宠、启动失败弹窗
- 桌面端“打开目录 / 打开终端 / reveal in explorer”
- 安装包升级器、Squirrel / electron-builder 交付逻辑

## 推荐迁移顺序

### 阶段 1：统一读接口

- renderer 读取 conversation / workspace / acp session 时优先走 `getRendererCoreClient()`
- 老 IPC 保持兼容，但内部逐步转调 core service

### 阶段 2：统一写接口

- conversation send/stop
- ACP mode/model/config 写入
- workspace refresh / upload / reveal 之外的通用操作

### 阶段 3：统一事件流

- 以 `core.events.stream` 为唯一前端订阅入口
- IPC stream 作为桌面 transport 适配器
- WebUI 侧补齐 HTTP + WS / SSE 的等价事件出口

### 阶段 4：拆 Electron-only 壳逻辑

- 把业务规则继续往 core 下沉
- main 进程只保留桌面生命周期和原生 API 封装

## 本仓库当前状态结论

- `src/process/core` 已经是正确的业务收口方向
- `docs/core-client-contract.md` 已具备 transport-neutral contract 雏形
- `getRendererCoreClient()` 已经是 renderer 侧最值得继续扩展的统一入口
- 当前尚未完成的关键点，不在“有没有核心层”，而在“还有多少业务继续绕回旧 IPC/旧路由”

## 后续执行建议

1. 新增能力默认先问一句：是否应该落到 `core service + core client`。
2. 新增 WebUI 能力时，优先补 `/api/core/*`，不要继续堆独立 route 语义。
3. 旧 bridge 保留兼容期，但验收标准要改成“内部是否已委托 core service”。
4. 事件流相关任务统一记录在 `core.events.stream` 演进清单下，避免 renderer 再次出现多入口订阅。
