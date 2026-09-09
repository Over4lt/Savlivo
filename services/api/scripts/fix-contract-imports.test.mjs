import test from 'node:test';
import assert from 'node:assert/strict';
import { rewriteImports } from './fix-contract-imports.mjs';

test('rewrites relative imports, side effects, re-exports and literal dynamic imports', () => {
  const input = `import { a } from './catalog'; import '../setup'; export * from "./markets"; export { b } from './billing'; import('./lazy');`;
  assert.equal(rewriteImports(input).source, `import { a } from './catalog.js'; import '../setup.js'; export * from "./markets.js"; export { b } from './billing.js'; import('./lazy.js');`);
});
test('preserves packages, suffixes, URLs, ordinary strings, comments and computed imports', () => {
  const input = `import 'pkg'; import 'node:fs'; import './file.js'; export * from './data.json'; import('./file?raw'); import('./dir/'); import(name); const x = "import './untouched'"; // export * from './comment'\n`;
  assert.equal(rewriteImports(input).source, input);
});
test('transformation is deterministic and idempotent', () => {
  const first = rewriteImports(`import './a'; export * from '../b';`);
  assert.deepEqual(first.targets, ['./a.js', '../b.js']);
  assert.equal(rewriteImports(first.source).source, first.source);
  assert.deepEqual(rewriteImports(first.source).targets, []);
});
