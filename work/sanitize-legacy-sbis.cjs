// Remove credential literals without ever logging them. Do not execute legacy scripts.
const fs = require('node:fs'), parser = require('@babel/parser');
const files = ['Claude outputs/test-sbis-connection.js','Claude outputs/test-sbis-catalog-full.js','Claude outputs/test-sbis-catalog-final.js'];
const names = {APP_CLIENT_ID:'SBIS_APP_CLIENT_ID',APP_SECRET:'SBIS_APP_SECRET',SECRET_KEY:'SBIS_SECRET_KEY'};
for (const file of files) {
  let source = fs.readFileSync(file,'utf8');
  const tree = parser.parse(source,{sourceType:'unambiguous'}), edits=[];
  function walk(node) {
    if(!node||typeof node!=='object') return;
    if(node.type==='VariableDeclarator' && node.id.type==='Identifier' && names[node.id.name] && node.init?.type==='StringLiteral') {
      edits.push({start:node.init.start,end:node.init.end,text:`process.env.${names[node.id.name]}`});
    }
    for(const value of Object.values(node)) if(Array.isArray(value)) value.forEach(walk); else if(value&&typeof value==='object') walk(value);
  }
  walk(tree);
  for(const edit of edits.sort((a,b)=>b.start-a.start)) source=source.slice(0,edit.start)+edit.text+source.slice(edit.end);
  if(edits.length) fs.writeFileSync(file,source);
  console.log(`${file}: ${edits.length} credential fields now read environment`);
}
