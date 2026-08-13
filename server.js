const { createReadStream, existsSync } = require('node:fs');
const { createServer } = require('node:http');
const { extname, join, normalize } = require('node:path');

const root = __dirname;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };

function createMindflowServer() {
  return createServer((request, response) => {
    const path = normalize(join(root, request.url === '/' ? 'index.html' : request.url));
    if (!path.startsWith(root) || !existsSync(path)) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    createReadStream(path).pipe(response);
  });
}

module.exports = { createMindflowServer };
