# 📋 更新日志（Changelog）

本项目的所有显著变更均记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本（SemVer）](https://semver.org/lang/zh-CN/)。

---

## [0.1.3] - 2026-08-17

### 🛠️ 发布维护

- 🔧 修复 Docker 与 fnOS 环境下自定义背景配置、背景图片及用户偏好的持久化：统一保存至数据卷或应用数据目录
- 🔗 修正 fnOS 安装包维护者与分发者链接为正式项目仓库地址
- 🛡️ 完善敏感 SSH 连接配置的 Git 忽略规则，避免本地凭据被误提交

### ✨ 新增

- 🎨 统一应用图标：浏览器 favicon、Apple Touch Icon、终端空状态入口图标、fnOS 应用图标、产品展示站图标全部使用同一图标资源
- 📋 已保存会话列表每项显示会话名称与连接信息（主机:端口 · 用户名）双行布局，便于快速识别
- ✅ 上传目录验证通过后，按钮自动从「选择目录」变为绿色「选择文件」，视觉区分清晰
- 📖 美化 README 与 CHANGELOG：添加 emoji 图标、徽章栏、功能表格、折叠式 FAQ 等现代化排版元素
- 🌐 美化产品展示站：新增 sticky 导航栏、深色/浅色主题切换、毛玻璃卡片、悬浮动画与渐变标题

### 🐛 修复

- 🐛 修复终端字体设置功能报错 `setOption is not a function`（xterm.js 新版 API 变更，`setOption` → `options` 属性赋值）
- 🍏 修复 Safari 浏览器点击「选择目录」无反应（WebSocket 回调中 `click()` 被用户激活限制拦截；改为验证通过后复用按钮同步触发文件选择框）
- 🐛 修复文件上传时页面报错 `null is not an object`（`setUploadDirectoryReady` 中 `querySelector('button[type="submit"]')` 在按钮 type 变更后匹配不到元素）
- 🍏 修复 Safari 浏览器频繁出现「页面错误」提示：
  - 移除 CDN 依赖，xterm.js / addon-fit / xterm.css 本地化到 `/vendor/`
  - 修复 `ResizeObserver` 观察自身导致的无限循环（改为观察父容器）
  - 收敛全局错误捕获：资源加载错误静默处理，`ResizeObserver loop` 错误降级为 warn，`AbortError` 忽略
- 🖱️ 修复会话标签拖拽排序体验问题：
  - 重写为 Pointer Events 自绘拖拽，支持触摸设备
  - 拖拽时垂直锁定、水平钳制，标签不出会话栏
  - 修复 Safari 下 ghost 渲染不稳定（移除 transform/filter）
  - 修复 ghost 继承 `dragging` 类导致的半透明（克隆前移除）
  - 修复已连接会话拖起时显示激活态样式（克隆前移除 `active` 类）
  - 修复单击标签后 `tab-pressing` 高亮未清除导致多标签同时"选中"
- 🔌 修复设为常驻会话后自动建立 SSH 连接的问题（改为仅显示在会话栏，不主动连接）
- 💫 修复上传冲突弹窗出现时页面闪烁（backdrop 从 `display:none` 切换改为 `visibility` + `opacity` 过渡）
- ⚡ 修复上传冲突弹窗快速连续触发时的竞态条件（关闭定时器守卫）

### ⚡ 优化

- ☁️ 用户偏好设置（主题、终端字体、固定会话排序）从浏览器 `localStorage` 迁移到服务器端 `settings.json` 文件存储，换浏览器或清除缓存后设置不丢失
- 🌙 暗色模式下被拖起会话使用暖橙→玫红渐变，与激活会话的蓝色系明确区分；荧光效果削弱避免刺眼
- 📐 「保存连接」区域布局优化：固定 6 个标签高度上限，超出时内部滚动，不再无限加长弹窗；标签增减时表单位置不突变
- 🎨 固定/删除按钮不再占满整个标签高度，改为 30×30 紧凑尺寸垂直居中
- 🧹 移除「私钥口令（可选）」输入框（后端保留旧数据兼容）
- 🌐 跨浏览器兼容性加固：
  - `localStorage` 全部包装 try-catch，隐私模式不崩溃
  - `navigator.clipboard` 不可用时回退到 `terminal.paste()`
  - `.connection-panel` 新增 `::-webkit-scrollbar` 样式，Chrome/Safari 滚动条统一
  - 会话标签加 `touch-action: pan-x`，iOS Safari 拖拽手势不被拦截
  - `crypto.randomUUID()` 补充 `Math.random()` 第三层后备
- 🧹 代码整理：移除 `generateUUID` 残留死代码、`persistPinnedOrder` 残缺 try-catch、重复调用、冗余查询；简化 `auxclick`/`scrollBehavior` 特性检测
- 📦 资源引用加版本查询参数（`?v=N`），解决 Safari ES 模块缓存顽固问题
- 📦 统一 0.1.2 的应用、Docker、Windows 与 fnOS 发布元数据
- 🧹 清理保存连接路由中重复的配置规范化逻辑，并修正文档中的启动文件与默认监听说明

### 🔒 安全与稳定性

- 🔐 保存的 SSH 连接配置改为 AES-256-GCM 加密存储，支持旧版明文配置自动迁移
- 🔑 新增独立密钥文件或外部托管密钥支持；配置读写采用原子替换和串行化处理
- 🛡️ WebSocket 新增可信来源校验，降低跨站调用本地 SSH 服务的风险
- 🚫 Docker、Windows 便携版与 fnOS 包不再初始化明文连接配置

---

## [0.1.1] - 2026-08-14

### ✨ 新增

- 🎨 终端字体设置新增 **字体颜色** 调整（实时生效，自动持久化到本地）
- 💡 背景设置弹窗美化，并在「背景图片」标题旁新增 **状态灯**，实时提示当前是否已设置背景
- 🌐 服务器新增 SPA 回退路由：未知页面路径返回 `index.html`，不再返回 404（API 不受影响）

### 🐛 修复

- 🧱 修复操作栏（header）遮挡新建/编辑会话弹窗的问题（z-index 层级调整）
- 🖼️ 修复从默认标签栏点击进入会话时，首页背景内容仍透出可见的问题
- 🌙 修复深色模式下终端背景透明度与全局表面（操作栏、标签栏、空状态）不一致的问题：
  - 背景透明度统一由背景设置弹窗中的滑条控制，已连接与未连接会话保持一致
- ☀️ 修复浅色模式下背景功能不生效（`body` 不透明渐变遮挡 `body::before` 背景图）的问题
- ☀️ 修复浅色模式下背景未贯穿全局（操作栏、标签栏为不透明实色）的问题，改为半透明 + 毛玻璃
- 🎨 修复字体颜色设置不生效的问题（终端主题对象展开顺序导致自定义颜色被默认色覆盖）
- 🎨 修复字体颜色选色框与 label 不同排的布局问题

### ⚡ 优化

- ⌨️ 合并三个重复的 Escape 键监听器为统一的键盘处理（关闭关闭确认 → 覆盖确认 → 抽屉）
- 🧹 移除 `connectButton` 等冗余代码与指向不存在元素（`#disconnect-button`、
  `.connection-intro`、`.profile-bar`、`.hint`、`.terminal-settings-menu select`）的死 CSS 规则

---

## [0.1.0] - 2026-08-13

### 🎉 初始版本

- 🖥️ 多会话 SSH 终端，支持自动重连与终端尺寸同步
- 🔐 密码 / 私钥认证，可选 SSH 主机指纹校验
- 💾 本地保存与管理连接配置
- 📁 SFTP 上传、下载与远程目录浏览，支持同名文件冲突处理
- 📊 实时显示主机名、SSH 延迟、CPU、内存与连接时长等健康信息
- 🌙 ☀️ 深色 / 浅色主题
- 📦 Windows 便携版与飞牛 fnOS 原生应用（FPK，兼容 x86 与 ARM，不依赖 Docker）打包支持

---

<div align="center">

[📝 查看所有版本](https://github.com/yingxin20000303/pig/releases) · [🐛 提交问题](https://github.com/yingxin20000303/pig/issues)

</div>
