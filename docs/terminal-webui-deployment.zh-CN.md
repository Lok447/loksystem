# LokSystem 终端一键部署说明

本项目现在会在安装包里额外生成一组终端部署脚本，方便用户拿到安装包后直接启动 WebUI 部署模式。

## 目标

- Windows：支持 PowerShell 和 Command Prompt
- macOS：支持 Terminal / iTerm 的 `zsh`、`bash`
- 启动后直接进入 `--webui` 模式
- 默认开启 `--remote`，便于局域网或远程访问
- 保留终端日志输出，便于查看首次启动密码、访问地址和故障信息

## 安装包内生成的文件

### Windows

- `LokSystem-Deploy.ps1`
- `LokSystem-Deploy.cmd`
- `LokSystem-Deploy-README.txt`
- 桌面快捷方式：`LokSystem Deploy WebUI`
- 开始菜单入口：`LokSystem Deploy WebUI`

这几个文件会位于安装后的应用目录，与 `LokSystem.exe` 同级。

### macOS

- `loksystem-deploy.sh`
- `loksystem-deploy.command`
- `LokSystem-Deploy-README.txt`

这几个文件会位于 `LokSystem.app/Contents/MacOS/` 目录，与主可执行文件同级。

## 用法

### Windows PowerShell

```powershell
.\LokSystem-Deploy.ps1
.\LokSystem-Deploy.ps1 --local --port 3000
.\LokSystem-Deploy.ps1 --browser
```

### Windows Command Prompt

```bat
LokSystem-Deploy.cmd
LokSystem-Deploy.cmd --local --port 3000
```

### macOS zsh / bash

```bash
./loksystem-deploy.sh
./loksystem-deploy.sh --local --port 3000
./loksystem-deploy.command --browser
```

## 参数

- `--remote`：绑定到 `0.0.0.0`，默认开启
- `--local`：仅绑定 `localhost`
- `--port <端口>`：指定期望端口
- `--browser`：启动后尝试打开浏览器
- `--help`：查看帮助

## 行为说明

- 脚本会把参数转发给主程序，并自动补上 `--webui`
- 如果不传 `--local`，脚本会自动追加 `--remote`
- 终端不会立即退出，方便用户持续查看运行日志
- 用户可通过 `Ctrl+C` 停止部署进程

## 适用场景

- 本机一键拉起 WebUI
- 局域网共享访问
- 安装后直接从终端进入部署模式
- 给非开发用户提供最低学习成本的启动入口
