# fnOS 原生应用打包（FPK）

WebSSH 以 **FNOS 原生应用** 方式打包，不依赖 Docker，通过飞牛官方 `install_dep_apps = nodejs_v22`
机制由系统按设备架构自动安装 Node.js v22，FPK 内为纯 JS 依赖，**同时兼容 x86 与 ARM**。

## 目录结构（fnos/webssh）

```
webssh/
├── manifest              # 应用清单：platform=all，install_dep_apps=nodejs_v22
├── app/
│   ├── server/           # 应用代码（构建时生成，不入库）
│   │   ├── server.js
│   │   ├── package.json
│   │   ├── public/       # 前端静态资源
│   │   └── node_modules/ # 纯 JS 依赖（剔除原生模块）
│   └── ui/
│       ├── config        # 桌面入口（type=url 直连，WebSocket 可用）
│       └── images/       # icon_16/32/64/128/256.png
├── cmd/                  # 生命周期脚本（main/install/uninstall/upgrade/config）
├── config/
│   ├── privilege         # 以专用低权限用户运行
│   └── resource          # 数据共享目录 webssh-data
├── wizard/               # 安装（端口）/卸载（数据保留）向导
├── i18n/                 # zh-CN / enu
├── ICON.PNG              # 64×64
├── ICON_256.PNG          # 256×256
└── LICENSE
```

## 打包步骤

1. 获取飞牛官方 `fnpack`（Windows x86_64），放入任意位置；
2. 执行：

```powershell
# 方式一：指定 fnpack 路径
.\scripts\build-fnos-fpk.ps1 -Fnpack "D:\tools\fnpack.exe"

# 方式二：允许脚本自动下载官方 fnpack 到 tools\
.\scripts\build-fnos-fpk.ps1 -DownloadFnpack
```

3. 产物位于 `dist/fnos/*.fpk`，通过 fnOS「应用中心 → 手动安装」导入。

## 架构兼容说明

- `manifest` 中 `platform=all` 声明同时支持 x86 与 ARM；
- `install_dep_apps=nodejs_v22` 由 fnOS 按设备架构安装对应 Node.js 运行时；
- 打包时剔除 `cpu-features`/`nan`/`buildcheck` 等需原生编译的可选模块，
  `ssh2` 在缺少它们时会自动降级运行，保证依赖为纯 JS、双架构通用。

## 0.1.5 更新

- 服务端与前端重构为模块化架构，便于维护和扩展；
- 新增自动化测试套件（功能 + 压力共 32 项）与项目完整性检查脚本；
- 更新全部文档截图，移除无用脚本与冗余逻辑。

## 运行与数据

- 端口：安装向导中可自定义（默认 1314），保存于 `@appconf/settings.conf`；
- 连接配置：持久化于 `@appshare/webssh-data/ssh-connections.json`，以 AES-256-GCM 加密；独立密钥保存为同目录的 `ssh-connections.key`；
- 卸载时可选择保留或删除连接配置及其密钥。
