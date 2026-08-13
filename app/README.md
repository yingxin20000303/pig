# WebSSH（应用本体）

> 本目录为 WebSSH 的 Node.js 源码，供 Windows 桌面运行、Docker 部署与便携版构建共用。
> 飞牛 fnOS 打包工程见仓库根目录 `fnos/`。

## 功能特性

- 多 SSH 会话标签页与自动重连。
- 密码或私钥认证，支持可选的 SSH 主机指纹校验。
- 基于浏览器的交互终端，支持终端尺寸同步。
- 本地保存和管理连接配置。
- SFTP 上传、下载和远程文件浏览。
- 上传前校验远程目录；同名文件可选择覆盖、自动重命名或取消。
- 显示主机名、SSH 延迟、CPU、内存和连接时长等健康信息。
- 深色与浅色主题。
- Windows 便携版构建与启动支持。

## 快速开始

### 环境要求

- Node.js（建议使用当前 LTS 版本）
- 可访问的 SSH/SFTP 服务器

### 安装并启动

```bash
npm install
npm run dev
```

启动后访问：<http://localhost:1314>

也可使用以下命令启动服务并自动打开浏览器：

```bash
npm start
```

默认端口为 `1314`，可使用环境变量 `PORT` 覆盖。

## Docker 部署

> 容器运行的是 Web 服务，不会自动打开浏览器。启动后请在浏览器中访问服务地址。

### 前置条件

- Docker Engine 与 Docker Compose v2。
- 容器网络必须可访问待连接的 SSH/SFTP 主机。

### 使用 Docker Compose（推荐）

```bash
docker compose up -d --build
```

默认仅发布到 Docker 主机本机：<http://127.0.0.1:1314>

连接配置保存在 Docker 命名卷 `webssh-data`，更新、重建容器或执行 `docker compose down` 后仍会保留。

```bash
# 查看日志
docker compose logs -f webssh

# 停止服务但保留连接配置
docker compose down

# 删除服务及已保存的连接配置
docker compose down -v
```

### 使用 docker run

```bash
docker build -t webssh:0.1.0 .
docker volume create webssh-data
docker run -d \
  --name webssh \
  --restart unless-stopped \
  -p 127.0.0.1:1314:1314 \
  -e PORT=1314 \
  -e WEBSSH_HOST=0.0.0.0 \
  -e WEBSSH_PROFILES_PATH=/data/ssh-connections.json \
  -v webssh-data:/data \
  webssh:0.1.0
```

### 环境变量

| 变量 | 默认值 | Docker 推荐值 | 说明 |
| --- | --- | --- | --- |
| `PORT` | `1314` | `1314` | HTTP 与 WebSocket 服务端口。 |
| `WEBSSH_HOST` | `127.0.0.1` | `0.0.0.0` | 服务监听地址；Docker 中必须设为 `0.0.0.0`。 |
| `WEBSSH_PROFILES_PATH` | `./ssh-connections.json` | `/data/ssh-connections.json` | 连接配置保存位置，应指向持久化卷。 |

### 安全注意事项

- 默认端口映射为 `127.0.0.1:1314:1314`，仅允许 Docker 主机本机访问。
- 当前应用不提供用户登录、TLS 或公网访问保护。请不要直接暴露到公网；远程使用建议置于 VPN，或具备 HTTPS、身份认证和访问控制的反向代理之后。
- 不要将真实的 `ssh-connections.json`、数据卷或包含凭据的镜像公开分享。

### 多架构镜像发布

Docker Buildx 可发布 `linux/amd64` 与 `linux/arm64` 镜像：

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --tag <registry>/<namespace>/webssh:0.1.0 \
  --tag <registry>/<namespace>/webssh:latest \
  --push \
  .
```

发布前请先执行 `docker login <registry>`。将 `<registry>/<namespace>` 替换为你的镜像仓库地址与命名空间。

## Windows 便携版

在仓库根目录（或 `app/` 内）执行：

```powershell
npm run package:portable
```

构建依赖以下本机组件：

- `C:\Program Files\nodejs\node.exe`
- `.NET Framework` 自带的 C# 编译器：`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`

生成的可执行文件位于：

```text
dist\WebSSH-Portable\WebSSH.exe
```

## 连接配置与安全

连接配置默认保存于本目录下的 `ssh-connections.json`；可通过 `WEBSSH_PROFILES_PATH` 环境变量指定其他位置。

**请勿将包含真实主机、用户名、密码、私钥或口令的 `ssh-connections.json` 提交到仓库。** 项目已通过 `.gitignore` 忽略本地连接配置。建议使用权限最小化的 SSH 账号，并妥善保管私钥和密码。

远程健康信息的 CPU、内存采集依赖 Linux 的 `/proc` 文件系统；在部分受限容器、非 Linux 系统或权限受限账户上，相关指标可能不可用。
