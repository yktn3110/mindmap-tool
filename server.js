const { createReadStream, existsSync } = require('node:fs');
const { writeFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const { extname, join, normalize, sep } = require('node:path');

const root = __dirname;
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8' };

function createMindflowServer({ initialMap } = {}) {
  return createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/api/initial-map') {
      if (!initialMap || url.searchParams.get('token') !== initialMap.token) { response.writeHead(404); response.end('Not found'); return; }
      if (request.method === 'GET') {
        response.writeHead(200, { 'content-type':'application/json; charset=utf-8', 'cache-control':'no-store' });
        response.end(JSON.stringify({ filename:initialMap.filename, map:initialMap.map, canOverwrite:!!initialMap.filePath }));
        return;
      }
      if (request.method === 'PUT' && initialMap.filePath) {
        let body='',tooLarge=false;
        request.on('data',chunk=>{body+=chunk;if(body.length>10*1024*1024){tooLarge=true;request.destroy();}});
        request.on('end',async()=>{
          if(tooLarge){response.writeHead(413);response.end('Map is too large');return;}
          try{
            const map=JSON.parse(body);if(!Array.isArray(map.nodes))throw new Error('invalid map');
            await writeFile(initialMap.filePath,JSON.stringify(map,null,2),'utf8');initialMap.map=map;
            response.writeHead(204);response.end();
          }catch{response.writeHead(400);response.end('Invalid map');}
        });
        return;
      }
      response.writeHead(405);response.end('Method not allowed');
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
