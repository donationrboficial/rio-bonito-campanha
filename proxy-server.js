#!/usr/bin/env node
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// simple args parser: --root <path> --port <num> --target <url>
const rawArgs = process.argv.slice(2);
const args = {};
for (let i = 0; i < rawArgs.length; i++) {
  const a = rawArgs[i];
  if (a === '--root' || a === '-r') args.root = rawArgs[++i];
  else if (a === '--port' || a === '-p') args.port = rawArgs[++i];
  else if (a === '--target') args.target = rawArgs[++i];
}
const ROOT = args.root || path.join(__dirname, 'www.maringa.pr.gov.br');
const PORT = parseInt(args.port || '5500', 10);
const TARGET = args.target || 'https://www.maringa.pr.gov.br';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/octet-stream'
};

function sendFile(res, filepath) {
  fs.stat(filepath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const ext = path.extname(filepath).toLowerCase();
    const ct = mime[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    const stream = fs.createReadStream(filepath);
    stream.pipe(res);
    stream.on('error', () => { res.statusCode = 500; res.end('Server error'); });
  });
}

function proxyRequest(req, res, targetBase) {
  const parsed = url.parse(targetBase + req.url);
  const options = {
    hostname: parsed.hostname,
    port: parsed.protocol === 'https:' ? 443 : 80,
    path: parsed.path,
    method: req.method,
    headers: Object.assign({}, req.headers, { host: parsed.host })
  };
  const proxy = https.request(options, (pres) => {
    // copy status and headers
    res.writeHead(pres.statusCode, pres.headers);
    pres.pipe(res, { end: true });
  });
  proxy.on('error', (e) => { res.statusCode = 502; res.end('Bad gateway: ' + e.message); });
  req.pipe(proxy, { end: true });
}

const server = http.createServer((req, res) => {
  const reqPath = url.parse(req.url).pathname;

  // Proxy _nuxt and any /_nuxt/builds/meta requests to the original site
  if (reqPath.startsWith('/_nuxt')) {
    proxyRequest(req, res, TARGET);
    return;
  }

  // Otherwise serve files from ROOT
  // Default to index.html for directories
  let filePath = path.join(ROOT, decodeURIComponent(reqPath));
  if (reqPath.endsWith('/')) filePath = path.join(filePath, 'index.html');
  // If path is root, serve index.html
  if (reqPath === '/') filePath = path.join(ROOT, 'index.html');

  // prevent directory traversal
  if (!filePath.startsWith(path.resolve(ROOT))) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  sendFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Proxy server running at http://127.0.0.1:${PORT}/`);
  console.log(`Serving root: ${ROOT}`);
  console.log(`Proxying /_nuxt -> ${TARGET}/_nuxt`);
});
