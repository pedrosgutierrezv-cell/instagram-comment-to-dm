import {createInterface} from 'node:readline/promises';
import {Writable} from 'node:stream';
import {writeFile,chmod,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {hashPassword,token,configuration,safeHttps} from '../panel/security.mjs';
export async function saveConfig(values,path='.env'){
 configuration(values);if(!/^[0-9]{5,30}$/.test(values.IG_OWNER_ID||''))throw new Error('IG_OWNER_ID no válido.');if(!/^v[0-9]+[.][0-9]+$/.test(values.GRAPH_VERSION||''))throw new Error('GRAPH_VERSION no válida.');
 for(const key of ['N8N_URL','SUPABASE_URL'])safeHttps(values[key],key);
 for(const key of ['N8N_API_KEY','SUPABASE_SERVICE_ROLE_KEY','META_ACCESS_TOKEN','META_APP_SECRET','META_VERIFY_TOKEN'])if(typeof values[key]!=='string'||values[key].length<(key==='META_APP_SECRET'?16:32)||/[\r\n\0]/.test(values[key]))throw new Error(`${key}: valor no válido.`);
 for(const [k,v] of Object.entries(values))if(!/^[A-Z][A-Z0-9_]*$/.test(k)||typeof v!=='string'||/[\r\n\0']/.test(v))throw new Error('Unsupported configuration character');
 await writeFile(path,Object.entries(values).map(([k,v])=>`${k}='${v}'`).join('\n')+'\n',{mode:0o600,flag:'wx'});await chmod(path,0o600);
}
async function main(){if(!process.stdin.isTTY)throw new Error('Usa una terminal interactiva.');try{await stat('.env');throw new Error('Ya existe .env.');}catch(e){if(e.code!=='ENOENT')throw e;}
 let muted=false;const output=new Writable({write(chunk,enc,done){if(!muted)process.stdout.write(chunk);done();}});const rl=createInterface({input:process.stdin,output,terminal:true});
 const ask=async(label,secret=false)=>{const p=rl.question(label+': ');if(secret)muted=true;try{return (await p).trim();}finally{muted=false;if(secret)process.stdout.write('\n');}};
 try{console.log('Configuración local. Los secretos se ocultan y se guardan solo en .env (0600).');const v={NODE_ENV:'production',HOST:'127.0.0.1',PORT:'3000',TRUSTED_PROXIES:''};v.APP_ORIGIN=await ask('Origen HTTPS del panel');v.ADMIN_USERNAME=(await ask('Administrador [admin]'))||'admin';const p=await ask('Contraseña nueva (mínimo 16 caracteres)',true);if(p!==await ask('Repite la contraseña',true))throw new Error('Contraseñas diferentes.');v.ADMIN_PASSWORD_HASH=await hashPassword(p);v.INSTAGRAM_USERNAME=await ask('Usuario Instagram');v.IG_OWNER_ID=await ask('ID numérico de la cuenta profesional');v.GRAPH_VERSION=(await ask('Versión Graph [v25.0]'))||'v25.0';v.N8N_URL=(await ask('URL HTTPS de n8n')).replace(/\/$/,'');v.IG_ADMIN_URL=v.N8N_URL+'/webhook/comment-to-dm-admin';v.SUPABASE_URL=(await ask('URL HTTPS Supabase')).replace(/\/$/,'');for(const [key,label]of [['N8N_API_KEY','Clave API n8n'],['SUPABASE_SERVICE_ROLE_KEY','Clave service_role Supabase'],['META_ACCESS_TOKEN','Token Instagram'],['META_APP_SECRET','Secreto app Meta']])v[key]=await ask(label,true);v.IG_ADMIN_KEY=Buffer.from(token(),'base64url').toString('hex');v.META_VERIFY_TOKEN=Buffer.from(token(),'base64url').toString('hex');await saveConfig(v);console.log('Configuración guardada. Sigue docs/INSTALL.md; no se activaron campañas.');}finally{rl.close();}}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(()=>{console.error('No se guardó la configuración: revisa los requisitos, la existencia de .env y vuelve a ejecutar el asistente.');process.exitCode=1;});
