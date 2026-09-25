const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', 'admin-dashboard', 'dist');
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4173);
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error(`Missing built dashboard: ${root}${path.sep}index.html`);
  process.exit(2);
}

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const relative = requestPath === '/' ? '/index.html' : requestPath;
  const candidate = path.resolve(root, `.${relative}`);
  if (!candidate.startsWith(root + path.sep) && candidate !== root) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  const file = fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(root, 'index.html');
  const extension = path.extname(file).toLowerCase();
  response.writeHead(200, {
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  fs.createReadStream(file).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Syria Delivery demo: http://${host}:${port}`);
  console.log('Press Ctrl+C to stop.');
});
