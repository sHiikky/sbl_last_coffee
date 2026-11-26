(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.SblProductBadge=factory();
})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  var styles=['orange','holo','silver','black'];
  function parse(value){
    var raw=typeof value==='string'?value.trim():'';
    if(!raw)return {text:'',style:'orange'};
    if(raw==='hit')return {text:'ХИТ',style:'orange'};
    if(raw==='new')return {text:'NEW',style:'black'};
    var index=raw.indexOf(':'),prefix=raw.slice(0,index);
    return index>0&&styles.includes(prefix)?{text:raw.slice(index+1),style:prefix}:{text:raw,style:'orange'};
  }
  function encode(text,style){
    text=String(text||'').trim();
    if(!text)return '';
    if(!styles.includes(style)||Array.from(text).length>20||/[\x00-\x1f\x7f-\x9f]/.test(text))
      throw Error('Метка: до 20 символов, без переносов. Выберите оформление.');
    return style+':'+text;
  }
  return {parse:parse,encode:encode,styles:styles};
});
