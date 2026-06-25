const sharp=require('sharp');
const dir='assets/_poses-green/';
const POSES=['wave','proud','spark','think','teach','wrench','invite'];
async function keyed(file){
  const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];const d=g-Math.max(r,b);let a=255;if(d>60)a=0;else if(d>20)a=Math.round(255*(60-d)/40);if(a>0&&g>Math.max(r,b))data[i+1]=Math.max(r,b);data[i+3]=a;}
  return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().trim().toBuffer();
}
(async()=>{
  const CELL=420,LBL=40,COLS=3,PAD=12;
  for(let p=0;p<7;p++){
    const cw=CELL+PAD, W=cw*COLS+PAD, H=CELL+LBL+PAD*2;
    const ov=[];
    for(let v=0;v<COLS;v++){
      const cut=await keyed(`${dir}p${p+1}-v${v+1}.jpg`);
      const fit=await sharp(cut).resize(CELL-24,CELL-24,{fit:'inside'}).toBuffer();
      const x=PAD+v*cw;
      ov.push({input:fit,left:x+12,top:PAD+12});
      const t=Buffer.from(`<svg width="${cw}" height="${LBL}"><text x="14" y="28" font-family="sans-serif" font-size="26" fill="#cde" font-weight="bold">v${v+1}</text></svg>`);
      ov.push({input:t,left:x,top:PAD+CELL});
    }
    await sharp({create:{width:W,height:H,channels:3,background:'#0a0a0f'}}).composite(ov).png().toFile(`${dir}pose-${p+1}-${POSES[p]}.png`);
  }
  console.log('strips done');
})();
