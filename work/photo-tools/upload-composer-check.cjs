const assert=require('node:assert/strict');
const photos=require('../../kassa-terminal/photo-upload');
const compose=require('../../kassa-terminal/photo-composer');
const rect=compose.geometry(300,900,{fit:'contain',zoom:1,x:0,y:0});
assert.deepEqual(rect,{x:520,y:0,width:240,height:720});
const filled=compose.geometry(300,900,{fit:'cover',zoom:1});assert.equal(filled.width,1280);assert.ok(filled.height>720);
const small=compose.geometry(300,900,{fit:'contain',zoom:.5,x:100,y:100});assert.equal(small.x+small.width,1280);assert.equal(small.y+small.height,720);
assert.throws(()=>compose.geometry(0,900,{}));
for(const type of ['image/jpeg','image/png','image/webp'])photos.validate({type,size:1024});
for(const file of [{type:'image/svg+xml',size:1},{type:'application/json',size:1},{type:'image/png',size:26*1024*1024}])assert.throws(()=>photos.validate(file));
class Element{constructor(){this.events={};this.value='';this.classList={add(){},remove(){},toggle(){}};}addEventListener(n,fn){this.events[n]=fn;}click(){this.clicked=true;}}
const input=new Element(),zone=new Element(),choose=new Element(),remove=new Element();let disabled=false,files=[],errors=[],removed=0;
const drop=photos.bind({input,zone,choose,remove,isDisabled:()=>disabled,onFile:f=>files.push(f),onError:e=>errors.push(e),onRemove:()=>removed++});
const event=fs=>({preventDefault(){},dataTransfer:{files:fs}});
(async()=>{
 choose.events.click();assert.equal(input.clicked,true);
 await zone.events.drop(event([{type:'image/png',size:1}]));assert.equal(files.length,1);
 await zone.events.drop(event([{type:'image/png',size:1},{type:'image/png',size:1}]));assert.equal(files.length,1);assert.equal(errors.length,1);
 disabled=true;drop.setDisabled(true);await zone.events.drop(event([{type:'image/png',size:1}]));assert.equal(files.length,1);assert.equal(choose.disabled,true);
 disabled=false;drop.setDisabled(false);remove.events.click();assert.equal(removed,1);
 const original=global.createImageBitmap;let resolve,closed=0,draws=[];
 global.createImageBitmap=()=>new Promise(r=>resolve=r);
 const canvas={getContext:()=>({fillRect(){},drawImage:(...args)=>draws.push(args)}),toBlob:fn=>fn({type:'image/webp',size:10})};
 const editor=compose.create(canvas),pending=editor.load({});editor.reset();resolve({width:300,height:900,close(){closed++;}});assert.equal(await pending,false);assert.equal(editor.hasImage(),false);assert.equal(closed,1);
 const next=editor.load({});resolve({width:300,height:900,close(){closed++;}});await next;assert.equal(editor.hasImage(),true);assert.equal(draws.at(-1)[1],520);
 editor.set({fit:'contain',zoom:.5,x:0,y:0});assert.equal(draws.at(-1)[3],120);assert.equal((await editor.blob()).type,'image/webp');editor.reset();assert.equal(closed,2);
 global.createImageBitmap=original;
 console.log('PASS: contain/cover/scale/position geometry, file types and size bounds, drop/choose/remove/disabled state, stale decode rejected and bitmaps released');
})().catch(e=>{console.error(e);process.exitCode=1});
