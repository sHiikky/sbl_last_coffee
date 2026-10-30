const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = __dirname;
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'catalog-snapshot.json'), 'utf8'));
const menu = snapshot.rows.filter(row => row.is_visible && row.is_available);
const groups = new Map();
for (const row of menu) {
  const value = row.image_override_url || row.image_url;
  if (!value) continue;
  const url = value.startsWith('http') ? value : `https://api.sbis.ru${value}`;
  if (!groups.has(url)) groups.set(url, { url, products: [] });
  groups.get(url).products.push({ id: row.id, name: row.name, sbisId: row.sbis_id });
}
const queue = [...groups.values()];
fs.mkdirSync(path.join(root, 'downloaded'), { recursive: true });
let next = 0;
const results = [];
async function worker() {
  while (next < queue.length) {
    const entry = queue[next++];
    const checkedAt = new Date().toISOString();
    try {
      const response = await fetch(entry.url, { signal: AbortSignal.timeout(20000) });
      const contentType = response.headers.get('content-type') || '';
      const bytes = Buffer.from(await response.arrayBuffer());
      const result = { ...entry, checkedAt, status: response.status, contentType, bytes: bytes.length };
      if (response.ok && contentType.startsWith('image/')) {
        const extension = contentType.includes('webp') ? '.webp' : contentType.includes('png') ? '.png' : '.jpg';
        const filename = new URL(entry.url).hostname.includes('supabase.co')
          ? path.basename(new URL(entry.url).pathname)
          : `sbis-${entry.products[0].sbisId}${extension}`;
        result.file = path.join('downloaded', filename);
        result.sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
        fs.writeFileSync(path.join(root, result.file), bytes);
      } else {
        console.log(JSON.stringify({ names: entry.products.map(p => p.name), status: response.status, contentType }));
      }
      results.push(result);
    } catch (error) {
      results.push({ ...entry, checkedAt, error: error.message });
      console.log(JSON.stringify({ names: entry.products.map(p => p.name), error: error.message }));
    }
  }
}
Promise.all(Array.from({ length: 6 }, worker)).then(() => {
  results.sort((a, b) => a.url.localeCompare(b.url));
  const report = {
    checkedAt: new Date().toISOString(), totalMenuRows: menu.length,
    photoRows: menu.filter(row => row.image_override_url || row.image_url).length,
    uniqueUrls: results.length, loaded: results.filter(r => r.file).length,
    failed: results.filter(r => !r.file).length, results,
  };
  fs.writeFileSync(path.join(root, 'photo-link-checks.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, results: undefined }));
}).catch(error => { console.error(error.message); process.exitCode = 1; });
