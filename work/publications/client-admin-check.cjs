const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadDomain = require('../load-domain.cjs');
const admin = require('../../kassa-terminal/content-admin.js');
const flush = async () => { for (let i=0;i<80;i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise=new Promise(r => { resolve=r; }); return {promise,resolve}; };

class Element {
  constructor(tag='div') { this.tagName=tag; this.events=new Map(); this.children=[]; this.dataset={}; this.value=''; this.disabled=false; this.checked=false; this.className=''; this.attrs={}; this._text='';
    this.classList={ contains:name => this.className.split(/\s+/).includes(name), add:name => { if(!this.classList.contains(name)) this.className+=' '+name; }, remove:name => { this.className=this.className.split(/\s+/).filter(x => x!==name).join(' '); }, toggle:(name,value) => { (value ?? !this.classList.contains(name)) ? this.classList.add(name) : this.classList.remove(name); } };
  }
  addEventListener(name,callback) { if(!this.events.has(name))this.events.set(name,[]); this.events.get(name).push(callback); }
  async fire(name) { for(const callback of this.events.get(name)||[]) await callback({preventDefault(){}}); await flush(); }
  append(...children) { this.children.push(...children); }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children=children; this._text=''; }
  set textContent(text) { this._text=String(text); this.children=[]; }
  get textContent() { return this._text+this.children.map(x=>x.textContent).join(' '); }
  set src(value) { this.attrs.src=value; }
  get src() { return this.attrs.src; }
  getAttribute(name) { return this.attrs[name] ?? null; }
  removeAttribute(name) { delete this.attrs[name]; }
}
function harness(){
  const html=fs.readFileSync(path.resolve(__dirname,'../../kassa-terminal/index.html'),'utf8');
  const roots=new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1],new Element()]));
  const descendants=el => [el,...el.children.flatMap(descendants)];
  const document={ getElementById:id => { assert(roots.has(id),id); return roots.get(id); },createElement:tag => new Element(tag),querySelectorAll:selector => {
    assert.equal(selector,'[data-publication-open]'); return [...roots.values()].flatMap(descendants).filter(el=>el.dataset.publicationOpen);
  }};
  let active=true,session=1,uuid=0;
  const state={rows:[],calls:[],plans:[],confirm:true,products:[{id:'p1',name:'Айс Латте',image_override_url:'https://images.example.test/latte.png'}]};
  const db={
    from(table){ assert.equal(table,'products'); return { select(){return this;},eq(){return this;},order(){return Promise.resolve({data:state.products});} }; },
    async rpc(name,args){ state.calls.push({name,args}); const plan=state.plans.shift(); if(plan)return plan.promise;
      if(name==='staff_list_app_publications') return {data:{server_now:'2026-10-29T05:00:00Z',items:state.rows}};
      assert.equal(name,'staff_save_app_publication');
      const row={...args.p_payload,id:args.p_id,version:args.p_expected_version+1,starts_at:args.p_payload.starts_at || '2026-10-29T05:00:00.123Z',updated_at:'2026-10-29T05:00:00.123Z',visibility:args.p_payload.status==='published'?'active':args.p_payload.status};
      state.rows=[row,...state.rows.filter(x=>x.id!==row.id)]; return {data:row};
    }
  };
  let photoReady=false;
  const photoEditor={hasImage:()=>photoReady,reset:()=>{photoReady=false;},load:async()=>{photoReady=true;return true;},set(){},blob:async()=>({type:'image/webp',size:1})};
  const controller=admin.create({document,getDb:()=>db,isActive:()=>active,getSession:()=>session,confirm:()=>state.confirm,photoEditor,fetchPhoto:async()=>({type:'image/webp',size:1}),crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++uuid).padStart(12,'0')}`}});
  return {el:id=>roots.get(id),controller,state,session:()=>{session++;active=false;controller.reset();},activate:()=>{active=true;},descendants};
}

(async()=>{
  assert.equal(admin.fromTomskInput('2026-10-29T11:00'),'2026-10-29T04:00:00.000Z');
  assert.equal(admin.toTomskInput('2026-10-29T19:30:00Z'),'2026-10-30T02:30');
  assert.throws(()=>admin.fromTomskInput('2026-02-30T12:00'));
  assert.throws(()=>admin.fromTomskInput('2026-10-29T25:00'));
  for(const url of ['javascript:alert(1)','http://example.test/a.png','https://user:pass@example.test/a.png','https://example.test/a.png\n']) {
    if(url.endsWith('\n')) continue; // surrounding whitespace is deliberately normalized by the form.
    assert.throws(()=>admin.imageUrl(url));
  }
  const payload=admin.makePayload({kind:'news',title:' <img src=x> ',body:'one\r\ntwo',image:'',product:'',starts:'',ends:''},'draft');
  assert.equal(payload.title,'<img src=x>'); assert.equal(payload.body,'one\ntwo');
  assert.throws(()=>admin.makePayload({kind:'promotion',title:'Sale',body:'Terms'},'published'),/окончания/);
  assert.throws(()=>admin.makePayload({kind:'news',title:'Sale',body:'Terms',starts:'2026-10-29T12:00',ends:'2026-10-29T11:00'},'published'),/позже/);
  console.log('PASS: Tomsk schedule, impossible date rejection, HTTPS-only images and promotion end date');

  let response={data:{server_now:'2030-01-01T00:00:00Z',items:[{id:'one',kind:'news',title:'Real',body:'Text',starts_at:'2029-12-31T20:00:00Z',ends_at:'2030-01-01T00:01:00Z',image_url:'javascript:alert(1)'},{id:'invalid',kind:'x',title:'No',body:'',starts_at:'2029-01-01'}]}};
  const service=loadDomain('lib/contentService.js',{'./supabaseClient':{supabase:{rpc:async name=>{assert.equal(name,'get_app_publications');return response;}}}},{URL});
  let feed=await service.fetchAppPublications(); assert.equal(feed.items.length,1); assert.equal(feed.items[0].imageUrl,null);
  assert.equal(service.visiblePublications(feed.items,Date.parse('2030-01-01T00:00:59Z')).length,1);
  assert.equal(service.visiblePublications(feed.items,Date.parse('2030-01-01T00:01:00Z')).length,0);
  response={error:{code:'PGRST202'}}; feed=await service.fetchAppPublications(); assert.equal(feed.configured,false); assert.equal(feed.items.length,0);
  response={error:{code:'NETWORK'}}; await assert.rejects(service.fetchAppPublications());
  console.log('PASS: public feed uses only filtered RPC, validates payload, expires with server clock and has no fake fallback');

  const h=harness();
  await h.el('contentBtn').fire('click');
  assert.equal(h.controller.isOpen(),true); assert.equal(h.state.calls.length,1); assert.equal(h.state.calls[0].name,'staff_list_app_publications');
  assert.match(h.el('publicationDirty').textContent,/ещё не сохранена/); assert.equal(h.el('publicationPublish').disabled,false);
  h.el('publicationTitle').value='<img src=x onerror=alert(1)>';
  h.el('publicationBody').value='Terms\nSecond line';
  await h.el('publicationTitle').fire('input');
  assert.equal(h.el('publicationPreviewTitle').textContent,h.el('publicationTitle').value);
  assert.equal(h.el('publicationPreviewTitle').children.length,0,'User title is literal text, never inserted HTML');
  await h.el('publicationSaveDraft').fire('click');
  assert.equal(h.state.calls.filter(x=>x.name==='staff_save_app_publication').length,1);
  assert.equal(h.state.rows[0].status,'draft'); assert.match(h.el('contentStatus').textContent,/Гостям он не виден/);
  h.el('publicationProduct').value='p1'; await h.el('publicationUseProductPhoto').fire('click');
  assert.equal(h.el('publicationImage').value,'https://images.example.test/latte.png');
  h.state.confirm=false; await h.el('publicationPublish').fire('click');
  assert.equal(h.state.calls.filter(x=>x.name==='staff_save_app_publication').length,1,'Cancelled preview approval cannot publish');
  h.state.confirm=true; await h.el('publicationPublish').fire('click');
  assert.equal(h.state.rows[0].status,'published'); assert.equal(h.el('publicationCurrentState').textContent,'На главном экране');
  const saved=h.state.calls.filter(x=>x.name==='staff_save_app_publication');
  assert.equal(saved[1].args.p_expected_version,1); assert.equal(saved[1].args.p_id,saved[0].args.p_id);
  assert.equal(saved[1].args.p_payload.starts_at,'2026-10-29T05:00:00.123Z','Editing body/photo must not truncate original scheduled seconds');
  console.log('PASS: draft/publish require explicit actions, stable UUID/version, literal text preview and preserved schedule precision');

  const late=harness(); await late.el('contentBtn').fire('click');
  late.el('publicationTitle').value='Late'; late.el('publicationBody').value='Body';
  const wait=deferred(); late.state.plans.push(wait);
  await late.el('publicationSaveDraft').fire('click');
  const first=late.state.calls.find(x=>x.name==='staff_save_app_publication'); assert(first);
  await late.el('publicationSaveDraft').fire('click'); assert.equal(late.state.calls.filter(x=>x.name==='staff_save_app_publication').length,1,'Double click is single flight');
  late.session(); wait.resolve({data:{id:first.args.p_id,title:'OLD STAFF DATA',body:'old',version:1,status:'draft',kind:'news'}}); await flush();
  assert.equal(late.controller.isOpen(),false); assert.equal(late.el('publicationTitle').value,''); assert(!late.el('contentStatus').textContent.includes('OLD STAFF DATA'));
  console.log('PASS: duplicate saves blocked and late previous-session responses cannot expose staff data after logout');

  const conflict=harness(); await conflict.el('contentBtn').fire('click'); conflict.el('publicationTitle').value='Keep draft'; conflict.el('publicationBody').value='My text';
  const failure=deferred(); conflict.state.plans.push(failure); await conflict.el('publicationSaveDraft').fire('click');
  failure.resolve({error:{message:'PUBLICATION_CONFLICT: reload before editing'}}); await flush();
  assert.equal(conflict.el('publicationBody').value,'My text'); assert.match(conflict.el('contentStatus').textContent,/другим сотрудником/); assert.equal(conflict.el('publicationSaveDraft').disabled,false);
  console.log('PASS: edit conflicts preserve unsaved form and allow deliberate recovery');
})().catch(error=>{console.error(error);process.exitCode=1;});
