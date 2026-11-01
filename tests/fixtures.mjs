import {hashPassword} from '../panel/security.mjs';
export const password='synthetic-test-password-do-not-use';
export const hash=await hashPassword(password);
export const config={origin:'https://panel.example.test',secure:true,upstream:'https://n8n.example.test/webhook/comment-to-dm-admin',key:'1'.repeat(64),user:'admin',passwordHash:hash,host:'127.0.0.1',port:3000,proxies:[],account:'example_creator'};
export const form={display_name:'Recurso de ejemplo',keyword:'gUíA',message:'Aquí tienes el documento: https://example.com/guia',post_url:'https://www.instagram.com/p/Example_123/',enabled:false,public_reply_enabled:true,public_reply_messages:['Uno','Dos','Tres']};
export const campaign={...form,id:'example-campaign',media_id:'999999999990001',updated_at:'2026-01-01T00:00:00Z',sent:0,pending:0,errors:0,reply_errors:0,replies_sent:0};
export function fakeUpstream(){const calls=[];const send=async(action,data)=>{calls.push({action,data});if(action==='list')return {ok:true,campaigns:[campaign]};if(action==='media')return {ok:true,media:[{id:campaign.media_id,permalink:form.post_url,caption:'Publicación sintética'}]};return {ok:true,id:campaign.id};};return {calls,send};}
