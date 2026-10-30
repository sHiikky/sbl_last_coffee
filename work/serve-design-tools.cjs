const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const routes = [
  ['/photo-editor/', path.join(__dirname, 'photo-editor')],
  ['/cashier/', path.join(root, 'kassa-terminal')],
  ['/brand-assets/', path.join(root, 'assets')],
];
// Optional local sketches are ignored by Git; a fresh checkout serves only the active tools.
for (const name of ['product-concepts', 'launch-concepts']) {
  const directory = path.join(__dirname, name);
  if (fs.existsSync(directory)) routes.push([`/${name}/`, directory]);
}
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400).end(); return; }
  if (pathname === '/') { res.writeHead(302, { Location: '/photo-editor/' }).end(); return; }
  const route = routes.find(([prefix]) => pathname.startsWith(prefix));
  if (!route) { res.writeHead(404).end(); return; }
  const [prefix, directory] = route;
  const file = path.resolve(directory, pathname.slice(prefix.length) || 'index.html');
  if (!file.startsWith(directory + path.sep) || !Object.hasOwn(mime, path.extname(file).toLowerCase())) { res.writeHead(403).end(); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file).toLowerCase()], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') res.end(); else fs.createReadStream(file).pipe(res);
  });
}).listen(8096, '127.0.0.1', () => console.log('SBL tools: http://127.0.0.1:8096/photo-editor/ | /cashier/'));
