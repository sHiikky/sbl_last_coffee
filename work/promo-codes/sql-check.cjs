// Disposable loopback PostgreSQL only. Never reads cloud credentials.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'../..'),psql='C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe';
const database='sbl_promo_test_'+Date.now();
function sql(query,db=database){return cp.execFileSync(psql,['-h','127.0.0.1','-p','5543','-U','postgres','-d',db,'-X','-v','ON_ERROR_STOP=1','-P','pager=off'],{input:query,encoding:'utf8',maxBuffer:8*1024*1024});}
try{
 sql(`CREATE DATABASE ${database};`,'postgres');
 sql(fs.readFileSync(path.join(root,'work/pickup-checkout/bootstrap-local.sql'),'utf8'));
 // Storage HTTP is not emulated. These tables/functions test the actual RLS SQL.
 sql(`CREATE SCHEMA storage;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text REFERENCES storage.buckets(id),name text,UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
 GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;
 GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;`);
 for(const file of fs.readdirSync(path.join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()){
  const source=fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8');
  sql(file.includes('remote_schema')?'BEGIN;\n'+source+'\nCOMMIT;':source);
 }
 const result=sql(fs.readFileSync(path.join(__dirname,'behavior-rollback.sql'),'utf8'));
 const verification=sql(fs.readFileSync(path.join(__dirname,'verify-deployment.sql'),'utf8'));
 if(/FAIL/.test(verification))throw Error(verification);
 console.log(verification);
 console.log(result);
 console.log(`PASS: real PostgreSQL migrations and promo behavior (${database}, localhost:5543). Fixture writes rolled back.`);
}catch(error){console.error(error.stdout?.toString()||'',error.stderr?.toString()||error.message);process.exitCode=1;}
