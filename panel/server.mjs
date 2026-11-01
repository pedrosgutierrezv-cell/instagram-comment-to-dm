import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {configuration,verifyPassword,equal,RateLimit,Sessions,clientIP} from './security.mjs';
import {control,upstreamClient,PublicError} from './service.mjs';
const files=new Map([['/',['index.html','text/html; charset=utf-8']],['/app.js',['app.js','text/javascript; charset=utf-8']],['/style.css',['style.css','text/css; charset=utf-8']]]);
async function body(req){if(!/^application\/json(?:\s*;.*)?$/.test(req.headers['content-type']||''))throw new PublicError('Se requiere JSON.',415);if(req.headers['content-encoding'])throw new PublicError('Codificación no admitida.',415);if(Number(req.headers['content-length']||0)>16384)throw new PublicError('Solicitud demasiado grande.',413);const buffers=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)throw new PublicError('Solicitud demasiado grande.',413);buffers.push(chunk);}try{return JSON.parse(Buffer.concat(buffers).toString('utf8'));}catch{throw new PublicError('JSON no válido.');}}
function cookie(req,name){const all=String(req.headers.cookie||'').split(';').map(s=>s.trim());const matches=all.filter(s=>s.startsWith(name+'='));return matches.length===1?matches[0].slice(name.length+1):'';}
export function makeServer(config,{upstream=upstreamClient(config),sessions=new Sessions()}={}){
 const loginIP=new RateLimit(5,900000),loginGlobal=new RateLimit(30,60000),apiLimit=new RateLimit(120,60000);let logins=0;
 const name=config.secure?'__Host-ctdm':'ctdm-local';
 const sessionCookie=(id,max=28800)=>`${name}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${max}${config.secure?'; Secure':''}`;
 const server=http.createServer({maxHeaderSize:8192,requestTimeout:15000,headersTimeout:10000,keepAliveTimeout:5000},async(req,res)=>{
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'"};
  if(config.secure)headers['Strict-Transport-Security']='max-age=31536000';
  for(const [k,v] of Object.entries(headers))res.setHeader(k,v);
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  try{
   if(req.headers.host!==new URL(config.origin).host)throw new PublicError('Host no autorizado.',421);
   const url=new URL(req.url,config.origin),path=url.pathname;
   if(url.search)throw new PublicError('Ruta no válida.',404);
   if(req.method==='GET'&&path==='/healthz')return send(200,{ok:true});
   if(files.has(path)&&req.method==='GET'){const [file,type]=files.get(path);const bytes=await readFile(new URL('./public/'+file,import.meta.url));res.writeHead(200,{'Content-Type':type});return res.end(bytes);}
   if(!path.startsWith('/api/'))throw new PublicError('No encontrado.',404);
   const id=cookie(req,name),session=sessions.get(id);
   if(req.method==='GET'&&path==='/api/session')return send(200,session?{ok:true,authenticated:true,csrf:session.csrf,account:config.account}:{ok:true,authenticated:false});
   if(req.method!=='POST')throw new PublicError('Método no permitido.',405);
   if(req.headers.origin!==config.origin||req.headers['sec-fetch-site']==='cross-site')throw new PublicError('Origen no autorizado.',403);
   if(path==='/api/login'){
    if(!loginIP.take(clientIP(req,config.proxies))||!loginGlobal.take('all')||logins>=2)throw new PublicError('Demasiados intentos. Espera antes de volver a intentar.',429);
    const data=await body(req);if(!data||typeof data.username!=='string'||typeof data.password!=='string'||data.password.length>512)throw new PublicError('Credenciales no válidas.',401);
    logins++;let valid;try{valid=await verifyPassword(data.password,config.passwordHash);}finally{logins--;}
    if(!valid||!equal(data.username,config.user))throw new PublicError('Credenciales no válidas.',401);
    sessions.remove(id);const created=sessions.create();res.setHeader('Set-Cookie',sessionCookie(created.id));return send(200,{ok:true,authenticated:true,csrf:created.csrf,account:config.account});
   }
   if(!session)throw new PublicError('Inicia sesión para continuar.',401);
   if(!equal(req.headers['x-csrf-token']||'',session.csrf))throw new PublicError('La verificación de sesión falló.',403);
   if(!apiLimit.take(id))throw new PublicError('Demasiadas solicitudes.',429);
   if(path==='/api/logout'){sessions.remove(id);res.setHeader('Set-Cookie',sessionCookie('',0));return send(200,{ok:true});}
   if(path!=='/api/control')throw new PublicError('No encontrado.',404);
   const data=await body(req);if(!data||typeof data.action!=='string')throw new PublicError('Datos no válidos.');
   return send(200,await control(data.action,data.data,upstream));
  }catch(error){if(!res.headersSent)send(error instanceof PublicError?error.status:500,{ok:false,error:error instanceof PublicError?error.message:'Error interno. Revisa el servicio sin compartir sus credenciales.'});else res.end();}
 });
 server.maxConnections=100;return server;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){try{const config=configuration();makeServer(config).listen(config.port,config.host,()=>console.log('Panel iniciado. Usa el origen configurado.'));}catch{console.error('Configuración no válida. Ejecuta npm run setup y npm run doctor.');process.exitCode=1;}}
