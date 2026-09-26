import { readFile, readdir, stat, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Parse emitted JS rather than rewriting matching text inside comments/strings.
export function rewriteImports(source, { extensionless = true } = {}) {
  const tree = ts.createSourceFile('contracts.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const edits = [];
  const targets = [];
  function visit(node) {
    const literal = ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
      ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? node.arguments[0] : undefined;
    if (literal && ts.isStringLiteral(literal)) {
      const value = literal.text;
      const relative = value.startsWith('./') || value.startsWith('../');
      const replacement = relative && !/[?#]/.test(value)
        ? /\.(?:ts|mts|cts)$/.test(value) ? value.replace(/\.(ts|mts|cts)$/, (_, suffix) => ({ts:'.js',mts:'.mjs',cts:'.cjs'})[suffix])
          : extensionless && !extname(value) && !value.endsWith('/') ? `${value}.js` : null
        : null;
      if (replacement) {
        edits.push({start:literal.getStart(tree)+1,end:literal.getEnd()-1,replacement});
        targets.push(replacement);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const edit of edits.sort((a,b)=>b.start-a.start)) {
    source = source.slice(0,edit.start) + edit.replacement + source.slice(edit.end);
  }
  return { source, targets };
}

async function main() {
  const directory = resolve(fileURLToPath(new URL('../dist/packages/contracts/src/', import.meta.url)));
  const pending = [];
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  async function walk(folder) {
    for (const entry of (await readdir(folder, {withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file=resolve(folder,entry.name);
      if(entry.isDirectory()) { await walk(file); continue; }
      if(!entry.isFile() || !/\.(?:js|mjs|cjs)$/.test(entry.name)) continue;
      const original=await readFile(file,'utf8');
      // tsc preserves explicit .ts specifiers in copied .mjs research modules.
      // Only contracts have the older extensionless-import convention.
      const result=rewriteImports(original,{extensionless:folder===directory});
      for(const target of result.targets) {
        if(!(await stat(resolve(dirname(file),target))).isFile()) throw Error(`Invalid emitted import: ${file}: ${target}`);
      }
      if(result.source!==original)pending.push({file,source:result.source});
    }
  }
  await walk(dist);
  for (const { file, source } of pending) await writeFile(file, source);
  const research = new URL('../dist/services/api/src/research-v1/', import.meta.url);
  await mkdir(research, { recursive: true });
  await copyFile(new URL('../src/research-v1/research-item.schema.json', import.meta.url), new URL('research-item.schema.json', research));
  await copyFile(new URL('../src/research-v1/decodo-runtime-config.json', import.meta.url), new URL('decodo-runtime-config.json', research));
  await mkdir(new URL('browser-isolation/', research), { recursive: true });
  for (const name of ['bridge.cjs', 'seccomp-chromium.json']) {
    await copyFile(new URL('../src/research-v1/browser-isolation/' + name, import.meta.url), new URL('browser-isolation/' + name, research));
  }
  const decodoAssets = new URL('../dist/docs/catalog/global-47/research-v1/', import.meta.url);
  await mkdir(decodoAssets, {recursive:true});
  await copyFile(new URL('../../../docs/catalog/global-47/research-v1/decodo-capabilities.json', import.meta.url), new URL('decodo-capabilities.json', decodoAssets));
  const productAssets=new URL('../dist/docs/product/',import.meta.url);
  await mkdir(productAssets,{recursive:true});
  await copyFile(new URL('../../../docs/product/service-universe-manifest.json',import.meta.url),new URL('service-universe-manifest.json',productAssets));
  console.log(`Shared-contract ESM imports: updated ${pending.length} compiled files`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
