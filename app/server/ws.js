/**
 * ws.js — WebSocket 服务（SSH 终端 + SFTP 文件传输）
 *
 * 挂载在 HTTP 服务器的 /ssh 路径上，处理终端输入输出、
 * 远程健康信息采集、文件上传/下载、目录浏览与取消传输等消息。
 */
import path from 'node:path';
import crypto from 'node:crypto';
import { Client } from 'ssh2';
import { WebSocketServer, WebSocket } from 'ws';
import { MAX_MESSAGE_SIZE } from './config.js';
import { logServerError } from './logger.js';
import { isTrustedWebSocketOrigin } from './security.js';

/**
 * 向 WebSocket 客户端发送一条 JSON 消息。
 * @param {import('ws').WebSocket} ws 客户端连接
 * @param {object} message 消息对象
 */
function send(ws, message) {
  if (message?.type === 'error') logServerError('ws', `向客户端发送错误：${message.message}`);
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

/**
 * 归一化主机指纹：去除 SHA256: 前缀与尾部填充符。
 * @param {string} value 原始指纹
 * @returns {string} 归一化指纹
 */
function normalizeFingerprint(value = '') {
  return value.trim().replace(/^SHA256:/, '').replace(/=+$/, '');
}

/**
 * 创建 WebSocket 服务器并挂载到 HTTP 服务器上。
 * @param {import('node:http').Server} httpServer HTTP 服务器
 * @returns {import('ws').WebSocketServer} WebSocket 服务器实例
 */
export function createWebSocketServer(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ssh',
    verifyClient: (info, done) => {
      if (isTrustedWebSocketOrigin(info.origin, info.req)) return done(true);
      done(false, 403, 'WebSocket 来源不受信任。');
    }
  });

  wss.on('connection', (ws) => {
    let ssh;
    let shell;
    let sftp;
    let connected = false;
    let healthTimer;
    let healthInitialSampleTimer;
    const uploads = new Map();
    const downloads = new Map();

    /**
     * 关闭 SSH 连接并清理所有资源（终端、SFTP、传输流、定时器）。
     * 幂等：可安全重复调用。
     */
    const closeSsh = () => {
      clearInterval(healthTimer);
      clearTimeout(healthInitialSampleTimer);
      healthTimer = undefined;
      healthInitialSampleTimer = undefined;
      for (const upload of uploads.values()) upload.stream.destroy();
      for (const download of downloads.values()) download.stream.destroy();
      uploads.clear();
      downloads.clear();
      shell?.close();
      sftp?.end?.();
      ssh?.end();
      sftp = undefined;
      shell = undefined;
      ssh = undefined;
      connected = false;
    };

    /**
     * 解析用户请求的目录：空白视为无效，返回 null。
     * @param {string} requestedDirectory 原始目录字符串
     * @returns {string | null} 规范化目录，无效时返回 null
     */
    const resolveUserDirectory = (requestedDirectory) => String(requestedDirectory || '').trim() || null;

    ws.on('message', (raw, isBinary) => {
      // 拒绝二进制消息与超大消息，防止资源耗尽
      if (isBinary || raw.length > MAX_MESSAGE_SIZE) return ws.close(1009, '消息无效或过大');

      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: 'error', message: '消息格式错误。' });
      }

      // —— 建立 SSH 终端连接 ——
      if (message.type === 'connect') {
        if (connected || ssh) return send(ws, { type: 'error', message: '已有活动连接。' });
        const { host, port = 22, username, password, privateKey, passphrase, fingerprint } = message;
        if (!host || !username || (!password && !privateKey)) {
          return send(ws, { type: 'error', message: '请填写主机、用户名及密码或私钥。' });
        }
        if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
          return send(ws, { type: 'error', message: '端口必须是 1–65535。' });
        }

        const expectedFingerprint = normalizeFingerprint(fingerprint);
        ssh = new Client();
        ssh.on('ready', () => {
          // 建立 SFTP 通道（用于文件传输）
          ssh.sftp((sftpError, sftpClient) => {
            if (sftpError) return send(ws, { type: 'error', message: `无法建立 SFTP：${sftpError.message}` });
            sftp = sftpClient;
          });

          // 打开交互式终端流
          const openTerminal = ssh.shell.bind(ssh, { term: 'xterm-256color', cols: 100, rows: 28 });
          openTerminal((error, stream) => {
            if (error) {
              send(ws, { type: 'error', message: `无法创建终端：${error.message}` });
              return closeSsh();
            }
            shell = stream;
            connected = true;
            send(ws, { type: 'ready' });

            // 读取用户主目录（供文件管理器默认位置）
            ssh.exec('printf "$HOME"', (homeError, homeStream) => {
              if (homeError || !homeStream) return;
              let home = '';
              homeStream.on('data', (data) => { home += data.toString('utf8'); });
              homeStream.on('close', () => {
                home = home.trim();
                if (home) send(ws, { type: 'home', home });
              });
            });

            /**
             * 采集远程主机健康信息（主机名、CPU、内存、延迟）。
             * 通过一条 shell 命令批量读取；基于两次采样差计算 CPU 使用率。
             */
            const collectHealth = () => {
              if (!connected || !ssh) return;
              const startedAt = Date.now();
              ssh.exec("printf '__WEBSSH_HEALTH__\\n'; hostname; getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || echo 1; awk '/^cpu / {idle=$5; total=0; for (i=2;i<=NF;i++) total+=$i; print idle, total}' /proc/stat; awk '/MemTotal:/ {total=$2} /MemAvailable:/ {available=$2} END {if (total) print total, available}' /proc/meminfo", (healthError, healthStream) => {
                if (healthError || !healthStream) return;
                let output = '';
                healthStream.on('data', (data) => { output += data.toString('utf8'); });
                healthStream.on('close', () => {
                  const values = output.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
                  if (values.shift() !== '__WEBSSH_HEALTH__') return;
                  const [hostname = '', cores = '1', cpu = '', memory = ''] = values;
                  const [idle, total] = cpu.split(/\s+/).map(Number);
                  const [memoryTotal, memoryAvailable] = memory.split(/\s+/).map(Number);
                  const previousCpu = ws._websshCpu;
                  ws._websshCpu = { idle, total };
                  const cpuUsage = previousCpu && total > previousCpu.total
                    ? Math.round((1 - (idle - previousCpu.idle) / (total - previousCpu.total)) * 100)
                    : undefined;
                  const memoryUsage = memoryTotal ? Math.round((1 - memoryAvailable / memoryTotal) * 100) : undefined;
                  send(ws, { type: 'health', hostname, cpu: cpuUsage, memory: memoryUsage, latency: Date.now() - startedAt, cores: Number(cores) || 1 });
                });
              });
            };
            collectHealth();
            healthInitialSampleTimer = setTimeout(() => {
              healthInitialSampleTimer = undefined;
              collectHealth();
            }, 1000);
            healthTimer = setInterval(collectHealth, 5000);

            // 终端输出回传
            stream.on('data', (data) => send(ws, { type: 'data', data: data.toString('utf8') }));
            stream.stderr.on('data', (data) => send(ws, { type: 'data', data: data.toString('utf8') }));
            stream.on('close', () => {
              send(ws, { type: 'closed', message: '远程会话已结束。' });
              closeSsh();
            });
          });
        });
        ssh.on('error', (error) => {
          logServerError('ssh', `SSH 连接失败：${error.message}`);
          send(ws, { type: 'error', message: `SSH 连接失败：${error.message}` });
          closeSsh();
        });
        ssh.on('close', () => {
          if (connected) send(ws, { type: 'closed', message: 'SSH 连接已关闭。' });
          connected = false;
        });

        try {
          ssh.connect({
            host: String(host),
            port: Number(port),
            username: String(username),
            password: privateKey ? undefined : String(password || ''),
            privateKey: privateKey || undefined,
            passphrase: privateKey ? passphrase || undefined : undefined,
            readyTimeout: 15000,
            keepaliveInterval: 10000,
            hostHash: expectedFingerprint ? 'sha256' : undefined,
            hostVerifier: expectedFingerprint
              ? (hash) => {
                const actual = Buffer.from(normalizeFingerprint(hash));
                const expected = Buffer.from(expectedFingerprint);
                return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
              }
              : undefined
          });
        } catch (error) {
          send(ws, { type: 'error', message: `SSH 配置错误：${error.message}` });
          closeSsh();
        }
        return;
      }

      // —— 开始上传（含目录校验与同名冲突处理）——
      if (message.type === 'upload-start') {
        if (!sftp) return send(ws, { type: 'transfer-error', message: 'SFTP 尚未就绪。' });
        const id = String(message.id || '');
        const name = path.posix.basename(String(message.name || ''));
        if (!id || !name || uploads.has(id)) return send(ws, { type: 'transfer-error', id, message: '上传请求无效。' });
        const directory = resolveUserDirectory(message.directory);
        if (!directory) return send(ws, { type: 'transfer-error', id, message: '请输入上传目标目录。' });
        const size = Number(message.size) || 0;
        const conflictAction = String(message.conflictAction || '');
        /**
         * 以指定远程路径创建写入流并登记上传任务。
         * @param {string} remotePath 远程目标路径
         */
        const beginUpload = (remotePath) => {
          const stream = sftp.createWriteStream(remotePath, { flags: 'w', mode: 0o644 });
          const upload = { stream, received: 0, size, cancelled: false, failed: false };
          uploads.set(id, upload);
          send(ws, { type: 'upload-ready', id, name: path.posix.basename(remotePath), remotePath });
          stream.on('error', (error) => {
            upload.failed = true;
            uploads.delete(id);
            if (!upload.cancelled) send(ws, { type: 'transfer-error', id, message: `上传失败：${error.message}` });
          });
          stream.on('close', () => {
            uploads.delete(id);
            if (!upload.cancelled && !upload.failed) send(ws, { type: 'upload-complete', id, remotePath, size: upload.received });
          });
        };
        /**
         * 递归查找不冲突的重命名路径（文件名 (1).ext、文件名 (2).ext…）。
         * @param {number} [index=1] 重命名序号
         */
        const findRenamedPath = (index = 1) => {
          const extensionIndex = name.lastIndexOf('.');
          const baseName = extensionIndex > 0 ? name.slice(0, extensionIndex) : name;
          const extension = extensionIndex > 0 ? name.slice(extensionIndex) : '';
          const candidatePath = path.posix.join(directory, `${baseName} (${index})${extension}`);
          sftp.stat(candidatePath, (error) => {
            if (error?.code === 2) return beginUpload(candidatePath);
            if (error) return send(ws, { type: 'transfer-error', id, message: `无法检查重命名文件：${error.message}` });
            findRenamedPath(index + 1);
          });
        };
        const remotePath = path.posix.join(directory, name);
        sftp.stat(directory, (directoryError, directoryStats) => {
          if (directoryError?.code === 2) return send(ws, { type: 'transfer-error', id, message: `上传目录不存在：${directory}` });
          if (directoryError) return send(ws, { type: 'transfer-error', id, message: `无法检查上传目录：${directoryError.message}` });
          if ((directoryStats.mode & 0o170000) !== 0o040000) return send(ws, { type: 'transfer-error', id, message: `上传目标不是目录：${directory}` });
          sftp.stat(remotePath, (statError) => {
            if (statError?.code === 2) return beginUpload(remotePath);
            if (statError) return send(ws, { type: 'transfer-error', id, message: `无法检查远程文件：${statError.message}` });
            if (conflictAction === 'overwrite') return beginUpload(remotePath);
            if (conflictAction === 'rename') return findRenamedPath();
            send(ws, { type: 'upload-conflict', id, name, remotePath });
          });
        });
        return;
      }

      // —— 上传数据块 ——
      if (message.type === 'upload-chunk') {
        const upload = uploads.get(String(message.id || ''));
        if (!upload) return send(ws, { type: 'transfer-error', message: '上传会话不存在。' });
        try {
          const chunk = Buffer.from(String(message.data || ''), 'base64');
          if (upload.received + chunk.length > upload.size) throw new Error('上传数据超过声明的文件大小。');
          upload.received += chunk.length;
          upload.stream.write(chunk);
          send(ws, { type: 'upload-progress', id: message.id, transferred: upload.received, size: upload.size });
        } catch (error) {
          upload.failed = true;
          uploads.delete(String(message.id || ''));
          upload.stream.destroy();
          send(ws, { type: 'transfer-error', id: message.id, message: error.message || '上传数据无效。' });
        }
        return;
      }

      // —— 上传结束（校验完整性并结束写入流）——
      if (message.type === 'upload-end') {
        const id = String(message.id || '');
        const upload = uploads.get(id);
        if (!upload) return;
        if (upload.received !== upload.size) {
          upload.failed = true;
          uploads.delete(id);
          upload.stream.destroy();
          send(ws, { type: 'transfer-error', id, message: `上传数据不完整：已接收 ${upload.received} / ${upload.size} 字节。` });
          return;
        }
        upload.stream.end();
        return;
      }

      // —— 浏览远程目录 ——
      if (message.type === 'list-files') {
        if (!sftp) return send(ws, { type: 'transfer-error', operation: 'list-files', picker: message.picker, requestId: String(message.requestId || ''), message: 'SFTP 尚未就绪。' });
        const requestId = String(message.requestId || '');
        const requestedDirectory = String(message.directory || '').trim();
        /**
         * 读取指定目录并返回子目录与文件列表。
         * @param {string} currentPath 实际读取路径
         * @param {string} [displayPath=currentPath] 展示路径
         */
        const listDirectory = (currentPath, displayPath = currentPath) => {
          sftp.readdir(currentPath, (readError, entries) => {
            if (readError) return send(ws, { type: 'transfer-error', operation: 'list-files', picker: message.picker, requestId, message: `无法读取目录“${displayPath}”：${readError.message}` });
            const normalizedPath = currentPath === '/' ? '/' : currentPath.replace(/\/+$/, '');
            const directories = entries
              .filter((entry) => entry.attrs.isDirectory() && entry.filename !== '.' && entry.filename !== '..')
              .map((entry) => ({ name: entry.filename, path: path.posix.join(normalizedPath, entry.filename) }));
            const files = entries
              .filter((entry) => !entry.attrs.isDirectory())
              .map((entry) => ({ name: entry.filename, path: path.posix.join(normalizedPath, entry.filename), size: entry.attrs.size }));
            send(ws, { type: 'file-list', picker: message.picker, requestId, path: displayPath, directories, files });
          });
        };
        const directory = resolveUserDirectory(requestedDirectory);
        if (!directory) return send(ws, { type: 'transfer-error', operation: 'list-files', picker: message.picker, requestId, message: '请输入要读取的远程目录。' });
        listDirectory(directory, directory);
        return;
      }

      // —— 下载远程文件（分块推送）——
      if (message.type === 'download') {
        const id = String(message.id || Date.now());
        if (!sftp) return send(ws, { type: 'transfer-error', id, direction: 'download', message: 'SFTP 尚未就绪。' });
        const remotePath = String(message.remotePath || '');
        if (!remotePath) return send(ws, { type: 'transfer-error', id, direction: 'download', message: '请提供远程文件路径。' });
        sftp.stat(remotePath, (statError, stats) => {
          if (statError) return send(ws, { type: 'transfer-error', id, direction: 'download', message: `无法读取远程文件：${statError.message}` });
          if ((stats.mode & 0o170000) !== 0o100000) return send(ws, { type: 'transfer-error', id, direction: 'download', message: '下载目标不是普通文件。' });
          const stream = sftp.createReadStream(remotePath);
          const download = { stream, cancelled: false };
          downloads.set(id, download);
          let sent = 0;
          send(ws, { type: 'download-start', id, name: path.posix.basename(remotePath), size: stats.size });
          stream.on('data', (chunk) => {
            if (download.cancelled) return;
            sent += chunk.length;
            send(ws, { type: 'download-chunk', id, data: chunk.toString('base64'), transferred: sent, size: stats.size });
          });
          stream.on('end', () => {
            downloads.delete(id);
            if (!download.cancelled) send(ws, { type: 'download-complete', id });
          });
          stream.on('error', (error) => {
            downloads.delete(id);
            if (!download.cancelled) send(ws, { type: 'transfer-error', id, direction: 'download', message: `下载失败：${error.message}` });
          });
        });
        return;
      }

      // —— 取消传输 ——
      if (message.type === 'cancel-transfer') {
        const id = String(message.id || '');
        const upload = uploads.get(id);
        if (upload) {
          upload.cancelled = true;
          uploads.delete(id);
          upload.stream.destroy();
        }
        const download = downloads.get(id);
        if (download) {
          download.cancelled = true;
          downloads.delete(id);
          download.stream.destroy();
        }
        return;
      }

      // —— 终端输入 / 尺寸调整 / 断开 ——
      if (message.type === 'input' && shell) shell.write(String(message.data ?? ''));
      if (message.type === 'resize' && shell) {
        const cols = Math.max(20, Math.min(500, Number(message.cols) || 100));
        const rows = Math.max(5, Math.min(200, Number(message.rows) || 28));
        shell.setWindow(rows, cols, 0, 0);
      }
      if (message.type === 'disconnect') closeSsh();
    });

    ws.on('close', closeSsh);
    ws.on('error', (error) => {
      logServerError('ws', `WebSocket 错误：${error.message}`);
      closeSsh();
    });
  });

  return wss;
}
