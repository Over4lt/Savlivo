// A deterministic, full-page Lanczos3 resize. The source PNG is never mutated.
import {createHash} from 'node:crypto';
import {readPngPixels,writePngPixels} from './png-pixels.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sinc=x=>x===0?1:Math.sin(Math.PI*x)/(Math.PI*x);
const lanczos=x=>Math.abs(x)<3?sinc(x)*sinc(x/3):0;

function weights(sourceSize,targetSize,index) {
    const scale=sourceSize/targetSize,filterScale=Math.max(1,scale),center=(index+0.5)*scale-0.5;
    const left=Math.max(0,Math.ceil(center-3*filterScale)),right=Math.min(sourceSize-1,Math.floor(center+3*filterScale));
    const result=[];let total=0;
    for(let position=left;position<=right;position++) {
        const weight=lanczos((position-center)/filterScale);
        if(weight===0)continue;
        result.push([position,weight]);total+=weight;
    }
    return result.map(([position,weight])=>[position,weight/total]);
}

export function createRenderedOverview(sourceBytes,{width=800}={}) {
    const source=readPngPixels(sourceBytes);
    if(!Number.isSafeInteger(width)||width<128||width>source.width||source.width>32768||source.height>32768||source.width*source.height>50_000_000)throw Error('RENDERED_OVERVIEW_BOUND');
    const height=Math.max(1,Math.round(source.height*width/source.width));
    const horizontal=new Float32Array(width*source.height*4),output={width,height,data:Buffer.alloc(width*height*4)};
    const xWeights=Array.from({length:width},(_,x)=>weights(source.width,width,x));
    const yWeights=Array.from({length:height},(_,y)=>weights(source.height,height,y));
    for(let y=0;y<source.height;y++)for(let x=0;x<width;x++)for(const [sx,w] of xWeights[x]) {
        const from=(y*source.width+sx)*4,to=(y*width+x)*4;
        for(let c=0;c<4;c++)horizontal[to+c]+=source.data[from+c]*w;
    }
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        const to=(y*width+x)*4;
        for(let c=0;c<4;c++) {
            let value=0;
            for(const [sy,w] of yWeights[y])value+=horizontal[(sy*width+x)*4+c]*w;
            output.data[to+c]=Math.max(0,Math.min(255,Math.round(value)));
        }
    }
    const bytes=writePngPixels(output);
    return {schema:'V3_RENDERED_OVERVIEW_V1',method:'LANCZOS3_FULL_PAGE_V1',sourceSha256:hash(sourceBytes),widthPx:width,heightPx:height,sha256:hash(bytes),bytesBase64:bytes.toString('base64')};
}

export function validateRenderedOverview(artifact,overview) {
    if(!artifact?.image?.bytesBase64||!overview||overview.schema!=='V3_RENDERED_OVERVIEW_V1'||overview.method!=='LANCZOS3_FULL_PAGE_V1'||!Number.isSafeInteger(overview.widthPx))throw Error('RENDERED_OVERVIEW_INVALID');
    const expected=createRenderedOverview(Buffer.from(artifact.image.bytesBase64,'base64'),{width:overview.widthPx});
    if(expected.sourceSha256!==artifact.image.sha256||expected.sha256!==overview.sha256||expected.heightPx!==overview.heightPx||expected.bytesBase64!==overview.bytesBase64)throw Error('RENDERED_OVERVIEW_BINDING_INVALID');
    return overview;
}

export function createTargetedVisualRegion(artifact,bboxPx) {
    const sourceBytes=Buffer.from(artifact.image.bytesBase64,'base64'),source=readPngPixels(sourceBytes);
    if(!Array.isArray(bboxPx)||bboxPx.length!==4||!bboxPx.every(Number.isSafeInteger))throw Error('RENDERED_TARGET_REGION_INVALID');
    const [x,y,width,height]=bboxPx;
    if(x<0||y<0||width<16||height<16||x+width>source.width||y+height>source.height||width*height>source.width*source.height*0.5)throw Error('RENDERED_TARGET_REGION_INVALID');
    const cropped={width,height,data:Buffer.alloc(width*height*4)};
    for(let row=0;row<height;row++)source.data.copy(cropped.data,row*width*4,((y+row)*source.width+x)*4,((y+row)*source.width+x+width)*4);
    const bytes=writePngPixels(cropped);
    return {schema:'V3_TARGETED_REGION_V1',sourceSha256:artifact.image.sha256,bboxPx:[...bboxPx],widthPx:width,heightPx:height,sha256:hash(bytes),bytesBase64:bytes.toString('base64')};
}
