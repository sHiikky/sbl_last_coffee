const fs = require('node:fs'), path = require('node:path');
const project = 'vxefueynagwuavlyeiqc';
const source = fs.readFileSync(path.join(__dirname, '../../lib/supabaseClient.js'), 'utf8');
const key = source.match(/configuredKey \|\| '(sb_publishable_[^']+)'/)[1];
const fields = 'id,sbis_id,name,display_name,price,menu_category,menu_subcategory,is_visible,is_available,is_modifier,image_url,image_override_url';
(async () => {
  const response = await fetch(`https://${project}.supabase.co/rest/v1/products?select=${fields}&order=id&limit=1000`, { headers: { apikey: key }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`Public catalog GET: ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length >= 1000) throw Error('Incomplete catalog; explicit pagination required');
  fs.writeFileSync(path.join(__dirname, 'catalog-current.json'), JSON.stringify({ project, checkedAt: new Date().toISOString(), readOnly: true, rows }, null, 2));
  const menu = rows.filter(p => p.is_visible && p.is_available && !p.is_modifier);
  const special = rows.filter(p => /спеш|special/i.test(`${p.menu_category} ${p.menu_subcategory}`));
  console.log(JSON.stringify({ project, total: rows.length, menu: menu.length, subcategories: [...new Set(menu.map(p => p.menu_subcategory))], special }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
