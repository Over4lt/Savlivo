// Deterministic size/format exports of the existing official artwork; no redraw/crop.
// Uses macOS's installed sips, with no additional package dependency.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const web=fileURLToPath(new URL('../apps/web/',import.meta.url));
const source=join(web,'assets/logo.png');
function resize(size,path){execFileSync('sips',['-z',String(size),String(size),source,'--out',path],{stdio:'pipe'});}
for(const size of [96,192])resize(size,join(web,`favicon-${size}x${size}.png`));
resize(180,join(web,'apple-touch-icon.png'));
const temp=mkdtempSync(join(tmpdir(),'savlivo-favicon-'));
try {
  const sizes=[16,32,48];
  const entries=sizes.map(size=>{const path=join(temp,`${size}.png`);resize(size,path);return readFileSync(path);});
  // ICO supports PNG-compressed images; keep the original opaque RGB artwork.
  const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
  let offset=header.length;
  sizes.forEach((size,i)=>{const at=6+16*i;header[at]=size;header[at+1]=size;header.writeUInt16LE(1,at+4);header.writeUInt16LE(24,at+6);
    header.writeUInt32LE(entries[i].length,at+8);header.writeUInt32LE(offset,at+12);offset+=entries[i].length;});
  writeFileSync(join(web,'favicon.ico'),Buffer.concat([header,...entries]));
}finally{rmSync(temp,{recursive:true,force:true});}
