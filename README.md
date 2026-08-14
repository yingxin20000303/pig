# WebSSH

一个本地运行的 Web SSH 工具，提供多会话终端、连接配置管理、SFTP 文件传输与连接状态信息。

> 当前版本：[`0.1.2`](https://github.com/yingxin20000303/pig/releases/tag/v0.1.2) · [下载最新版本](https://github.com/yingxin20000303/pig/releases/latest) · [在线展示页](https://yingxin20000303.github.io/pig/)

## 功能概览

- 多 SSH 会话标签页，支持密码和 OpenSSH 私钥认证。
- 保存、置顶、删除并快速重连常用服务器。
- SFTP 目录上传、远程文件浏览与多文件下载。
- 深色 / 浅色主题、终端字号、字体颜色与背景图片设置。
- 提供 Windows 便携版、Docker 和飞牛 fnOS 原生 FPK 包。

## 安装与启动

### Windows 便携版

1. 从 [GitHub Releases](https://github.com/yingxin20000303/pig/releases/latest) 下载 `WebSSH-x.y.z-Windows.zip`。
2. 解压到任意目录。
3. 双击 `WebSSH.exe` 启动；浏览器会自动打开 <http://127.0.0.1:1314>。

> Windows 便携版默认仅监听 `127.0.0.1:1314`。如需局域网访问，请显式设置 `WEBSSH_HOST=0.0.0.0`，并配合防火墙、访问控制或 VPN。

### fnOS（飞牛 NAS）

1. 从 [GitHub Releases](https://github.com/yingxin20000303/pig/releases/latest) 下载 `WebSSH-x.y.z-fnOS.fpk`。
2. 在 fnOS「应用中心 → 手动安装」中导入 FPK。
3. 安装完成后，从桌面或应用列表启动，并访问 fnOS 分配的应用地址。

### Docker

`app/` 内置 `Dockerfile` 与 `compose.yaml`。具体部署参数见 [Docker 与开发说明](app/README.md)。

### 从源码运行

```bash
cd app
npm install
npm run dev
```

启动后访问 <http://127.0.0.1:1314>。

## 首次使用

应用启动后进入空状态主界面。点击「+ 新建连接」创建第一个 SSH 会话。

![主界面（空状态）](docs/screenshots/01-home.png)

| 区域 | 说明 |
| --- | --- |
| 顶部状态栏 | 左侧显示连接状态；右侧提供主题、外观、字号、字体、上传、下载、新建和断开按钮。 |
| 中央区域 | 显示 WebSSH 标识和「+ 新建连接」入口。 |

### 创建 SSH 连接

点击「+ 新建连接」后，右侧会打开连接抽屉。

![新建连接 - 密码模式](docs/screenshots/02-new-connection.png)

#### 密码认证

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| 名称 | 否 | 连接别名，便于在已保存连接中识别。 |
| 主机 | 是 | SSH 服务器的域名或 IP 地址。 |
| 端口 | 否 | 默认值为 `22`。 |
| 用户 | 是 | SSH 登录用户名。 |
| 密码 | 是 | SSH 登录密码。 |

填写后点击「连接」即可建立会话；点击保存图标可保存该连接以便后续复用。

#### 私钥认证

切换到「私钥」标签页，填写主机、用户和私钥内容；如私钥设置了口令，请同时填写私钥口令。

![新建连接 - 私钥模式](docs/screenshots/03-new-connection-key.png)

> 支持 OpenSSH 格式私钥（`-----BEGIN OPENSSH PRIVATE KEY-----`）。

## 管理已保存连接

连接抽屉顶部会显示已保存连接。

![保存的连接列表](docs/screenshots/09-saved-connections.png)

- 点击连接项可快速重连。
- 使用图钉按钮切换置顶状态；置顶连接会显示在列表前方。
- 使用删除按钮移除不再使用的连接。

## 终端与文件传输

### 多会话终端

建立连接后会自动打开终端标签页。可同时保持多个会话，点击标签切换；点击标签上的 `×` 会关闭并断开该 SSH 会话。

### 上传目录

1. 点击顶部「上传」按钮。
2. 输入远程目标目录，例如 `/var/www/app`。
3. 选择本地目录；目录内文件会保留层级上传。
4. 等待进度完成，期间仍可继续使用终端。

![上传文件对话框](docs/screenshots/06-upload-picker.png)

### 下载远程文件

1. 点击顶部「下载」按钮。
2. 输入远程目录并点击「读取目录」。
3. 选择需要下载的一个或多个文件。
4. 文件将保存到浏览器默认下载目录。

![下载文件对话框](docs/screenshots/07-download-picker.png)

> 可传输的文件大小受浏览器内存、网络状况、目标服务器和可用存储空间限制。大型文件建议直接在终端使用 `scp` 或 `rsync`。

## 个性化设置

### 主题

点击顶栏主题按钮可在深色与浅色主题间切换。

![浅色主题](docs/screenshots/08-light-theme.png)

### 字号与字体颜色

点击字号或字体按钮可打开设置菜单，实时调整终端字号与文字颜色；设置会应用到当前打开的会话。

![字体设置菜单](docs/screenshots/04-font-settings.png)

### 背景图片

点击顶栏外观按钮可上传、调节透明度或移除背景图片。

![背景设置菜单](docs/screenshots/05-background-settings.png)

背景标题后的灰色圆点表示未设置背景；亮色圆点表示背景已启用。

## 常见问题

**忘记保存连接后关闭浏览器，还能找回吗？** 不能。未保存的连接和当前会话仅存在于浏览器会话中；建议将常用连接保存。

**私钥连接提示 `invalid private key`？** 请确认使用 OpenSSH 格式私钥。传统 RSA 私钥可使用 `ssh-keygen -p -m PEM -f <key>` 转换。

**如何让局域网其他设备访问？** 默认仅监听 `127.0.0.1`。请显式设置 `WEBSSH_HOST=0.0.0.0` 后重启服务，并仅在可信局域网中通过 `http://<主机IP>:1314` 访问。

**修改字号或字体颜色后没有生效？** 设置会立即应用于当前已打开会话；如仍异常，请重新打开终端会话。

**背景图片影响阅读？** 在外观菜单降低背景透明度，建议保持在 30–50% 左右。

**如何卸载？** Windows 便携版可直接删除解压目录；fnOS 请在「应用中心」卸载应用。

## 安全提示

- 保存的连接配置位于 `app/ssh-connections.json`，采用 **AES-256-GCM** 加密；首次保存时会生成同目录的 `ssh-connections.json.key`。
- 旧版明文配置会在首次读取时自动迁移为加密格式。备份或恢复时必须同时保留配置文件和对应密钥文件；也可使用 `WEBSSH_PROFILES_KEY` 托管 32 字节密钥。
- 配置和密钥均已被 `.gitignore` 忽略，切勿提交、删除或分享给不可信方。
- 本项目不提供用户登录、TLS 或公网访问保护。不要直接暴露至公网；远程访问请使用 VPN 或带 HTTPS、身份验证和访问控制的反向代理。

## 项目结构与开发

```text
pig/
├── app/        # Node.js 应用本体；Windows、Docker、便携版共用
├── fnos/       # 飞牛 fnOS 原生 FPK 打包工程
├── docs/       # 截图与补充文档
└── scripts/    # 发布构建脚本
```

- [应用开发、Docker 与 Windows 便携版构建](app/README.md)
- [fnOS 打包与安装说明](fnos/README.md)
- [完整更新日志](CHANGELOG.md)
- [问题反馈](https://github.com/yingxin20000303/pig/issues)

## 开源协议

本项目采用 [MIT License](LICENSE) 开源。

## 作者与版权

- WebSSH Contributors
- Copyright © 2026 WebSSH Contributors
