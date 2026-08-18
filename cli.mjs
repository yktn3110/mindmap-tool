import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import serverModule from './server.js';

const { createMindflowServer } = serverModule;
const args = process.argv.slice(2);
const noOpen = args.includes('--no-open');
const filePath = args.find(arg => arg !== '--no-open');

if (!filePath || args.filter(arg => arg !== '--no-open').length !== 1) {
  console.error('使い方: npm run open -- <マップ.json> [--no-open]');
  process.exit(1);
}

let map;
const absolutePath = resolve(filePath);
try {
  map = JSON.parse(await readFile(absolutePath, 'utf8'));
  if (!Array.isArray(map.nodes)) throw new Error('nodes is missing');
} catch (error) {
  console.error(`マップファイルを開けません: ${absolutePath}`);
  process.exit(1);
}

const token = randomBytes(24).toString('hex');
const server = createMindflowServer({ initialMap:{ token, filename:basename(absolutePath), map } });
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}/?initial-map=${token}`;
  console.log(`Mindflow: ${url}`);
  console.log('終了するには Ctrl+C を押してください。');
  if (!noOpen) openBrowser(url);
});

function openBrowser(url) {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const commandArgs = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const browser = spawn(command, commandArgs, { detached:true, stdio:'ignore' });
  browser.unref();
}

function closeServer() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', closeServer);
process.on('SIGTERM', closeServer);
