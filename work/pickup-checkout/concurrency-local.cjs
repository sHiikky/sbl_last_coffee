// Disposable native PostgreSQL fixture only. No cloud host, tokens or passwords.
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const psql = 'C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const args = ['-h', '127.0.0.1', '-p', '5543', '-U', 'postgres', '-d', 'sbl_pickup_test', '-X', '-q', '-tA', '-v', 'ON_ERROR_STOP=1'];
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const json = value => `${literal(JSON.stringify(value))}::jsonb`;
function run(sql, onChunk) {
  const child = spawn(psql, args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.stdout.on('data', chunk => { const text = chunk.toString(); out += text; onChunk?.(out); });
    child.stderr.on('data', chunk => { err += chunk.toString(); });
    child.on('close', code => resolve({ code, out, err }));
  });
  child.stdin.end(sql);
  return completion;
}
async function checked(sql) {
  const result = await run(sql);
  if (result.code !== 0) throw new Error(result.err || result.out);
  return result.out.trim();
}
const u1=randomUUID(),u2=randomUUID(),u3=randomUUID(),staff=randomUUID(),base=randomUUID(),mod=randomUUID();
const keys=[randomUUID(),randomUUID(),randomUUID(),randomUUID()];
const ids=[u1,u2,u3];
const cleanup=()=>checked(`DELETE FROM public.order_items WHERE order_id IN(SELECT id FROM public.orders WHERE customer_id IN(${ids.map(literal).join(',')}));
 DELETE FROM public.bonus_transactions WHERE customer_id IN(${ids.map(literal).join(',')});
 DELETE FROM public.reward_entitlements WHERE customer_id IN(${ids.map(literal).join(',')});
 DELETE FROM public.orders WHERE customer_id IN(${ids.map(literal).join(',')});
 DELETE FROM public.bonus_accounts WHERE customer_id IN(${ids.map(literal).join(',')});
 DELETE FROM public.reward_progress WHERE customer_id IN(${ids.map(literal).join(',')});
 DELETE FROM public.staff WHERE user_id=${literal(staff)};
 DELETE FROM auth.users WHERE id IN(${[...ids,staff].map(literal).join(',')});
 DELETE FROM public.products WHERE id IN(${literal(base)},${literal(mod)});`);
