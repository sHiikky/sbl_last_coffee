// Offline display-asset processor. Never globally key out white: white dishes
// and food stay untouched. Only exterior-connected, translucent neutral matte
// is eligible; dense foreground and coloured pixels stop the flood fill.
function cleanProductEdgePixels(input, width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || input.length !== width * height * 4) throw Error('INVALID_RGBA');
  const count=width*height, seen=new Uint8Array(count), queue=new Int32Array(count), output=new Uint8Array(input);
  let head=0,tail=0,changed=0,visible=0;
  for(let p=0;p<count;p++)if(input[p*4+3])visible++;
  const matte=p=>{const i=p*4;if(input[i+3]>=248)return false;const max=Math.max(input[i],input[i+1],input[i+2]),min=Math.min(input[i],input[i+1],input[i+2]);return min>=90&&max-min<=30;};
  const eligible=p=>input[p*4+3]<24||matte(p);
  const add=p=>{if(!seen[p]&&eligible(p)){seen[p]=1;queue[tail++]=p;}};
  // Transparent holes are exterior too; opaque internal white cannot seed a fill.
  for(let p=0;p<count;p++)if(input[p*4+3]===0)add(p);
  for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}
  for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);if(x)add(p-1);if(x+1<width)add(p+1);if(y)add(p-width);if(y+1<height)add(p+width);}
  for(let p=0;p<count;p++)if(seen[p]&&input[p*4+3]&&matte(p)){output[p*4+3]=0;changed++;}
  // Refuse unknown images for which the matte would dominate the foreground.
  if(visible&&changed/visible>0.35)return {pixels:new Uint8Array(input),changed:0,refused:true};
  return {pixels:output,changed,refused:false};
}
module.exports={cleanProductEdgePixels};
