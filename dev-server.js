const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const portArgIndex = process.argv.indexOf('--port');
const portArg = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : NaN;
const port = (Number.isFinite(portArg) && portArg > 0) ? portArg : (Number(process.env.PORT) || 5173);

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pbf': 'application/x-protobuf',
  '.pmtiles': 'application/vnd.pmtiles',
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

function sendStream(req, res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = mime[ext] || 'application/octet-stream';
  const range = req.headers.range;

  // Always advertise range support; PMTiles requires it.
  const baseHeaders = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
  };

  if (!range) {
    res.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Length': stat.size,
      ...baseHeaders,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // Range format: bytes=start-end
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range);
  if (!match) {
    res.writeHead(416, {
      'Cache-Control': 'no-store',
      'Content-Range': `bytes */${stat.size}`,
      ...baseHeaders,
    });
    return res.end();
  }

  const startRaw = match[1];
  const endRaw = match[2];
  let start = startRaw ? Number(startRaw) : 0;
  let end = endRaw ? Number(endRaw) : (stat.size - 1);

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0 || start > end) {
    res.writeHead(416, {
      'Cache-Control': 'no-store',
      'Content-Range': `bytes */${stat.size}`,
      ...baseHeaders,
    });
    return res.end();
  }

  if (start >= stat.size) {
    res.writeHead(416, {
      'Cache-Control': 'no-store',
      'Content-Range': `bytes */${stat.size}`,
      ...baseHeaders,
    });
    return res.end();
  }

  end = Math.min(end, stat.size - 1);
  const chunkSize = (end - start) + 1;

  res.writeHead(206, {
    'Cache-Control': 'no-store',
    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    'Content-Length': chunkSize,
    ...baseHeaders,
  });
  if (req.method === 'HEAD') return res.end();

  fs.createReadStream(filePath, { start, end }).pipe(res);
}

const server = http.createServer((req, res) => {
  const reqPath = req.url === '/' ? '/index.html' : req.url;
  const fullPath = safeResolve(reqPath);
  if (!fullPath) return send(res, 400, 'Bad request');

  fs.stat(fullPath, (err, stat) => {
    if (err) return send(res, 404, 'Not found');

    let filePath = fullPath;
    if (stat.isDirectory()) filePath = path.join(fullPath, 'index.html');

    fs.stat(filePath, (fileStatErr, fileStat) => {
      if (fileStatErr || !fileStat || !fileStat.isFile()) return send(res, 404, 'Not found');
      sendStream(req, res, filePath, fileStat);
    });
  });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Serving ${root} at http://localhost:${port}`);
});
