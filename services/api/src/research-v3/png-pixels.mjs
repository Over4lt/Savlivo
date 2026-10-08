// Small deterministic PNG pixel codec for the RGB/RGBA, 8-bit images admitted
// by the rendered-artifact contract. It keeps V3 independent of image packages.
import {inflateSync,deflateSync} from 'node:zlib';

const signature=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Uint32Array.from({length:256},(_,index)=>{let value=index;for(let bit=0;bit<8;bit++)value=value&1?0xedb88320^(value>>>1):value>>>1;return value>>>0;});
function crc32(bytes){let value=0xffffffff;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return (value^0xffffffff)>>>0;}
function chunk(type,body){const name=Buffer.from(type,'ascii'),length=Buffer.alloc(4),check=Buffer.alloc(4);length.writeUInt32BE(body.length);check.writeUInt32BE(crc32(Buffer.concat([name,body])));return Buffer.concat([length,name,body,check]);}
const paeth=(left,up,corner)=>{const prediction=left+up-corner,dl=Math.abs(prediction-left),du=Math.abs(prediction-up),dc=Math.abs(prediction-corner);return dl<=du&&dl<=dc?left:du<=dc?up:corner;};

export function readPngPixels(input){
    const bytes=Buffer.from(input);
    if(bytes.length<45||!bytes.subarray(0,8).equals(signature))throw Error('RENDERED_IMAGE_INVALID');
    let offset=8,width=0,height=0,channels=0,seenHeader=false,seenEnd=false;
    const data=[];
    while(offset<bytes.length){
        if(offset+12>bytes.length)throw Error('RENDERED_IMAGE_INVALID');
        const length=bytes.readUInt32BE(offset),type=bytes.toString('ascii',offset+4,offset+8),end=offset+length+12;
        if(end>bytes.length||crc32(bytes.subarray(offset+4,end-4))!==bytes.readUInt32BE(end-4))throw Error('RENDERED_IMAGE_INVALID');
        const body=bytes.subarray(offset+8,end-4);
        if(!seenHeader){
            if(type!=='IHDR'||length!==13)throw Error('RENDERED_IMAGE_INVALID');
            width=body.readUInt32BE(0);height=body.readUInt32BE(4);channels=body[9]===2?3:body[9]===6?4:0;
            if(body[8]!==8||!channels||body[10]!==0||body[11]!==0||body[12]!==0||width<1||height<1||width>32768||height>32768||width*height>50_000_000)throw Error('RENDERED_IMAGE_UNSUPPORTED');
            seenHeader=true;
        } else if(type==='IDAT')data.push(body);
        else if(type==='IEND'){if(length!==0||end!==bytes.length)throw Error('RENDERED_IMAGE_INVALID');seenEnd=true;break;}
        else if(type==='IHDR')throw Error('RENDERED_IMAGE_INVALID');
        offset=end;
    }
    if(!seenHeader||!seenEnd||!data.length)throw Error('RENDERED_IMAGE_INVALID');
    const stride=width*channels,expected=height*(stride+1);
    let encoded;try{encoded=inflateSync(Buffer.concat(data),{maxOutputLength:expected});}catch{throw Error('RENDERED_IMAGE_INVALID');}
    if(encoded.length!==expected)throw Error('RENDERED_IMAGE_INVALID');
    const decoded=Buffer.alloc(stride*height),rgba=Buffer.alloc(width*height*4);
    for(let y=0;y<height;y++){
        const filter=encoded[y*(stride+1)];if(filter>4)throw Error('RENDERED_IMAGE_INVALID');
        for(let x=0;x<stride;x++){
            const index=y*stride+x,left=x>=channels?decoded[index-channels]:0,up=y?decoded[index-stride]:0,corner=y&&x>=channels?decoded[index-stride-channels]:0;
            const predictor=[0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][filter];
            decoded[index]=(encoded[y*(stride+1)+1+x]+predictor)&255;
        }
        for(let x=0;x<width;x++){
            const from=y*stride+x*channels,to=(y*width+x)*4;
            rgba[to]=decoded[from];rgba[to+1]=decoded[from+1];rgba[to+2]=decoded[from+2];rgba[to+3]=channels===4?decoded[from+3]:255;
        }
    }
    return {width,height,data:rgba};
}

export function writePngPixels({width,height,data}){
    if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>32768||height>32768||width*height>50_000_000||data?.length!==width*height*4)throw Error('RENDERED_IMAGE_INVALID');
    const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
    const stride=width*4,raw=Buffer.alloc(height*(stride+1));
    for(let y=0;y<height;y++)Buffer.from(data.buffer,data.byteOffset+y*stride,stride).copy(raw,y*(stride+1)+1);
    return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
