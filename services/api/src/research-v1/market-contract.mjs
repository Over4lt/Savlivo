import {existsSync} from 'node:fs';
const compiled=new URL('../../../../packages/contracts/src/markets.js',import.meta.url);
const source=existsSync(compiled)?await import(compiled.href):await (await import('tsx/esm/api')).tsImport('../../../../packages/contracts/src/markets.ts',import.meta.url);
export const {countryCurrencyData,countryCurrencies}=source;
