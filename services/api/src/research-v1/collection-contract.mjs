import assert from 'node:assert/strict';
import {normalizePublicUrl} from './public-network.mjs';
export function validateCollection(c){
  assert(c&&Object.keys(c).every(k=>['url','locale','targetCountry','authority','maxReads','maxRequests','maxRedirects','maxLinks'].includes(k)),'Unexpected collection option');
  const url=normalizePublicUrl(c.url);
  assert(!url.search&&!url.hash,'Use a public source URL without query or fragment');
  assert(/^[a-z]{2,3}-[A-Z]{2}$/.test(c.locale)&&/^[A-Z]{2}$/.test(c.targetCountry),'Explicit locale and country required');
  assert.equal(c.maxReads,1);assert(Number.isInteger(c.maxRequests)&&c.maxRequests>=1&&c.maxRequests<=2);
  assert.equal(c.maxRedirects,0);assert(Number.isInteger(c.maxLinks)&&c.maxLinks>=1&&c.maxLinks<=100);
  const a=c.authority;
  assert(a&&Object.keys(a).every(k=>['hostname','sourceType','provider','sourceUrl','checkedAt'].includes(k)),'Reviewed authority fields only');
  assert.equal(a.hostname,url.hostname);assert(['OFFICIAL_PROVIDER','OFFICIAL_SUPPORT','OFFICIAL_STORE','OFFICIAL_OPERATOR'].includes(a.sourceType));
  assert(typeof a.provider==='string'&&a.provider.length>0&&a.provider.length<=200);
  const source=normalizePublicUrl(a.sourceUrl);assert.equal(source.hostname,a.hostname);assert(!source.search&&!source.hash);
  assert(Number.isFinite(Date.parse(a.checkedAt)),'Reviewed authority timestamp required');
  return structuredClone(c);
}
