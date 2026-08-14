import { timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Client } from 'ssh2';
import { WebSocketServer, WebSocket } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

app.use((request, response, next) => {
  if (request.method !== 'GET' || request.path.startsWith('/api/')) return next();
  response.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const profilesPath = process.env.WEBSSH_PROFILES_PATH || path.join(__dirname, 'ssh-connections.json');
const profileFields = ['name', 'host', 'port', 'username', 'authMode', 'password', 'privateKey', 'passphrase', 'pinned'];

async function readProfiles() {
  try {
    const content = await fs.readFile(profilesPath, 'utf8');
    const profiles = JSON.parse(content);
    return Array.isArray(profiles) ? profiles : [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeProfiles(profiles) {
  await fs.mkdir(path.dirname(profilesPath), { recursive: true });
  await fs.writeFile(profilesPath, `${JSON.stringify(profiles.map(publicProfile), null, 2)}\n`, 'utf8');
}

function publicProfile(profile) {
  return Object.fromEntries(profileFields.map((field) => [field, profile[field] ?? '']));
}

app.get('/api/profiles', async (_request, response) => {
  try {
    response.json((await readProfiles()).map(publicProfile));
  } catch {
    response.status(500).json({ message: '无法读取连接配置。' });
  }
});

app.post('/api/profiles', express.json({ limit: '64kb' }), async (request, response) => {
  const profile = publicProfile(request.body ?? {});
  profile.name = String(profile.name).trim();
  profile.host = String(profile.host).trim();
  profile.username = String(profile.username).trim();
  profile.port = Number(profile.port) || 22;
  profile.authMode = profile.authMode === 'key' ? 'key' : 'password';
  profile.pinned = profile.pinned === true || profile.pinned === 'true';
  if (!profile.name || !profile.host || !profile.username || !Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) {
    return response.status(400).json({ message: '请填写有效的连接名称、主机、端口和用户名。' });
  }
  try {
    const profiles = await readProfiles();
    const index = profiles.findIndex((item) => item.name === profile.name);
    if (index >= 0) profiles[index] = profile;
    else profiles.push(profile);
    await writeProfiles(profiles);
    response.json({ profile });
  } catch {
    response.status(500).json({ message: '无法保存连接配置。' });
  }
});

app.delete('/api/profiles/:name', async (request, response) => {
  try {
    const profiles = await readProfiles();
    const remaining = profiles.filter((profile) => profile.name !== request.params.name);
    if (remaining.length === profiles.length) return response.status(404).json({ message: '连接配置不存在。' });
    await writeProfiles(remaining);
    response.status(204).end();
  } catch {
    response.status(500).json({ message: '无法删除连接配置。' });
  }
});

const backgroundPath = process.env.WEBSSH_BACKGROUND_PATH || path.join(__dirname, 'background.json');
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const DEFAULT_BACKGROUND = { url: null, opacity: 0.5 };
const BACKGROUND_CONTENT_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

function clampOpacity(value) {
  const opacity = Number(value);
  return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : DEFAULT_BACKGROUND.opacity;
}

async function readBackground() {
  try {
    const saved = JSON.parse(await fs.readFile(backgroundPath, 'utf8'));
    return {
      url: typeof saved.url === 'string' && saved.url ? saved.url : null,
      opacity: clampOpacity(saved.opacity)
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULT_BACKGROUND };
    throw error;
  }
}

app.get('/api/background', async (_request, response) => {
  try {
    response.json(await readBackground());
  } catch {
    response.status(500).json({ message: '无法读取背景设置。' });
  }
});

app.post('/api/background', express.json({ limit: '16mb' }), async (request, response) => {
  try {
    const body = request.body ?? {};
    const current = await readBackground();
    let url = current.url;
    const { data, contentType } = body;
    if (data) {
      const extension = BACKGROUND_CONTENT_TYPES[String(contentType || '')];
      if (!extension) return response.status(400).json({ message: '仅支持 PNG、JPEG、WebP 或 GIF 图片。' });
      let buffer;
      try {
        buffer = Buffer.from(String(data), 'base64');
      } catch {
        return response.status(400).json({ message: '图片数据无效。' });
      }
      if (!buffer.length || buffer.length > 8 * 1024 * 1024) return response.status(400).json({ message: '图片大小必须在 8MB 以内。' });
      await fs.mkdir(uploadsDir, { recursive: true });
      await fs.writeFile(path.join(uploadsDir, `background.${extension}`), buffer);
      url = `/uploads/background.${extension}`;
    }
    const opacity = clampOpacity(body.opacity);
    await fs.writeFile(backgroundPath, `${JSON.stringify({ url, opacity }, null, 2)}\n`, 'utf8');
    response.json({ url, opacity });
  } catch {
    response.status(500).json({ message: '无法保存背景设置。' });
  }
});

app.delete('/api/background', async (_request, response) => {
  try {
    const current = await readBackground();
    if (current.url) {
      const filename = path.basename(current.url);
      await fs.rm(path.join(uploadsDir, filename), { force: true }).catch(() => {});
    }
    await fs.rm(backgroundPath, { force: true }).catch(() => {});
    response.json({ ...DEFAULT_BACKGROUND });
  } catch {
    response.status(500).json({ message: '无法清除背景设置。' });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ssh' });

app.post('/api/shutdown', (_req, res) => {
  res.status(202).json({ ok: true });
  setTimeout(() => {
    wss.clients.forEach((client) => client.terminate());
    wss.close(() => server.close(() => process.exit(0)));
  }, 100);
});
const MAX_MESSAGE_SIZE = 1024 * 1024;

function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

function normalizeFingerprint(value = '') {
  return value.trim().replace(/^SHA256:/, '').replace(/=+$/, '');
}

wss.on('connection', (ws) => {
  let ssh;
  let shell;
  let sftp;
  let connected = false;
  let healthTimer;
  let healthInitialSampleTimer;
  const uploads = new Map();
  const downloads = new Map();

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

  const resolveUserDirectory = (requestedDirectory) => String(requestedDirectory || '').trim() || null;

  ws.on('message', (raw, isBinary) => {
    if (isBinary || raw.length > MAX_MESSAGE_SIZE) return ws.close(1009, '消息无效或过大');

    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: '消息格式错误。' });
    }

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
        ssh.sftp((sftpError, sftpClient) => {
          if (sftpError) return send(ws, { type: 'error', message: `无法建立 SFTP：${sftpError.message}` });
          sftp = sftpClient;
        });

        const openTerminal = ssh.shell.bind(ssh, { term: 'xterm-256color', cols: 100, rows: 28 });
        openTerminal((error, stream) => {
          if (error) {
            send(ws, { type: 'error', message: `无法创建终端：${error.message}` });
            return closeSsh();
          }
          shell = stream;
          connected = true;
          send(ws, { type: 'ready' });
          ssh.exec('printf "$HOME"', (homeError, homeStream) => {
            if (homeError || !homeStream) return;
            let home = '';
            homeStream.on('data', (data) => { home += data.toString('utf8'); });
            homeStream.on('close', () => {
              home = home.trim();
              if (home) send(ws, { type: 'home', home });
            });
          });
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
          stream.on('data', (data) => send(ws, { type: 'data', data: data.toString('utf8') }));
          stream.stderr.on('data', (data) => send(ws, { type: 'data', data: data.toString('utf8') }));
          stream.on('close', () => {
            send(ws, { type: 'closed', message: '远程会话已结束。' });
            closeSsh();
          });
        });
      });
      ssh.on('error', (error) => {
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
              return actual.length === expected.length && timingSafeEqual(actual, expected);
            }
            : undefined
        });
      } catch (error) {
        send(ws, { type: 'error', message: `SSH 配置错误：${error.message}` });
        closeSsh();
      }
      return;
    }

    if (message.type === 'validate-upload-directory') {
      if (!sftp) return send(ws, { type: 'upload-directory-invalid', requestId: String(message.requestId || ''), message: 'SFTP 尚未就绪。' });
      const requestId = String(message.requestId || '');
      const directory = resolveUserDirectory(message.directory);
      if (!directory) return send(ws, { type: 'upload-directory-invalid', requestId, message: '请输入上传目标目录。' });
      sftp.stat(directory, (error, stats) => {
        if (error?.code === 2) return send(ws, { type: 'upload-directory-invalid', requestId, message: `上传目录不存在：${directory}` });
        if (error) return send(ws, { type: 'upload-directory-invalid', requestId, message: `无法检查上传目录：${error.message}` });
        if ((stats.mode & 0o170000) !== 0o040000) return send(ws, { type: 'upload-directory-invalid', requestId, message: `上传目标不是目录：${directory}` });
        send(ws, { type: 'upload-directory-valid', requestId, directory });
      });
      return;
    }

    if (message.type === 'upload-start') {
      if (!sftp) return send(ws, { type: 'transfer-error', message: 'SFTP 尚未就绪。' });
      const id = String(message.id || '');
      const name = path.posix.basename(String(message.name || ''));
      if (!id || !name || uploads.has(id)) return send(ws, { type: 'transfer-error', id, message: '上传请求无效。' });
      const directory = resolveUserDirectory(message.directory);
      if (!directory) return send(ws, { type: 'transfer-error', id, message: '请输入上传目标目录。' });
      const size = Number(message.size) || 0;
      const conflictAction = String(message.conflictAction || '');
      const beginUpload = (remotePath) => {
        const stream = sftp.createWriteStream(remotePath, { flags: 'w', mode: 0o644 });
        const upload = { stream, received: 0, size, cancelled: false };
        uploads.set(id, upload);
        send(ws, { type: 'upload-ready', id, name: path.posix.basename(remotePath), remotePath });
        stream.on('error', (error) => {
          uploads.delete(id);
          if (!upload.cancelled) send(ws, { type: 'transfer-error', id, message: `上传失败：${error.message}` });
        });
        stream.on('close', () => {
          uploads.delete(id);
          if (!upload.cancelled) send(ws, { type: 'upload-complete', id, remotePath, size: upload.received });
        });
      };
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
    if (message.type === 'upload-chunk') {
      const upload = uploads.get(String(message.id || ''));
      if (!upload) return send(ws, { type: 'transfer-error', message: '上传会话不存在。' });
      try {
        const chunk = Buffer.from(String(message.data || ''), 'base64');
        upload.received += chunk.length;
        upload.stream.write(chunk);
        send(ws, { type: 'upload-progress', id: message.id, transferred: upload.received, size: upload.size });
      } catch { send(ws, { type: 'transfer-error', id: message.id, message: '上传数据无效。' }); }
      return;
    }
    if (message.type === 'upload-end') {
      const upload = uploads.get(String(message.id || ''));
      if (upload) upload.stream.end();
      return;
    }
    if (message.type === 'list-files') {
      if (!sftp) return send(ws, { type: 'transfer-error', operation: 'list-files', picker: message.picker, message: 'SFTP 尚未就绪。' });
      const requestedDirectory = String(message.directory || '').trim();
      const listDirectory = (currentPath, displayPath = currentPath) => {
        sftp.readdir(currentPath, (readError, entries) => {
          if (readError) return send(ws, { type: 'transfer-error', operation: 'list-files', picker: message.picker, message: `无法读取目录“${displayPath}”：${readError.message}` });
          const normalizedPath = currentPath === '/' ? '/' : currentPath.replace(/\/+$/, '');
          const files = entries.filter((entry) => !entry.attrs.isDirectory()).map((entry) => ({ name: entry.filename, path: path.posix.join(normalizedPath, entry.filename), size: entry.attrs.size }));
          send(ws, { type: 'file-list', picker: message.picker, path: displayPath, files });
        });
      };
      const directory = resolveUserDirectory(requestedDirectory);
      if (!directory) return send(ws, { type: 'transfer-error', operation: 'list-files', picker: message.picker, message: '请输入要读取的远程目录。' });
      listDirectory(directory, directory);
      return;
    }
    if (message.type === 'download') {
      const id = String(message.id || Date.now());
      if (!sftp) return send(ws, { type: 'transfer-error', id, direction: 'download', message: 'SFTP 尚未就绪。' });
      const remotePath = String(message.remotePath || '');
      if (!remotePath) return send(ws, { type: 'transfer-error', id, direction: 'download', message: '请提供远程文件路径。' });
      sftp.stat(remotePath, (statError, stats) => {
        if (statError) return send(ws, { type: 'transfer-error', id, direction: 'download', message: `无法读取远程文件：${statError.message}` });
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
    if (message.type === 'input' && shell) shell.write(String(message.data ?? ''));
    if (message.type === 'resize' && shell) {
      const cols = Math.max(20, Math.min(500, Number(message.cols) || 100));
      const rows = Math.max(5, Math.min(200, Number(message.rows) || 28));
      shell.setWindow(rows, cols, 0, 0);
    }
    if (message.type === 'disconnect') closeSsh();
  });

  ws.on('close', closeSsh);
  ws.on('error', closeSsh);
});

const port = process.env.PORT === undefined ? 1314 : Number(process.env.PORT);
const host = process.env.WEBSSH_HOST || '127.0.0.1';
server.listen(port, host, () => {
  const address = server.address();
  const listeningPort = typeof address === 'object' && address ? address.port : port;
  console.log(`WebSSH 正在监听 http://${host}:${listeningPort}`);
});

export { server };
