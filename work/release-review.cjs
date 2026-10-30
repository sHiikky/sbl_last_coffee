// Read-only release inventory. Never print secret values.
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [...new Set(execFileSync('git', ['ls-files','-z','--cached','--others','--exclude-standard'], {cwd:root}).toString('utf8').split('\0').filter(Boolean))];
const groups = {}, largest = [], findings = [];
for (const file of files) {
  const absolute = path.join(root,file);
  if(!fs.existsSync(absolute)||!fs.statSync(absolute).isFile()) continue;
  const size=fs.statSync(absolute).size, group=file.startsWith('work/')?file.split('/').slice(0,2).join('/'):file.split('/')[0];
  groups[group] ||= {files:0,bytes:0}; groups[group].files++; groups[group].bytes+=size;
  largest.push({file,bytes:size});
  if(!/\.(?:js|cjs|ts|json|md|txt|sql|toml|html|yml|yaml|example|ps1|py)$/i.test(file)||size>15_000_000) continue;
  const text=fs.readFileSync(absolute,'utf8');
  const report=(rule,index)=>findings.push({file,line:text.slice(0,index).split('\n').length,rule});
  const patterns = [
    ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9_]{25,}|github_pat_[A-Za-z0-9_]{35,})\b/g],
    ['supabase-secret',/\bsb_secret_[A-Za-z0-9_-]{20,}\b/g],
    ['secret-literal',/\b(?:app_secret|appSecret|APP_SECRET|client_secret|secret_key|secretKey|SECRET_KEY|service_role_key|SUPABASE_SERVICE_ROLE_KEY|SBIS_APP_SECRET|SBIS_SECRET_KEY|password|passwd)\b\s*[:=]\s*['"`]([^'"`\r\n]{16,})['"`]/gi],
  ];
  for(const [rule,re] of patterns) for(const match of text.matchAll(re)) {
    if(rule==='secret-literal' && /(?:placeholder|example|your[_ -]|replace[_ -]|<|>|process\.env|test[_ -]|\$\{|^env\()/i.test(match[1])) continue;
    report(rule,match.index);
  }
  for(const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try { if(JSON.parse(Buffer.from(match[0].split('.')[1],'base64url')).role==='service_role') report('service-role-jwt',match.index); } catch {}
  }
}
const summary={files:files.length,totalMB:Math.round(largest.reduce((sum,file)=>sum+file.bytes,0)/10485.76)/100,...(process.argv.includes('--summary')?{}:{groups:Object.entries(groups).sort((a,b)=>b[1].bytes-a[1].bytes).map(([path,value])=>({path,files:value.files,mb:Math.round(value.bytes/10485.76)/100})),largest:largest.sort((a,b)=>b.bytes-a.bytes).slice(0,12)}),findings};
console.log(JSON.stringify(summary,null,2));
if(findings.length) process.exitCode=1;
