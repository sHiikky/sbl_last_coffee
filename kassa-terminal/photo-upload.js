(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.SblPhotoUpload=factory();})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  function validate(file){if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>25*1024*1024)throw Error('Выберите JPG, PNG или WebP размером до 25 МБ.');}
  function bind(o){
    var depth=0;
    function blocked(){return o.isDisabled&&o.isDisabled();}
    async function receive(files){
      if(blocked()||!files||!files.length)return;
      try{if(files.length!==1)throw Error('Выберите одну фотографию.');validate(files[0]);await o.onFile(files[0]);}catch(e){o.onError(e.message||'Не удалось открыть фото.');}
      finally{o.input.value='';}
    }
    o.choose.addEventListener('click',function(){if(!blocked())o.input.click();});
    o.input.addEventListener('change',function(){return receive(o.input.files);});
    o.zone.addEventListener('dragenter',function(e){e.preventDefault();if(!blocked()){depth++;o.zone.classList.add('is-dragover');}});
    o.zone.addEventListener('dragover',function(e){e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect=blocked()?'none':'copy';});
    o.zone.addEventListener('dragleave',function(e){e.preventDefault();depth=Math.max(0,depth-1);if(!depth)o.zone.classList.remove('is-dragover');});
    o.zone.addEventListener('drop',function(e){e.preventDefault();depth=0;o.zone.classList.remove('is-dragover');return receive(e.dataTransfer&&e.dataTransfer.files);});
    if(o.remove)o.remove.addEventListener('click',function(){if(!blocked())o.onRemove();});
    return {setDisabled:function(value){o.input.disabled=value;o.choose.disabled=value;if(o.remove)o.remove.disabled=value;o.zone.classList.toggle('is-disabled',value);if(value){depth=0;o.zone.classList.remove('is-dragover');}}};
  }
  return {bind:bind,validate:validate};
});
