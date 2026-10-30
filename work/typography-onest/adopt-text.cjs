// Surgical import-only migration. Keep JSX, props, handlers and style definitions intact.
const fs = require('node:fs'), path = require('node:path'), parser = require('@babel/parser');
const root = path.resolve(__dirname, '../..');
const files = [path.join(root, 'App.js')];
function collect(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) collect(file);
    else if (item.name.endsWith('.js') && !['AppText.js','AppTextInput.js'].includes(item.name)) files.push(file);
  }
}
for (const dir of ['components','screens','navigation']) collect(path.join(root, dir));
let count = 0;
for (const file of files) {
  let source = fs.readFileSync(file, 'utf8');
  const ast = parser.parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const edits = [];
  for (const node of ast.program.body) {
    if (node.type !== 'ImportDeclaration' || node.source.value !== 'react-native') continue;
    const text = node.specifiers.filter(s => s.type === 'ImportSpecifier' && ['Text','TextInput'].includes(s.imported.name));
    if (!text.length) continue;
    const rest = node.specifiers.filter(s => !text.includes(s)).map(s => source.slice(s.start, s.end));
    const imports = rest.length ? [`import { ${rest.join(', ')} } from 'react-native';`] : [];
    for (const specifier of text) {
      const component = specifier.imported.name === 'Text' ? 'AppText' : 'AppTextInput';
      let relative = path.relative(path.dirname(file), path.join(root, 'components', component)).replaceAll('\\', '/');
      if (!relative.startsWith('.')) relative = './' + relative;
      imports.push(`import ${specifier.local.name} from '${relative}';`);
    }
    edits.push({ start: node.start, end: node.end, text: imports.join('\n') });
  }
  for (const edit of edits.reverse()) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
  if (edits.length) { fs.writeFileSync(file, source); count++; }
}
console.log(`Updated text imports in ${count} application files`);
