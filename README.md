<div align="center">

# 🐷 WebSSH

**一个本地运行的轻量级 Web SSH 工具**

多会话终端 · 连接配置管理 · SFTP 文件传输 · 传输历史 · 连接状态监控

[![Version](https://img.shields.io/badge/version-0.1.6-blue?style=flat-square)](https://github.com/yingxin20000303/pig/releases/tag/v0.1.6)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Docker%20%7C%20fnOS-orange?style=flat-square)](#-安装与启动)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=flat-square)](https://github.com/yingxin20000303/pig/pulls)

[📦 下载最新版本](https://github.com/yingxin20000303/pig/releases/latest) · [🌐 在线展示页](https://yingxin20000303.github.io/pig/) · [📖 使用文档](docs/USER_GUIDE.md) · [📜 更新日志](CHANGELOG.md)

</div>

---

## ✨ 功能概览

| 功能 | 说明 |
|:---:|---|
| 🖥️ | **多会话终端** — 多标签页 SSH 会话，支持密码与 OpenSSH 私钥认证 |
| 💾 | **连接管理** — 保存、置顶、删除并快速重连常用服务器 |
| 📁 | **SFTP 文件传输** — 远程目录浏览、批量上传与多文件下载；可直接保存至浏览器选择的本地目录 |
| 🧾 | **传输历史** — 搜索、查看和清理已完成的上传 / 下载记录，包含文件位置、服务器、大小、耗时与时间 |
| 🎨 | **个性化外观** — 深色 / 浅色主题、字号、字体颜色与背景图片 |
| 📊 | **连接状态** — 实时显示主机名、SSH 延迟、CPU、内存与连接时长 |
| 📦 | **多平台分发** — Windows 便携版、Docker、飞牛 fnOS 原生 FPK 包 |

---

## 📥 安装与启动

### 🪟 Windows 便携版

1. 从 [GitHub Releases](https://github.com/yingxin20000303/pig/releases/latest) 下载 `WebSSH-x.y.z-Windows.zip`
2. 解压到任意目录
3. 双击 `WebSSH.exe` 启动 — 浏览器会自动打开 <http://127.0.0.1:1314>

> ⚠️ **安全提示**：Windows 便携版默认仅监听 `127.0.0.1:1314`。如需局域网访问，请显式设置 `WEBSSH_HOST=0.0.0.0`，并配合防火墙、访问控制或 VPN。

### 📡 fnOS（飞牛 NAS）

1. 从 [GitHub Releases](https://github.com/yingxin20000303/pig/releases/latest) 下载 `WebSSH-x.y.z-fnOS.fpk`
2. 在 fnOS **「应用中心 → 手动安装」** 中导入 FPK
3. 安装完成后，从桌面或应用列表启动，访问 fnOS 分配的应用地址

### 🐳 Docker

`app/` 内置 `Dockerfile` 与 `compose.yaml`，具体部署参数见 [Docker 与开发说明](app/README.md)。

### 🔧 从源码运行

```bash
cd app
npm install
npm run dev
```

启动后访问 <http://127.0.0.1:1314>。

---

## 🚀 首次使用

应用启动后进入空状态主界面。点击 **「+ 新建连接」** 创建第一个 SSH 会话。

![主界面（空状态）](docs/screenshots/01-home.png)

| 区域 | 说明 |
|:---:|---|
| 🔝 顶部状态栏 | 左侧显示连接状态；右侧提供终端字体、背景、主题、上传、下载、传输历史及关闭服务等操作 |
| 🗂️ 标签栏 | 右侧可新建连接；标签上的 `×` 可关闭并断开对应 SSH 会话 |
| 🖼️ 中央区域 | 显示 WebSSH 标识和「+ 新建连接」入口 |

### 🔐 创建 SSH 连接

点击 **「+ 新建连接」** 后，右侧会打开连接抽屉。

![新建连接 - 密码模式](docs/screenshots/02-new-connection.png)

#### 密码认证

| 字段 | 必填 | 说明 |
|:---:|:---:|---|
| 名称 | ❌ | 连接别名，便于在已保存连接中识别 |
| 主机 | ✅ | SSH 服务器的域名或 IP 地址 |
| 端口 | ❌ | 默认值为 `22` |
| 用户 | ✅ | SSH 登录用户名 |
| 密码 | ✅ | SSH 登录密码 |

填写后点击 **「连接」** 即可建立会话；点击 💾 保存图标可保存该连接以便后续复用。

#### 私钥认证

切换到 **「私钥」** 标签页，填写主机、用户和私钥内容即可。

![新建连接 - 私钥模式](docs/screenshots/03-new-connection-key.png)

> 🔑 支持 OpenSSH 格式私钥（`-----BEGIN OPENSSH PRIVATE KEY-----`）

---

## 📋 管理已保存连接

连接抽屉顶部会显示已保存连接。

![保存的连接列表](docs/screenshots/09-saved-connections.png)

- 📌 每个连接项显示会话名称和连接信息（主机:端口 · 用户名），便于快速识别
- 🖱️ 点击连接项可快速重连
- 📌 使用图钉按钮切换置顶状态；置顶连接会按添加顺序显示在列表前方
- 🗑️ 使用删除按钮移除不再使用的连接

---

## 🖥️ 终端与文件传输

### 多会话终端

建立连接后会自动打开终端标签页。可同时保持多个会话，点击标签切换；点击标签上的 `×` 会关闭并断开该 SSH 会话。

### ⬆️ 上传文件

1. 点击顶部 **「上传」** 按钮
2. 在弹窗中输入远程目标目录（例如 `/var/www/app`），点击 **「读取目录」**；目录列表仅显示可进入的子目录
3. 可双击子目录进入、点击上一级图标返回父目录，或直接修改路径后重新读取
4. 点击底部 **「上传文件」**，一次选择一个或多个本地文件；全部文件会上传到当前远程目录
5. 等待进度完成，期间仍可继续使用终端

![上传文件对话框](docs/screenshots/06-upload-picker.png)

### ⬇️ 下载远程文件

1. 点击顶部 **「下载」** 按钮
2. 输入远程目录并点击 **「读取目录」**；也可双击目录进入或使用上一级图标返回父目录
3. 勾选需要下载的一个或多个文件，点击底部 **「下载所选文件」**
4. 在浏览器原生目录选择器中选择本地目标文件夹；所有选中文件会直接保存到该位置，不经过浏览器默认下载目录。此能力需要最新版 Chrome 或 Edge。

![下载文件对话框](docs/screenshots/07-download-picker.png)

> 💡 **兼容性提示**：直接选择本地目录下载依赖 File System Access API，请使用新版 Chrome 或 Edge。不支持该 API 的浏览器无法从 WebSSH 启动下载。
>
> 💡 **传输提示**：可传输的文件大小受浏览器内存、网络状况、目标服务器和可用存储空间限制。大型文件建议直接在终端使用 `scp` 或 `rsync`。

### 🧾 传输历史

点击顶部 **「传输历史」** 按钮可查看已完成的上传和下载记录。可按文件名、文件位置或上传 / 下载分类搜索；每条记录会显示文件名、大小、耗时、完成时间、位置和目标服务器。

- 可删除单条记录，或使用 **「清空」** 移除全部历史
- 历史最多保留 200 条，会保存在本机；设备由多人共用时，请在交接前清理敏感记录
- 未完成、取消或失败的传输不会出现在历史中

---

## 🎨 个性化设置

### 主题

点击顶栏主题按钮可在深色 🌙 与浅色 ☀️ 主题间切换。

![浅色主题](docs/screenshots/08-light-theme.png)

### 字号与字体颜色

点击字号或字体按钮可打开设置菜单，实时调整终端字号与文字颜色；设置会应用到当前打开的会话。

![字体设置菜单](docs/screenshots/04-font-settings.png)

### 背景图片

点击顶栏外观按钮可上传、调节透明度或移除背景图片。

![背景设置菜单](docs/screenshots/05-background-settings.png)

> 背景标题后的灰色圆点表示未设置背景；亮色圆点表示背景已启用。

---

## ❓ 常见问题

<details>
<summary><b>忘记保存连接后关闭浏览器，还能找回吗？</b></summary>

不能。未保存的连接和当前会话仅存在于浏览器会话中；建议将常用连接保存。
</details>

<details>
<summary><b>私钥连接提示 <code>invalid private key</code>？</b></summary>

请确认使用 OpenSSH 格式私钥。传统 RSA 私钥可使用 `ssh-keygen -p -m PEM -f <key>` 转换。
</details>

<details>
<summary><b>如何让局域网其他设备访问？</b></summary>

默认仅监听 `127.0.0.1`。请显式设置 `WEBSSH_HOST=0.0.0.0` 后重启服务，并仅在可信局域网中通过 `http://<主机IP>:1314` 访问。
</details>

<details>
<summary><b>修改字号或字体颜色后没有生效？</b></summary>

设置会立即应用于当前已打开会话；如仍异常，请重新打开终端会话。
</details>

<details>
<summary><b>背景图片影响阅读？</b></summary>

在外观菜单降低背景透明度，建议保持在 30–50% 左右。
</details>

<details>
<summary><b>如何卸载？</b></summary>

Windows 便携版可直接删除解压目录；fnOS 请在「应用中心」卸载应用。
</details>

---

## 🔒 安全提示

| 项目 | 说明 |
|:---:|---|
| 🔐 加密存储 | 保存的连接配置位于 `app/ssh-connections.json`，采用 **AES-256-GCM** 加密；首次保存时会生成同目录的 `ssh-connections.json.key` |
| ⚙️ 偏好设置 | 用户偏好设置（主题、终端字体、固定会话排序）保存于 `app/settings.json`，换浏览器或清除缓存后不丢失 |
| 🧾 传输历史 | 已完成传输的文件名、位置、服务器、大小、耗时与时间会保存于本机；可在「传输历史」中删除单条或清空全部记录 |
| 🔄 自动迁移 | 旧版明文配置会在首次读取时自动迁移为加密格式。备份或恢复时必须同时保留配置文件和对应密钥文件；也可使用 `WEBSSH_PROFILES_KEY` 托管 32 字节密钥 |
| 🚫 Git 忽略 | 配置和密钥均已被 `.gitignore` 忽略，切勿提交、删除或分享给不可信方 |
| 🌐 不暴露公网 | 本项目不提供用户登录、TLS 或公网访问保护。不要直接暴露至公网；远程访问请使用 VPN 或带 HTTPS、身份验证和访问控制的反向代理 |

---

## 📂 项目结构

```text
pig/
├── app/        # Node.js 应用本体；Windows、Docker、便携版共用
├── fnos/       # 飞牛 fnOS 原生 FPK 打包工程
├── docs/       # 截图与补充文档
├── scripts/    # 发布构建脚本
└── site/       # 在线展示页
```

| 链接 | 说明 |
|---|---|
| 📖 [应用开发、Docker 与 Windows 便携版构建](app/README.md) | 开发者文档 |
| 📦 [fnOS 打包与安装说明](fnos/README.md) | fnOS 部署文档 |
| 📜 [完整更新日志](CHANGELOG.md) | 版本变更记录 |
| 🐛 [问题反馈](https://github.com/yingxin20000303/pig/issues) | 提交 Issue |

---

## 📄 开源协议

本项目采用 [MIT License](LICENSE) 开源。

---

<div align="center">

**Made with 💜 by WebSSH Contributors**

Copyright © 2026 WebSSH Contributors

</div>
