/**
 * mock-ssh-server.mjs — 基于 ssh2.Server 的本地 mock SSH 服务器
 *
 * 用于功能/压力测试：支持 password 认证、交互式 shell（简单回显）、
 * exec 命令（hostname/健康信息）与 SFTP（内存文件系统，最小协议实现）。
 */
import ssh2Pkg from 'ssh2';
const { Server, utils } = ssh2Pkg;

/** 生成 OpenSSH 格式的 ed25519 主机密钥 */
async function generateHostKey() {
  return await new Promise((resolve, reject) => {
    utils.generateKeyPair('ed25519', (err, key) => {
      if (err) reject(err);
      else resolve({ private: key.private, public: key.public });
    });
  });
}

/**
 * 创建 mock SSH 服务器。
 * @param {object} [options]
 * @param {string} [options.username='tester'] 允许的用户名
 * @param {string} [options.password='pass123'] 允许的密码
 * @param {string} [options.hostname='mock-host'] exec hostname 返回值
 * @param {number} [options.cpuCores=4] exec nproc 返回值
 * @returns {Promise<{ server: import('net').Server, port: number, close: () => Promise<void>, fs: Map<string, {mode:number,size:number,mtime:number,content:Buffer}>, io: { written: string[] } }>}
 */
export async function createMockSshServer(options = {}) {
  const username = options.username ?? 'tester';
  const password = options.password ?? 'pass123';
  const hostname = options.hostname ?? 'mock-host';
  const cpuCores = options.cpuCores ?? 4;

  /** 内存文件系统：路径 -> 元数据（目录以 size:-1 且 mode 高位为目录标识） */
  const memFs = new Map();
  const now = Math.floor(Date.now() / 1000);
  memFs.set('/', { mode: 0o040755, size: 0, mtime: now });
  memFs.set('/home', { mode: 0o040755, size: 0, mtime: now });
  memFs.set('/home/tester', { mode: 0o040755, size: 0, mtime: now });

  /** 记录 shell 输入（用于断言终端输入链路） */
  const io = { written: [] };

  const key = await generateHostKey();
  const server = new Server({ hostKeys: [key.private] }, (client) => {
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === username && ctx.password === password) return ctx.accept();
      ctx.reject(['password']);
    });
    client.on('ready', () => {});
    client.on('session', (accept) => {
      const session = accept();
      session.on('pty', (ptyAccept) => { if (ptyAccept) ptyAccept(); });
      session.on('shell', (shellAccept) => {
        const stream = shellAccept();
        stream.write(`Welcome to ${hostname} mock shell\r\n`);
        stream.on('data', (data) => {
          const text = data.toString('utf8');
          io.written.push(text);
          // 回显输入，模拟终端
          stream.write(text);
        });
      });
      session.on('exec', (execAccept, _reject, info) => {
        const stream = execAccept();
        const command = info.command;
        // 模拟 server/ws.js 的健康信息采集命令
        if (command.includes('__WEBSSH_HEALTH__')) {
          stream.write(`__WEBSSH_HEALTH__\n${hostname}\n${cpuCores}\ncpu_idle 100000 200000\nMemTotal: 8000000 kB\nMemAvailable: 4000000 kB\n`);
        } else if (command.includes('HOME')) {
          stream.write(`/home/${username}`);
        } else if (/hostname/.test(command)) {
          stream.write(`${hostname}\n`);
        } else {
          stream.write('');
        }
        stream.exit(0);
        stream.end();
      });
      session.on('sftp', (sftpAccept) => {
        const sftp = sftpAccept();
        const handles = new Map(); // handleKey(string) -> { kind, path, ... }
        let handleCounter = 0;
        const newHandle = () => Buffer.from(`h${++handleCounter}`);
        const handleKey = (h) => Buffer.from(h).toString('latin1');

        const STATUS = sftp.STATUS_CODE || { OK: 0, EOF: 1, NO_SUCH_FILE: 2, FAILURE: 4, PERMISSION_DENIED: 3 };
        const posix = path => {
          let p = String(path).replace(/\/+/g, '/');
          if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
          return p;
        };
        const dirname = (p) => {
          const i = p.lastIndexOf('/');
          if (i <= 0) return '/';
          return p.slice(0, i);
        };
        const basename = (p) => p.slice(p.lastIndexOf('/') + 1);

        sftp.on('OPEN', (reqID, filename, pflags, attrs) => {
          if (process.env.MOCK_SFTP_DEBUG) console.error(`[sftp] OPEN ${filename} pflags=0x${pflags.toString(16)}`);
          const path = posix(filename);
          const wantWrite = (pflags & 0x0002) !== 0 || (pflags & 0x0008) !== 0 || (pflags & 0x0001) === 0; // WRITABLE
          const exists = memFs.get(path);
          if (wantWrite) {
            const dir = memFs.get(dirname(path));
            if (!dir || (dir.mode & 0o170000) !== 0o040000) return sftp.status(reqID, STATUS.FAILURE);
            const handle = newHandle();
            handles.set(handleKey(handle), { kind: 'file', path, readOffset: 0, writeBufs: [], received: 0 });
            return sftp.handle(reqID, handle);
          }
          if (!exists || (exists.mode & 0o170000) !== 0o100000) return sftp.status(reqID, STATUS.NO_SUCH_FILE);
          const handle = newHandle();
          handles.set(handleKey(handle), { kind: 'file', path, readOffset: 0 });
          sftp.handle(reqID, handle);
        });

        sftp.on('WRITE', (reqID, handle, offset, data) => {
          const entry = handles.get(handleKey(handle));
          if (!entry) return sftp.status(reqID, STATUS.FAILURE);
          // 按协议 offset 定位写入（ssh2 WriteStream 并发乱序发 WRITE）
          const buf = Buffer.from(data);
          const gap = offset - entry.received;
          if (gap > 0) entry.writeBufs.push(Buffer.alloc(gap));
          else if (gap < 0) {
            // 乱序回退：简化处理——从头拼接到统一缓冲
            entry.writeBufs = [Buffer.concat(entry.writeBufs)];
            if (offset < entry.writeBufs[0].length) {
              entry.writeBufs[0] = Buffer.concat([
                entry.writeBufs[0].subarray(0, offset),
                buf,
                entry.writeBufs[0].subarray(offset + buf.length)
              ]);
              entry.received = Math.max(entry.received, offset + buf.length);
              return sftp.status(reqID, STATUS.OK);
            }
          }
          entry.writeBufs.push(buf);
          entry.received = Math.max(entry.received, offset + buf.length);
          sftp.status(reqID, STATUS.OK);
        });

        sftp.on('READ', (reqID, handle, offset, length) => {
          const entry = handles.get(handleKey(handle));
          if (!entry || entry.kind !== 'file') return sftp.status(reqID, STATUS.FAILURE);
          const meta = memFs.get(entry.path);
          if (!meta) return sftp.status(reqID, STATUS.NO_SUCH_FILE);
          if (offset >= meta.content.length) return sftp.status(reqID, STATUS.EOF);
          sftp.data(reqID, meta.content.subarray(offset, offset + length));
        });

        sftp.on('CLOSE', (reqID, handle) => {
          const entry = handles.get(handleKey(handle));
          if (entry && entry.writeBufs) {
            let content = Buffer.concat(entry.writeBufs);
            if (entry.received !== undefined && content.length !== entry.received) {
              content = content.subarray(0, entry.received);
            }
            memFs.set(entry.path, { mode: 0o100644, size: content.length, mtime: Math.floor(Date.now() / 1000), content });
          }
          handles.delete(handleKey(handle));
          sftp.status(reqID, STATUS.OK);
        });

        sftp.on('STAT', (reqID, path) => {
          const meta = memFs.get(posix(path));
          if (!meta) return sftp.status(reqID, STATUS.NO_SUCH_FILE);
          sftp.attrs(reqID, meta);
        });
        sftp.on('LSTAT', (reqID, path) => {
          const meta = memFs.get(posix(path));
          if (!meta) return sftp.status(reqID, STATUS.NO_SUCH_FILE);
          sftp.attrs(reqID, meta);
        });
        sftp.on('REALPATH', (reqID, path) => {
          const resolved = posix(path) === '.' ? `/home/${username}` : posix(path);
          sftp.name(reqID, [{ filename: resolved, longname: resolved, attrs: memFs.get(resolved) || {} }]);
        });

        sftp.on('OPENDIR', (reqID, path) => {
          const meta = memFs.get(posix(path));
          if (!meta || (meta.mode & 0o170000) !== 0o040000) return sftp.status(reqID, STATUS.NO_SUCH_FILE);
          const handle = newHandle();
          handles.set(handleKey(handle), { kind: 'dir', path: posix(path), listed: false });
          sftp.handle(reqID, handle);
        });

        sftp.on('READDIR', (reqID, handle) => {
          const entry = handles.get(handleKey(handle));
          if (!entry || entry.kind !== 'dir') return sftp.status(reqID, STATUS.FAILURE);
          if (entry.listed) return sftp.status(reqID, STATUS.EOF);
          entry.listed = true;
          const prefix = entry.path === '/' ? '' : entry.path;
          const names = [];
          for (const [p, meta] of memFs) {
            if (p === entry.path || !p.startsWith(prefix + '/')) continue;
            if (p.slice(prefix.length + 1).includes('/')) continue;
            names.push({ filename: basename(p), longname: p, attrs: meta });
          }
          sftp.name(reqID, names);
        });

        sftp.on('MKDIR', (reqID, path) => {
          memFs.set(posix(path), { mode: 0o040755, size: 0, mtime: Math.floor(Date.now() / 1000) });
          sftp.status(reqID, STATUS.OK);
        });
        sftp.on('REMOVE', (reqID, path) => {
          memFs.delete(posix(path));
          sftp.status(reqID, STATUS.OK);
        });
        sftp.on('RMDIR', (reqID, path) => {
          memFs.delete(posix(path));
          sftp.status(reqID, STATUS.OK);
        });
      });
    });
  });

  // 监听随机端口
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();

  return {
    server,
    port: address.port,
    fs: memFs,
    io,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  };
}
