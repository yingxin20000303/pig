# WebSSH — 飞牛应用商店上架资料

> 用于提交至飞牛应用开放平台（https://developer.fnnas.com/）的审核资料整理。
> 项目仓库：https://github.com/yingxin20000303/pig（MIT License）

---

## 1. 应用基本信息

| 字段 | 内容 |
| --- | --- |
| 应用名称 | WebSSH |
| 应用包名（appname） | `webssh` |
| 版本号 | 0.1.5 |
| 分类 | 开发工具 |
| 开发者 | WebSSH Contributors |
| 维护者（maintainer） | WebSSH Contributors |
| 维护者主页 | https://github.com/yingxin20000303/pig |
| 开源协议 | MIT |
| 支持平台 | x86_64 / ARM64（`platform=all`） |
| 依赖运行时 | `nodejs_v22`（系统自动按架构安装） |
| 是否依赖 Docker | 否（FNOS 原生应用） |
| 最低系统版本 | fnOS ≥ 0.8.31 |
| 默认端口 | 1314（安装向导可自定义） |

## 2. 应用描述

### 中文描述（商店展示用）

> WebSSH 是一款本地运行的 Web 版 SSH 终端工具，在浏览器中提供多会话终端、连接配置管理、SFTP 文件传输与主机状态监控，适合日常登录管理 Linux 服务器。
>
> 主要功能：
> - 多 SSH 会话标签页，支持自动重连
> - 密码 / 私钥认证，可选 SSH 主机指纹校验
> - 基于浏览器的交互式终端，自动同步终端尺寸
> - 本地保存与管理连接配置
> - SFTP 上传、下载与远程目录浏览
> - 同名文件冲突可选覆盖、自动重命名或取消
> - 实时显示主机名、SSH 延迟、CPU、内存等健康信息
> - 深色 / 浅色主题

### English Description

> WebSSH is a locally running, browser-based SSH terminal for fnOS. It provides multi-session tabs, saved connection profiles, SFTP file transfer and real-time host monitoring — an easy way to manage Linux servers from your browser.
>
> Features:
> - Multiple SSH session tabs with auto-reconnect
> - Password or private-key authentication with optional host key fingerprint verification
> - Interactive browser terminal with automatic size sync
> - Locally stored and managed connection profiles
> - SFTP upload, download and remote file browsing
> - Conflict handling: overwrite, auto-rename or cancel
> - Live hostname, latency, CPU and memory status
> - Dark / light themes

### 更新日志（changelog）

```
v0.1.5
- 服务端与前端重构为模块化架构，新增自动化测试套件与项目完整性检查
- 上传与下载弹窗支持远程目录浏览、多选下载与批量上传
- 统一上传、下载弹窗的目录栏、底部操作栏及浅色模式配色
- 目录读取加入请求与会话隔离，强化上传数据完整性校验
v0.1.3
- 修复 Docker 与 fnOS 中用户偏好、自定义背景配置及背景图片的持久化
- 统一应用图标，已保存会话显示名称与连接信息双行布局
- 拖拽排序重写为 Pointer Events，支持触摸设备
- xterm 资源本地化，修复 Safari 页面错误与兼容性问题
- 移除私钥口令输入框，跨浏览器兼容性加固
v0.1.2
- 连接配置改为 AES-256-GCM 加密保存，支持旧版明文配置自动迁移
- 配置写入使用原子替换与串行化处理，提升意外退出和并发操作时的可靠性
- WebSocket 增加可信来源校验，提升本地服务访问安全性
v0.1.1
- 修复操作栏遮挡弹窗、标签栏进入会话残留首页内容等界面问题
- 背景透明度统一由背景设置滑条控制，深浅色模式背景全局生效
- 新增终端字体颜色自定义与背景状态提示
v0.1.0
- Initial release
- Multi-session SSH terminal with SFTP file transfer
- Native fnOS package (no Docker), compatible with x86 and ARM
```

## 3. 截图与素材清单（需准备）

| 素材 | 规格要求 | 状态 | 说明 |
| --- | --- | --- | --- |
| 应用图标 | 256×256（已有 ICON.PNG / ICON_256.PNG） | ✅ 已有 | FPK 内置，商店展示通常还需另行上传 |
| 截图 1 | 建议 1280×720+ | ❌ 待准备 | 主界面：多会话终端 |
| 截图 2 | 同上 | ❌ 待准备 | 连接配置管理（添加/编辑） |
| 截图 3 | 同上 | ❌ 待准备 | SFTP 文件上传 / 下载界面 |
| 截图 4（可选） | 同上 | ❌ 待准备 | 健康信息 / 深色主题界面 |
| 演示视频（可选） | 短于 60s | ❌ 待准备 | 终端操作与文件传输演示 |

**截图建议**：使用深色主题展示更显专业；截取前可在终端内执行 `htop` 或 `ls` 等命令使界面内容更丰富。

## 4. 安全说明（审核 / 用户告知用）

> **应用行为与数据安全：**
> - 所有连接配置（主机、用户名、密码、私钥、口令）**仅保存在设备本地**，并以 AES-256-GCM 加密保存于 `@appshare/webssh-data/ssh-connections.json`；对应密钥仅保存在同目录的 `ssh-connections.key`，不采集、不上传任何数据。
> - 应用不包含任何云服务、遥测或第三方统计代码。
>
> **使用边界：**
> - 应用**不提供用户登录、TLS 加密或公网访问保护**，仅建议在可信内网环境使用；如需公网访问，请置于 VPN 或带 HTTPS/认证的反向代理之后。
> - 设备管理员应保护应用数据目录，并在备份或迁移时同时保存加密配置及其密钥文件。
> - CPU / 内存健康数据依赖远程主机的 Linux `/proc` 文件系统，非 Linux 或受限账户下相关指标可能不可用。

## 5. 提交前检查清单

- [ ] FPK 在 **x86 设备**上安装运行验证通过（安装向导、桌面入口、WebSocket 终端、SFTP）
- [ ] FPK 在 **ARM 设备**上安装运行验证通过（同上）
- [ ] 卸载后可选择保留/删除配置（`wizard/uninstall` 已验证）
- [ ] 端口冲突处理正常（`checkport=true`）
- [ ] 应用截图已按规格准备
- [ ] 商店展示用描述已填写（第 2 节内容）
- [ ] 隐私/安全说明已附上（第 4 节）
- [ ] `manifest` 中 `maintainer_url` / `distributor_url` 指向有效仓库
- [ ] 仓库公开可访问（请填入正式项目地址）
- [ ] 仓库内无真实凭据（`ssh-connections.json` 等已 .gitignore 忽略）

## 6. 提交步骤备忘

1. 登录 https://account.fnnas.com/ 注册飞牛账号
2. 访问 https://developer.fnnas.com/ → 「我的应用」完成开发者认证
3. 创建应用，填写基本信息、描述与上传截图
4. 上传 `dist/fnos/WebSSH-0.1.5-fnOS.fpk`
5. 提交审核，等待官方反馈（如需补充材料按提示补齐）
6. 审核通过后应用正式上架

## 7. 版本更新流程（后续）

- 修改 `fnos/webssh/manifest` 中 `version` 与 `changelog`
- 重新构建：`.\scripts\build-fnos-fpk.ps1 -DownloadFnpack`
- 在开放平台「我的应用」上传新版本 FPK，提交审核

---

*资料整理日期：2026-08-14。提交前请根据开放平台最新要求微调字段。*
