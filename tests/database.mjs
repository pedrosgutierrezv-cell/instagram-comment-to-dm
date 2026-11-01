// Creates its own local PostgreSQL cluster. Deliberately never reads DATABASE_URL or .env.
import EmbeddedPostgres from 'embedded-postgres';
import {mkdtemp,rm,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import net from 'node:net';import {once} from 'node:events';
import {randomBytes,createHmac} from 'node:crypto';import assert from 'node:assert/strict';
const temp=await mkdtemp(join(tmpdir(),'ctdm-postgres-test-'));const free=net.createServer();free.listen(0,'127.0.0.1');await once(free,'listening');const port=free.address().port;await new Promise(r=>free.close(r));
const pg=new EmbeddedPostgres({databaseDir:join(temp,'database'),user:'lab_admin',password:randomBytes(24).toString('hex'),port,persistent:true,authMethod:'scram-sha-256',autoRehydrateSymlinks:true,postgresFlags:['-h','127.0.0.1','-c','shared_buffers=32MB','-c','max_connections=20'],onLog:()=>{},onError:()=>{}});
let client;let checks=0;const check=(actual,expected)=>{assert.deepEqual(actual,expected,'database check '+checks);checks++;};
try{
 await pg.initialise();await pg.start();client=pg.getPgClient();await client.connect();
 await client.query('create role anon; create role authenticated; create role service_role bypassrls;');
 const dir=new URL('../supabase/migrations/',import.meta.url);const files=(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort();for(const file of files)await client.query(await readFile(new URL(file,dir),'utf8'));
 const rpc=async(name,args=[],types=[])=>{const params=args.map((_,i)=>'$'+(i+1)+(types[i]?'::'+types[i]:''));const r=await client.query(`select public.ig_delivery_${name}(${params.join(',')}) as result`,args);return r.rows[0]?.result;};
 // ACL tests cover each exported function, not just the HTTP panel.
 const acl=await client.query("select p.oid::regprocedure::text as f,has_function_privilege('anon',p.oid,'execute') as a,has_function_privilege('authenticated',p.oid,'execute') as u,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ig_delivery_%'");
 assert.ok(acl.rows.length>=8);for(const row of acl.rows){check(row.a,false);check(row.u,false);check(row.prosecdef,false);}
 const rls=await client.query("select relname,relrowsecurity from pg_class where relname in ('ig_delivery_campaigns','ig_delivery_jobs','ig_delivery_comment_replies')");for(const row of rls.rows)check(row.relrowsecurity,true);
 await client.query('set role anon');await assert.rejects(()=>client.query('select * from public.ig_delivery_campaigns'));await client.query('reset role');checks++;
 await client.query('set role authenticated');await assert.rejects(()=>client.query("select public.ig_delivery_admin('list','{}')"));await client.query('reset role');checks++;
 await client.query('set role service_role');
 check((await rpc('admin',['list',{}]))?.status,503);
 const owner='999999999990001',media='999999999990002',appSecret=randomBytes(32).toString('hex'),verify=randomBytes(32).toString('hex');
 await rpc('configure',[owner,appSecret,verify]);check((await rpc('verify',['subscribe',verify,'123456']))?.code,200);check((await rpc('verify',['subscribe','wrong','123']))?.code,403);
 const data={display_name:'Ejemplo de laboratorio',keyword:'gUíA',message:'https://example.com/recurso',media_id:media,post_url:'https://www.instagram.com/reel/LabExample/',enabled:true,public_reply_enabled:true,public_reply_messages:['Uno','Dos','Tres']};
 const created=await rpc('admin',['save',data]);check(created.ok,true);const id=created.id;
 const list=await rpc('admin',['list',{}]);check(list.campaigns.length,1);check(list.campaigns[0].keyword,'guia');
 check((await rpc('admin',['save',data])).status,409);
 const original=list.campaigns[0];const update={...data,id,updated_at:original.updated_at,display_name:'<img src=x onerror=alert(1)>'};check((await rpc('admin',['save',update])).ok,true);check((await rpc('admin',['save',update])).status,409);
 const current=(await rpc('admin',['list',{}])).campaigns[0];check((await rpc('admin',['save',{...update,updated_at:current.updated_at,keyword:'.*'}])).status,400);
 check((await rpc('admin',['save',{...update,updated_at:current.updated_at,message:''}])).status,400);
 check((await rpc('admin',['save',{...update,updated_at:current.updated_at,media_id:'12345'}])).status,400);
 check((await rpc('admin',['toggle',{id:'other-account',updated_at:current.updated_at,enabled:true}])).status,404);
 await assert.rejects(()=>rpc('configure',['999999999991111',appSecret,verify]));checks++;
 const send=async(text,person,post=media,time=Math.ceil(Date.now()/1000),signature=true)=>{const b=Buffer.from(JSON.stringify({object:'instagram',entry:[{id:owner,time,changes:[{field:'comments',value:{id:'comment-'+person,text,from:{id:person,username:'example'},media:{id:post}}}]}]}));const sig='sha256='+createHmac('sha256',appSecret).update(b).digest('hex');return rpc('ingest',[b.toString('base64'),signature?sig:'sha256='+'0'.repeat(64)]);};
 check((await send('Quiero la GuÍa 🙌','person1')).queued,1);check((await send('GUIA','person1')).queued,0);check((await send('guiado','person2')).queued,0);check((await send('gUiA','person3')).queued,1);check((await send('guia','person4','different-post')).queued,0);check((await send('guia','person5',media,Math.floor(Date.now()/1000)-8*86400)).queued,0);check((await send('guia','person6',media,Math.floor(Date.now()/1000),false)).code,403);check((await send('guia',owner)).queued,0);
 const job=(await client.query('select * from public.ig_delivery_claim()')).rows[0];assert.ok(job.job_id);checks++;
 check((await rpc('finish',[job.job_id,randomBytes(16).toString('hex'),'sent','fake-message-id'],['uuid','uuid']))?.updated,0);
 check((await rpc('finish',[job.job_id,job.claim_token,'sent','fake-message-id']))?.reply_queued,1);check((await rpc('finish',[job.job_id,job.claim_token,'sent','fake-message-id']))?.updated,0);
 const reply=(await client.query('select * from public.ig_delivery_reply_claim()')).rows[0];check(reply.variant,0);check(reply.reply_text,'Uno');check((await rpc('reply_finish',[reply.reply_job_id,reply.reply_claim_token,'sent','fake-public-reply']))?.updated,1);
 const job2=(await client.query('select * from public.ig_delivery_claim()')).rows[0];check((await rpc('finish',[job2.job_id,job2.claim_token,'sent','fake-message-two']))?.reply_queued,1);const reply2=(await client.query('select * from public.ig_delivery_reply_claim()')).rows[0];check(reply2.variant,1);
 check((await send('guia','person7')).queued,1);const job3=(await client.query('select * from public.ig_delivery_claim()')).rows[0];await rpc('finish',[job3.job_id,job3.claim_token,'sent','fake-three']);const reply3=(await client.query('select * from public.ig_delivery_reply_claim()')).rows[0];check(reply3.variant,2);
 check((await send('guia','person8')).queued,1);const j4=(await client.query('select * from public.ig_delivery_claim()')).rows[0];await rpc('finish',[j4.job_id,j4.claim_token,'sent','fake-four']);check((await client.query('select * from public.ig_delivery_reply_claim()')).rows[0].variant,0);
 const latest=(await rpc('admin',['list',{}])).campaigns[0];check((await rpc('admin',['toggle',{id,updated_at:latest.updated_at,enabled:false}])).ok,true);check((await send('guia','person9')).queued,0);
 console.log(JSON.stringify({passed:true,checks,database:'PostgreSQL 17.11 local embedded',productionConnections:0,realMessages:0}));
}catch(e){console.error('Isolated database test failed:',e.message);process.exitCode=1;}finally{if(client)await client.end().catch(()=>{});await pg.stop().catch(()=>{});await rm(temp,{recursive:true,force:true});}