const lineKey=`${base}|${mod}x2`;
const items=[{product_id:base,quantity:1,modifiers:[{product_id:mod,quantity:2}]}];
function checkout(user,key,bonus) {
  const quote={version:2,items:[[lineKey,base,1,100,[[mod,2,10]]]],payable:120-bonus};
  const contact={customer_id:user,name:'Concurrent fixture',phone:'+79990000003',comment:''};
  return `SELECT id FROM public.create_pickup_order(${literal(key)},${json(items)},NULL,false,${bonus},${json(quote)},${json(contact)},${json({point_id:'lenina-72',pickup_at:null})});`;
}
const claims=user=>`SELECT set_config('request.jwt.claim.sub',${literal(user)},true); SET LOCAL ROLE authenticated;`;
const lastUuid=out=>out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)?.at(-1);
const results=[];
function assert(condition,label) { if(!condition) throw new Error(`ASSERTION_FAILED: ${label}`); results.push({test:label,result:'PASS'}); }
async function overlapPair(label,userA,sqlA,userB,sqlB,errorPrefix) {
  const applicationA=`sbl_pickup_${label}_A`, applicationB=`sbl_pickup_${label}_B`;
  let releaseMarker;
  const marker=new Promise(resolve=>{releaseMarker=resolve;});
  const a=run(`BEGIN; SET LOCAL application_name=${literal(applicationA)}; ${claims(userA)} ${sqlA}\n\\echo HOLDING_LOCK\nSELECT pg_sleep(2.5); COMMIT;`, output=>{
    if(output.includes('HOLDING_LOCK')) releaseMarker();
  });
  await Promise.race([marker,a.then(r=>{if(!r.out.includes('HOLDING_LOCK'))throw new Error(r.err||'A did not acquire its lock');})]);
  const b=run(`BEGIN; SET LOCAL application_name=${literal(applicationB)}; ${claims(userB)} ${sqlB} COMMIT;`);
  let overlap=false;
  const deadline=Date.now()+1900;
  while(Date.now()<deadline&&!overlap) {
    overlap=(await checked(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity a WHERE a.application_name=${literal(applicationB)} AND cardinality(pg_blocking_pids(a.pid))>0);`))==='t';
    if(!overlap) await new Promise(resolve=>setTimeout(resolve,70));
  }
  const [ra,rb]=await Promise.all([a,b]);
  assert(overlap,`${label}: actual simultaneous overlap confirmed by PostgreSQL blocking PIDs`);
  assert(ra.code===0,`${label}: session A succeeded`);
  if(errorPrefix) assert(rb.code!==0&&rb.err.includes(errorPrefix),`${label}: session B rejected with ${errorPrefix}`);
  else {assert(rb.code===0,`${label}: session B succeeded`);assert(lastUuid(ra.out)===lastUuid(rb.out),`${label}: both sessions returned the same order`);}
}
(async()=>{
 let originalClock,baseline;
 try {
  await checked(`DO $$ BEGIN IF inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet OR inet_server_port()<>5543 OR current_database()<>'sbl_pickup_test' THEN RAISE EXCEPTION 'LOCAL_TEST_CLUSTER_REQUIRED'; END IF; END $$;`);
  const countsSQL=`SELECT jsonb_build_object('users',(SELECT count(*) FROM auth.users),'products',(SELECT count(*) FROM public.products),'orders',(SELECT count(*) FROM public.orders),'items',(SELECT count(*) FROM public.order_items),'bonus_accounts',(SELECT count(*) FROM public.bonus_accounts),'bonus_transactions',(SELECT count(*) FROM public.bonus_transactions),'reward_progress',(SELECT count(*) FROM public.reward_progress),'reward_entitlements',(SELECT count(*) FROM public.reward_entitlements),'staff',(SELECT count(*) FROM public.staff));`;
  baseline=await checked(countsSQL);
  originalClock=await checked(`SELECT pg_get_functiondef('public.pickup_order_clock()'::regprocedure);`);
  await checked(`CREATE OR REPLACE FUNCTION public.pickup_order_clock() RETURNS timestamptz LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT '2026-10-29T05:00:00Z'::timestamptz; $$;
   INSERT INTO auth.users(id) VALUES(${literal(u1)}),(${literal(u2)}),(${literal(u3)}),(${literal(staff)});
   INSERT INTO public.staff(user_id) VALUES(${literal(staff)});
   INSERT INTO public.products(id,sbis_id,name,category,menu_category,price,is_visible,is_available,is_modifier)
   VALUES(${literal(base)},-2140000201,'concurrent base','fixture','Напитки',100,true,true,false),(${literal(mod)},-2140000202,'concurrent modifier','fixture',NULL,10,false,true,true);
   INSERT INTO public.bonus_accounts(customer_id,balance) VALUES(${literal(u1)},30),(${literal(u2)},30),(${literal(u3)},0);`);
  await overlapPair('same_key',u1,checkout(u1,keys[0],20),u1,checkout(u1,keys[0],20));
  assert((await checked(`SELECT count(*)=1 FROM public.orders WHERE customer_id=${literal(u1)};`))==='t','same_key: exactly one order');
  assert((await checked(`SELECT balance=10 AND debt=0 FROM public.bonus_accounts WHERE customer_id=${literal(u1)};`))==='t','same_key: exact remaining balance 10 and no debt');
  assert((await checked(`SELECT count(*)=1 AND sum(amount)=20 FROM public.bonus_transactions WHERE customer_id=${literal(u1)} AND type='redeem';`))==='t','same_key: one exact 20 point journal entry');
  assert((await checked(`SELECT count(*)=1 AND sum(i.quantity)=1 AND sum(i.price)=120 FROM public.order_items i JOIN public.orders o ON o.id=i.order_id WHERE o.customer_id=${literal(u1)};`))==='t','same_key: one authoritative modifier line snapshot');
  await overlapPair('overspend',u2,checkout(u2,keys[1],20),u2,checkout(u2,keys[2],20),'BONUS_BALANCE_CHANGED:');
  assert((await checked(`SELECT count(*)=1 FROM public.orders WHERE customer_id=${literal(u2)};`))==='t','overspend: losing request left no partial order');
  assert((await checked(`SELECT balance=10 AND debt=0 FROM public.bonus_accounts WHERE customer_id=${literal(u2)};`))==='t','overspend: exact remaining balance 10');
  const created=await checked(`BEGIN; ${claims(u3)} ${checkout(u3,keys[3],0)} COMMIT;`);
  const completedId=lastUuid(created);
  await checked(`BEGIN; ${claims(staff)} SELECT id FROM public.update_order_status(${literal(completedId)},'preparing'); SELECT id FROM public.update_order_status(${literal(completedId)},'ready'); COMMIT;`);
  const finish=`SELECT id FROM public.update_order_status(${literal(completedId)},'completed',true,false);`;
  await overlapPair('completion',staff,finish,staff,finish);
  assert((await checked(`SELECT count(*)=1 AND sum(amount)=6 FROM public.bonus_transactions WHERE customer_id=${literal(u3)} AND type='earn';`))==='t','completion: one exact earning journal despite competing handover');
  assert((await checked(`SELECT balance=6 AND lifetime_paid=120 FROM public.bonus_accounts WHERE customer_id=${literal(u3)};`))==='t','completion: exact balance and paid lifetime');
  assert((await checked(`SELECT paid_at IS NOT NULL FROM public.orders WHERE id=${literal(completedId)};`))==='t','completion: payment confirmation persisted');
  await cleanup();
  assert((await checked(countsSQL))===baseline,'cleanup: every fixture row count restored');
 } finally {
  if(originalClock) {
   try { await cleanup(); }
   finally { await checked(originalClock); }
  }
 }
 fs.writeFileSync(path.join(__dirname,'concurrency-results.json'),JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
 console.log(JSON.stringify(results,null,2));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
