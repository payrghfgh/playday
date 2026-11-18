/* Playday dev server — no dependencies, no build step.
   `npm run dev` then open http://localhost:5173 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 5173;

/* the front page is the front page; the app answers on its own paths */
const ROUTES = {
  '/': 'index.html',
  '/calendar': 'app.html',
  '/calendar/': 'app.html',
  '/cal': 'app.html',
  '/cal/': 'app.html',
  '/tasks': 'app.html',
  '/tasks/': 'app.html'
};

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent((req.url || '/').split('?')[0]);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad request');
    return;
  }

  const routed = ROUTES[pathname] || (pathname === '/' ? 'index.html' : pathname);
  const target = path.join(ROOT, routed);
  if (!target.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Forbidden');
    return;
  }

  fs.stat(target, (err, stat) => {
    let file = target;
    if (!err && stat.isDirectory()) file = path.join(target, 'index.html');
    fs.stat(file, (err2, stat2) => {
      if (err2 || !stat2.isFile()) {
        // mirror the host: unknown paths get the front page's 404, not a bare string
        const notFound = path.join(ROOT, '404.html');
        if (fs.existsSync(notFound)) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          fs.createReadStream(notFound).pipe(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found: ' + pathname);
        }
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      fs.createReadStream(file).pipe(res);
    });
  });
});

server.listen(PORT, () => {
  console.log('\n  Playday is running at http://localhost:' + PORT + '\n  Press Ctrl+C to stop.\n');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error('\n  Port ' + PORT + ' is busy. Try: PORT=5174 npm run dev\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});
