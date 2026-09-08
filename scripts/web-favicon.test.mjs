import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
const root=new URL('../apps/web/',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const html=read('index.html').toString();
const head=html.split('</head>')[0];
const links=[...head.matchAll(/<link\b([^>]+)>/g)].map(([,tag])=>Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,key,value])=>[key,value])));
function png(data,size) {
  assert.equal(data.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(data.readUInt32BE(16),size);assert.equal(data.readUInt32BE(20),size);
  assert.equal(data[24],8);assert.equal(data[25],2); // Original opaque RGB, not altered branding.
  assert.equal(data[28],0); // Non-interlaced exports.
  const compressed=[];let ended=false;
  for(let offset=8;offset<data.length;) {
    const length=data.readUInt32BE(offset),type=data.toString('ascii',offset+4,offset+8),end=offset+12+length;
    assert.ok(end<=data.length);assert.notEqual(type,'tRNS');
    let crc=0xffffffff;
    for(const byte of data.subarray(offset+4,offset+8+length)) {crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
    assert.equal((crc^0xffffffff)>>>0,data.readUInt32BE(offset+8+length));
    if(type==='IDAT')compressed.push(data.subarray(offset+8,offset+8+length));
    if(type==='IEND'){ended=true;assert.equal(end,data.length);}
    offset=end;
  }
  assert.ok(ended);const pixels=inflateSync(Buffer.concat(compressed));
  assert.equal(pixels.length,size*(size*3+1));
  for(let row=0;row<size;row++)assert.ok(pixels[row*(size*3+1)]<=4);
}
test('homepage has stable root-relative typed favicon links resolving to public files',()=>{
  const icons=links.filter(link=>['icon','apple-touch-icon'].includes(link.rel));assert.equal(icons.length,4);
  for(const icon of icons){assert.match(icon.href,/^\/[a-z0-9.-]+$/);assert.ok(existsSync(new URL(icon.href.slice(1),root)));}
  assert.ok(icons.some(icon=>icon.href==='/favicon.ico'&&icon.type==='image/x-icon'));
  for(const size of [96,192])assert.ok(icons.some(icon=>icon.type==='image/png'&&icon.sizes===`${size}x${size}`));
});
test('PNG exports decode structurally with valid CRCs, dimensions and opaque background',()=>{
  for(const size of [96,192]){assert.equal(size%48,0);png(read(`favicon-${size}x${size}.png`),size);}
  png(read('apple-touch-icon.png'),180);
});
test('ICO directory resolves to valid 16, 32 and 48 pixel PNG images',()=>{
  const data=read('favicon.ico');assert.equal(data.readUInt16LE(0),0);assert.equal(data.readUInt16LE(2),1);assert.equal(data.readUInt16LE(4),3);
  let next=54;
  [16,32,48].forEach((size,i)=>{const at=6+i*16,length=data.readUInt32LE(at+8),offset=data.readUInt32LE(at+12);
    assert.equal(data[at],size);assert.equal(data[at+1],size);assert.equal(offset,next);png(data.subarray(offset,offset+length),size);next+=length;});
  assert.equal(next,data.length);
});
test('homepage remains indexable with apex canonical and unchanged title/description',()=>{
  assert.equal(links.filter(link=>link.rel==='canonical').length,1);assert.equal(links.find(link=>link.rel==='canonical').href,'https://savlivo.com/');
  assert.ok(head.includes('<title>Savlivo — Take control of your subscriptions</title>'));
  assert.ok(head.includes('Savlivo helps you understand, manage and save on your subscriptions.'));
  assert.doesNotMatch(head,/noindex/i);
});
test('current public robots and sitemap allow homepage/favicon discovery',()=>{
  const robots=read('robots.txt').toString();assert.match(robots,/User-agent: \*/);assert.match(robots,/Allow: \//);
  for(const [,path] of robots.matchAll(/^Disallow:\s*(\S+)$/gm))for(const target of ['/','/favicon.ico','/favicon-96x96.png','/favicon-192x192.png','/apple-touch-icon.png'])assert.equal(target.startsWith(path),false);
  assert.ok(robots.includes('Sitemap: https://savlivo.com/sitemap.xml'));
  assert.ok(read('sitemap.xml').toString().includes('<loc>https://savlivo.com/</loc>'));
});
