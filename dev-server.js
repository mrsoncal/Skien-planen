const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const port = Number(process.env.PORT) || 5173;

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function safeResolve(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const rel = decoded.replace(/^\/+/, '');
  const full = path.resolve(root, rel);
  if (!full.startsWith(root)) return null;
  return full;
}

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const reqPath = req.url === '/' ? '/index.html' : req.url;
  const fullPath = safeResolve(reqPath);
  if (!fullPath) return send(res, 400, 'Bad request');

  fs.stat(fullPath, (err, stat) => {
    if (err) return send(res, 404, 'Not found');

    let filePath = fullPath;
    if (stat.isDirectory()) filePath = path.join(fullPath, 'index.html');

    fs.readFile(filePath, (readErr, data) => {
      if (readErr) return send(res, 404, 'Not found');
      const ext = path.extname(filePath).toLowerCase();
      send(res, 200, data, { 'Content-Type': mime[ext] || 'application/octet-stream' });
    });
  });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Serving ${root} at http://localhost:${port}`);
});
