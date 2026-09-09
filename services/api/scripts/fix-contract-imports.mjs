import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Parse emitted JS rather than rewriting matching text inside comments/strings.
export function rewriteImports(source) {
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
      if ((value.startsWith('./') || value.startsWith('../')) &&
          !extname(value) && !/[?#]/.test(value) && !value.endsWith('/')) {
        edits.push(literal.getEnd() - 1);
        targets.push(`${value}.js`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  for (const position of edits.sort((a, b) => b - a)) {
    source = source.slice(0, position) + '.js' + source.slice(position);
  }
  return { source, targets };
}

async function main() {
  const directory = fileURLToPath(new URL('../dist/packages/contracts/src/', import.meta.url));
  const pending = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const file = resolve(directory, entry.name);
    const original = await readFile(file, 'utf8');
    const result = rewriteImports(original);
    // Fail the build rather than silently emitting an unresolvable target.
    for (const target of result.targets) {
      if (!(await stat(resolve(dirname(file), target))).isFile()) throw new Error(`Invalid contract import: ${target}`);
    }
    if (result.source !== original) pending.push({ file, source: result.source });
  }
  for (const { file, source } of pending) await writeFile(file, source);
  console.log(`Shared-contract ESM imports: updated ${pending.length} compiled files`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
