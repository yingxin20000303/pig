# WebSSH

一个本地运行的 Web SSH 桌面工具，提供多会话终端、连接配置管理、SFTP 文件传输与连接状态信息。

> 当前版本：`0.1.2`

本仓库按运行形态划分为两个独立部分：

```
pig/
├── app/        # WebSSH 应用本体（Node.js 源码，Windows 桌面 / Docker / 便携版共用）
├── fnos/       # 飞牛 fnOS 原生应用打包工程（FPK，兼容 x86 与 ARM，无需 Docker）
└── scripts/    # 构建脚本
```

## 运行形态

### 1. Windows 本地运行

在 `app/` 目录中启动，详见 [app/README.md](app/README.md)。

```bash
cd app
npm install
npm run dev
```

启动后访问：<http://localhost:1314>

### 2. Docker 部署

`app/` 内置 `Dockerfile` 与 `compose.yaml`，可部署为常驻 Web 服务，详见 [app/README.md](app/README.md)。

### 3. 飞牛 fnOS（FPK 原生应用）

以 **FNOS 原生应用**方式打包，不依赖 Docker，通过系统自带 `nodejs_v22` 运行时实现**同时兼容 x86 与 ARM** 设备，详见 [fnos/README.md](fnos/README.md)。

```powershell
# 自动下载官方 fnpack 并构建
.\scripts\build-fnos-fpk.ps1 -DownloadFnpack
```

产物位于 `dist/fnos/*.fpk`，通过 fnOS「应用中心 → 手动安装」导入。

## 安全提示

- 连接配置默认保存于 `app/ssh-connections.json`，使用 **AES-256-GCM** 加密；首次保存时会生成同目录的 `ssh-connections.json.key`。两者均已被 `.gitignore` 忽略，请勿提交、删除或与不可信方共享。
- 旧版明文 JSON 会在首次读取时自动迁移为加密格式。恢复备份时必须同时恢复配置文件和对应 `.key` 文件；也可通过 `WEBSSH_PROFILES_KEY`（32 字节 Base64 或 64 位十六进制）托管密钥。
- 应用不提供用户登录、TLS 或公网访问保护，请勿直接暴露到公网；若需局域网或公网访问，请使用 VPN 或具备 HTTPS 与身份验证的反向代理。

## 开源协议

本项目采用 [MIT License](LICENSE) 开源。

## 作者与版权

- WebSSH Contributors
- Copyright © 2026 WebSSH Contributors
