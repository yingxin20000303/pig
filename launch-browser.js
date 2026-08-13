import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.PORT = '1314';
process.env.WEBSSH_PROFILES_PATH = path.join(__dirname, 'ssh-connections.json');

const { server } = await import('./server.js');
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 1314;
const url = `http://127.0.0.1:${port}`;

execFile('cmd.exe', ['/c', 'start', '', url], { windowsHide: true });

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
