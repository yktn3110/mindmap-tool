const { createReadStream, existsSync } = require('node:fs');
const { createServer } = require('node:http');
const { extname, join, normalize, sep } = require('node:path');

const root = __dirname;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };

function createMindflowServer({ initialMap } = {}) {
  return createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/initial-map') {
      if (!initialMap || url.searchParams.get('token') !== initialMap.token) { response.writeHead(404); response.end('Not found'); return; }
      response.writeHead(200, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' });
      response.end(JSON.stringify({ filename:initialMap.filename, map:initialMap.map }));
      return;
    }
    const relativePath = (url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
    const path = normalize(join(root, relativePath));
    if ((path !== root && !path.startsWith(root + sep)) || !existsSync(path)) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    createReadStream(path).pipe(response);
  });
}

module.exports = { createMindflowServer };
