(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SblPhotoComposer=factory();})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function geometry(w,h,model,W,H){
    if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0)throw Error('Некорректный размер фотографии.');
    W=W||1280;H=H||720;var zoom=Math.max(.4,Math.min(3,Number(model.zoom)||1));
    var scale=(model.fit==='cover'?Math.max(W/w,H/h):Math.min(W/w,H/h))*zoom;
    var width=w*scale,height=h*scale;
    return {x:(W-width)/2+Math.abs(W-width)/2*Math.max(-1,Math.min(1,(Number(model.x)||0)/100)),y:(H-height)/2+Math.abs(H-height)/2*Math.max(-1,Math.min(1,(Number(model.y)||0)/100)),width:width,height:height};
  }
  function create(canvas){
    var bitmap=null,generation=0,model={fit:'contain',zoom:1,x:0,y:0};
    function draw(){if(!bitmap)return;canvas.width=1280;canvas.height=720;var ctx=canvas.getContext('2d'),r=geometry(bitmap.width,bitmap.height,model);ctx.fillStyle='#EFF0ED';ctx.fillRect(0,0,1280,720);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(bitmap,r.x,r.y,r.width,r.height);}
    function reset(){generation++;if(bitmap)bitmap.close();bitmap=null;model={fit:'contain',zoom:1,x:0,y:0};}
    return {
      hasImage:function(){return !!bitmap;},reset:reset,
      load:async function(blob){
        var stamp=++generation,next=await createImageBitmap(blob);
        if(stamp!==generation){next.close();return false;}
        if(!next.width||!next.height||next.width*next.height>50000000){next.close();throw Error('Выберите фото до 50 мегапикселей.');}
        if(bitmap)bitmap.close();bitmap=next;model={fit:'contain',zoom:1,x:0,y:0};draw();return true;
      },
      set:function(value){model={fit:value.fit,zoom:value.zoom,x:value.x,y:value.y};draw();},
      blob:async function(){if(!bitmap)throw Error('Выберите фотографию.');var blob=await new Promise(function(resolve){canvas.toBlob(resolve,'image/webp',.9);});if(!blob||blob.size>2097152||!['image/webp','image/png','image/jpeg'].includes(blob.type))throw Error('Не удалось подготовить фото до 2 МБ. Выберите другое изображение.');return blob;}
    };
  }
  return {create:create,geometry:geometry};
});
