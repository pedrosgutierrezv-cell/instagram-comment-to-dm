import {randomBytes,scrypt as scryptCallback,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {isIP} from 'node:net';
const scrypt=promisify(scryptCallback);
export const token=()=>randomBytes(32).toString('base64url');
export const digest=s=>createHash('sha256').update(s).digest('hex');
export function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y);}
export async function hashPassword(password){if(typeof password!=='string'||password.length<16||password.length>512)throw new Error('Usa una contraseña de 16 a 512 caracteres.');const salt=randomBytes(16).toString('hex');const key=await scrypt(password,salt,64,{N:131072,r:8,p:1,maxmem:256*1024*1024});return `scrypt$131072$8$1$${salt}$${key.toString('hex')}`;}
export function validHash(value){return /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(value||'');}
export async function verifyPassword(password,hash){if(typeof password!=='string'||password.length>512||!validHash(hash))return false;const [,n,r,p,salt,key]=hash.split('$');const actual=await scrypt(password,salt,64,{N:+n,r:+r,p:+p,maxmem:256*1024*1024});return timingSafeEqual(actual,Buffer.from(key,'hex'));}
export class RateLimit{
 constructor(max=5,windowMs=900000){this.max=max;this.windowMs=windowMs;this.values=new Map();}
 take(key,now=Date.now()){for(const [k,v] of this.values)if(v.expires<=now)this.values.delete(k);let value=this.values.get(key);if(!value){if(this.values.size>=10000)return false;value={count:0,expires:now+this.windowMs};this.values.set(key,value);}return ++value.count<=this.max;}
}
export class Sessions{
 constructor({idleMs=1800000,maxMs=28800000}={}){this.values=new Map();this.idleMs=idleMs;this.maxMs=maxMs;}
 prune(now=Date.now()){for(const [k,s] of this.values)if(s.expires<=now||s.last+this.idleMs<=now)this.values.delete(k);}
 create(now=Date.now()){this.prune(now);if(this.values.size>=50)this.values.delete(this.values.keys().next().value);const id=token(),s={csrf:token(),expires:now+this.maxMs,last:now};this.values.set(digest(id),s);return {id,...s};}
 get(id,now=Date.now()){if(typeof id!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(id))return null;this.prune(now);const s=this.values.get(digest(id));if(s)s.last=now;return s||null;}
 remove(id){if(typeof id==='string')this.values.delete(digest(id));}
}
export function clientIP(req,proxies=[]){const peer=req.socket.remoteAddress||'unknown';if(proxies.includes(peer)){const forwarded=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();if(isIP(forwarded))return forwarded;}return peer;}
export function safeHttps(value,name){let u;try{u=new URL(value);}catch{throw new Error(`${name}: URL no válida.`);}if(u.protocol!=='https:'||u.username||u.password||u.hash||u.search)throw new Error(`${name}: requiere HTTPS sin credenciales ni parámetros.`);return u;}
export function configuration(env=process.env){const origin=new URL(env.APP_ORIGIN||'http://127.0.0.1:3000');const local=['localhost','127.0.0.1','[::1]'].includes(origin.hostname);const development=env.NODE_ENV==='development';if(origin.origin!==env.APP_ORIGIN||(!development&&origin.protocol!=='https:')||(development&&origin.protocol!=='https:'&&!local))throw new Error('APP_ORIGIN debe ser un origen HTTPS; HTTP solo para desarrollo local explícito.');if(!validHash(env.ADMIN_PASSWORD_HASH))throw new Error('Configura ADMIN_PASSWORD_HASH con npm run setup.');if(!/^[A-Za-z0-9_.@-]{1,100}$/.test(env.ADMIN_USERNAME||'admin'))throw new Error('ADMIN_USERNAME no válido.');const upstream=safeHttps(env.IG_ADMIN_URL,'IG_ADMIN_URL');if(!/^[a-f0-9]{64}$/.test(env.IG_ADMIN_KEY||''))throw new Error('IG_ADMIN_KEY no válido.');const port=Number(env.PORT||3000);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT no válido.');const proxies=(env.TRUSTED_PROXIES||'').split(',').map(s=>s.trim()).filter(Boolean);if(proxies.some(p=>!isIP(p)))throw new Error('TRUSTED_PROXIES debe contener IP explícitas.');return {origin:origin.origin,secure:origin.protocol==='https:',upstream:upstream.href,key:env.IG_ADMIN_KEY,user:env.ADMIN_USERNAME||'admin',passwordHash:env.ADMIN_PASSWORD_HASH,host:env.HOST||'127.0.0.1',port,proxies,account:env.INSTAGRAM_USERNAME||'Tu cuenta de Instagram'};}
