begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to service_role;
-- Dedicated Instagram automation objects; install once in a fresh database namespace.
create schema ig_delivery_private;
revoke all on schema ig_delivery_private from public, anon, authenticated;
grant usage on schema ig_delivery_private to service_role;
create table ig_delivery_private.secrets (
  singleton boolean primary key default true check(singleton),
  owner_id text,
  app_secret text,
  verify_token_hash text
);
alter table ig_delivery_private.secrets enable row level security;
revoke all on ig_delivery_private.secrets from public, anon, authenticated;
grant select,insert,update on ig_delivery_private.secrets to service_role;
insert into ig_delivery_private.secrets(singleton) values(true);

create table public.ig_delivery_campaigns (
  id text primary key,
  enabled boolean not null default false,
  mode text not null default 'simulation' check(mode in ('simulation','live')),
  audience text not null default 'test' check(audience in ('test','post')),
  accept_from timestamptz not null default '-infinity',
  owner_id text,
  media_id text,
  post_url text not null,
  keyword text not null default 'guia' check(keyword='guia'),
  message text not null check(length(message) between 1 and 1000),
  allowed_recipient_id text,
  allowed_username text not null default '',
  created_at timestamptz not null default now(),
  check(not enabled or (owner_id is not null and media_id is not null)),
  check(mode <> 'live' or audience='post' or allowed_recipient_id is not null)
);
create table public.ig_delivery_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.ig_delivery_campaigns(id),
  comment_id text not null,
  recipient_id text not null,
  status text not null default 'pending' check(status in ('pending','processing','simulated','sent','failed','uncertain')),
  received_at timestamptz not null default now(),
  event_at timestamptz not null,
  claimed_at timestamptz,
  claim_token uuid,
  finished_at timestamptz,
  meta_message_id text,
  error_code text,
  unique(campaign_id,comment_id),
  unique(campaign_id,recipient_id)
);
create index ig_delivery_jobs_pending on public.ig_delivery_jobs(received_at) where status='pending';
alter table public.ig_delivery_campaigns enable row level security;
alter table public.ig_delivery_jobs enable row level security;
revoke all on public.ig_delivery_campaigns,public.ig_delivery_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.ig_delivery_campaigns,public.ig_delivery_jobs to service_role;

create function public.ig_delivery_verify(p_mode text,p_token text,p_challenge text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare expected text;
begin
 select verify_token_hash into expected from ig_delivery_private.secrets where singleton;
 if expected is not null and p_mode='subscribe' and length(p_challenge) between 1 and 256
 and encode(extensions.digest(convert_to(p_token,'UTF8'),'sha256'),'hex')=expected then
   return jsonb_build_object('code',200,'body',p_challenge);
 end if;
 return jsonb_build_object('code',403,'body','Forbidden');
end; $$;

create function public.ig_delivery_claim()
returns table(job_id uuid,claim_token uuid,mode text,owner_id text,comment_id text,message text)
language plpgsql security invoker set search_path='' as $$
begin
 update public.ig_delivery_jobs set status='uncertain',error_code='STALE_CLAIM',finished_at=now()
 where status='processing' and claimed_at<now()-interval '10 minutes';
 update public.ig_delivery_jobs set status='failed',error_code='EXPIRED',finished_at=now()
 where status='pending' and event_at<now()-interval '6 days 23 hours';
 return query
 with next as (
   select j.id from public.ig_delivery_jobs j join public.ig_delivery_campaigns c on c.id=j.campaign_id
   where j.status='pending' and c.enabled order by j.received_at
   for update of j skip locked limit 1
 ), claimed as (
   update public.ig_delivery_jobs j set status='processing',claimed_at=now(),claim_token=gen_random_uuid()
   from next where j.id=next.id returning j.*
 ) select j.id,j.claim_token,c.mode,c.owner_id,j.comment_id,c.message
 from claimed j join public.ig_delivery_campaigns c on c.id=j.campaign_id;
end; $$;

create function public.ig_delivery_finish(p_job_id uuid,p_claim_token uuid,p_status text,p_message_id text default null,p_error_code text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_status not in ('simulated','sent','failed','uncertain') then raise exception 'Invalid status'; end if;
 if p_status='sent' and nullif(p_message_id,'') is null then raise exception 'Missing message ID'; end if;
 update public.ig_delivery_jobs set status=p_status,finished_at=now(),meta_message_id=p_message_id,error_code=left(p_error_code,200)
 where id=p_job_id and claim_token=p_claim_token and status='processing';
 get diagnostics n=row_count;
 return jsonb_build_object('updated',n);
end; $$;

revoke all on function public.ig_delivery_verify(text,text,text),public.ig_delivery_claim(),public.ig_delivery_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.ig_delivery_verify(text,text,text),public.ig_delivery_claim(),public.ig_delivery_finish(uuid,uuid,text,text,text) to service_role;

-- Applied separately as ig_delivery_secret_setup; included here for reproducibility.
create function public.ig_delivery_configure(p_app_secret text,p_verify_token text)
returns void language sql security invoker set search_path='' as $$
 update ig_delivery_private.secrets set app_secret=nullif(p_app_secret,''),
 verify_token_hash=case when nullif(p_verify_token,'') is null then null
 else encode(extensions.digest(convert_to(p_verify_token,'UTF8'),'sha256'),'hex') end where singleton;
$$;
revoke all on function public.ig_delivery_configure(text,text) from public,anon,authenticated;
grant execute on function public.ig_delivery_configure(text,text) to service_role;

alter table public.ig_delivery_campaigns
 add column public_reply_enabled boolean not null default false,
 add column public_reply_next integer not null default 0 check(public_reply_next between 0 and 2),
 add column public_reply_messages text[] not null default array[
   '¡Ya te envié el recurso por DM! 🙌',
   '¡Enviado a tu inbox! 📩',
   '¡Listo! 🙌 Revisa también tus solicitudes de mensajes.'
 ] check(cardinality(public_reply_messages)=3 and array_position(public_reply_messages,null) is null);

create table public.ig_delivery_comment_replies (
 id uuid primary key default gen_random_uuid(),
 job_id uuid not null unique references public.ig_delivery_jobs(id),
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','uncertain')),
 variant integer check(variant between 0 and 2),
 reply_text text,
 created_at timestamptz not null default now(),
 claimed_at timestamptz,
 claim_token uuid,
 finished_at timestamptz,
 meta_reply_id text,
 error_code text
);
create index ig_delivery_comment_replies_pending on public.ig_delivery_comment_replies(created_at) where status='pending';
alter table public.ig_delivery_comment_replies enable row level security;
revoke all on public.ig_delivery_comment_replies from public,anon,authenticated;
grant select,insert,update,delete on public.ig_delivery_comment_replies to service_role;

create or replace function public.ig_delivery_finish(p_job_id uuid,p_claim_token uuid,p_status text,p_message_id text default null,p_error_code text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n integer; q integer:=0;
begin
 if p_status not in ('simulated','sent','failed','uncertain') then raise exception 'Invalid status'; end if;
 if p_status='sent' and nullif(p_message_id,'') is null then raise exception 'Missing message ID'; end if;
 update public.ig_delivery_jobs set status=p_status,finished_at=now(),meta_message_id=p_message_id,error_code=left(p_error_code,200)
 where id=p_job_id and claim_token=p_claim_token and status='processing';
 get diagnostics n=row_count;
 if n=1 and p_status='sent' then
   insert into public.ig_delivery_comment_replies(job_id)
   select j.id from public.ig_delivery_jobs j join public.ig_delivery_campaigns c on c.id=j.campaign_id
   where j.id=p_job_id and c.enabled and c.mode='live' and c.public_reply_enabled
   on conflict(job_id) do nothing;
   get diagnostics q=row_count;
 end if;
 return jsonb_build_object('updated',n,'reply_queued',q);
end; $$;

create function public.ig_delivery_reply_claim()
returns table(reply_job_id uuid,reply_claim_token uuid,comment_id text,reply_text text,variant integer)
language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_campaign text; v_comment text; v_variant integer; v_text text; v_token uuid;
begin
 update public.ig_delivery_comment_replies set status='uncertain',error_code='STALE_CLAIM',finished_at=now()
 where status='processing' and claimed_at<now()-interval '10 minutes';
 select r.id,j.campaign_id,j.comment_id into v_id,v_campaign,v_comment
 from public.ig_delivery_comment_replies r
 join public.ig_delivery_jobs j on j.id=r.job_id
 join public.ig_delivery_campaigns c on c.id=j.campaign_id
 where r.status='pending' and j.status='sent' and j.event_at>now()-interval '6 days 23 hours' and c.enabled and c.mode='live' and c.public_reply_enabled
 order by r.created_at,r.id for update of r skip locked limit 1;
 if v_id is null then return; end if;
 select c.public_reply_next,c.public_reply_messages[c.public_reply_next+1] into v_variant,v_text
 from public.ig_delivery_campaigns c
 where c.id=v_campaign and c.enabled and c.mode='live' and c.public_reply_enabled
 for update;
 if v_text is null then return; end if;
 update public.ig_delivery_campaigns set public_reply_next=(v_variant+1)%3 where id=v_campaign;
 v_token:=gen_random_uuid();
 update public.ig_delivery_comment_replies r set status='processing',claimed_at=now(),claim_token=v_token,
   variant=v_variant,reply_text=v_text where r.id=v_id;
 return query select v_id,v_token,v_comment,v_text,v_variant;
end; $$;

create function public.ig_delivery_reply_finish(p_reply_job_id uuid,p_claim_token uuid,p_status text,p_reply_id text default null,p_error_code text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 if p_status not in ('sent','failed','uncertain') then raise exception 'Invalid status'; end if;
 if p_status='sent' and nullif(p_reply_id,'') is null then raise exception 'Missing reply ID'; end if;
 update public.ig_delivery_comment_replies set status=p_status,finished_at=now(),meta_reply_id=p_reply_id,error_code=left(p_error_code,200)
 where id=p_reply_job_id and claim_token=p_claim_token and status='processing';
 get diagnostics n=row_count;
 return jsonb_build_object('updated',n);
end; $$;

revoke all on function public.ig_delivery_reply_claim(),public.ig_delivery_reply_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.ig_delivery_reply_claim(),public.ig_delivery_reply_finish(uuid,uuid,text,text,text) to service_role;

-- Only Instagram MVP objects; service-role-only control API.
alter table public.ig_delivery_campaigns drop constraint ig_delivery_campaigns_keyword_check;
alter table public.ig_delivery_campaigns add constraint ig_delivery_campaigns_keyword_check
 check(keyword ~ '^[a-z0-9_]{1,40}$');
alter table public.ig_delivery_campaigns add column display_name text not null default '';
alter table public.ig_delivery_campaigns add column updated_at timestamptz not null default now();
create unique index ig_delivery_campaigns_one_post on public.ig_delivery_campaigns(owner_id,media_id) where audience='post';

create function public.ig_delivery_admin(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_owner text; c public.ig_delivery_campaigns%rowtype; k text; replies text[]; result jsonb;
 mid text; url text; title text; msg text; requested_id text; version timestamptz;
begin
 select owner_id into v_owner from ig_delivery_private.secrets where singleton;
 if v_owner is null then return jsonb_build_object('ok',false,'status',503,'error','Configura la cuenta antes de continuar.'); end if;
 if p_action='list' then
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) into result from (
   select a.id,a.display_name,a.post_url,a.media_id,a.keyword,a.message,a.enabled,
    a.public_reply_enabled,a.public_reply_messages,a.public_reply_next,a.accept_from,a.updated_at,a.created_at,
    (select count(*) from public.ig_delivery_jobs j where j.campaign_id=a.id and status='sent') as sent,
    (select count(*) from public.ig_delivery_jobs j where j.campaign_id=a.id and status in ('pending','processing')) as pending,
    (select count(*) from public.ig_delivery_jobs j where j.campaign_id=a.id and status in ('failed','uncertain')) as errors,
    (select count(*) from public.ig_delivery_comment_replies r join public.ig_delivery_jobs j on j.id=r.job_id where j.campaign_id=a.id and r.status='sent') as replies_sent,
    (select count(*) from public.ig_delivery_comment_replies r join public.ig_delivery_jobs j on j.id=r.job_id where j.campaign_id=a.id and r.status in ('failed','uncertain')) as reply_errors
   from public.ig_delivery_campaigns a where a.owner_id=v_owner and a.audience='post'
  ) t;
  return jsonb_build_object('ok',true,'campaigns',result);
 end if;
 if p_action not in ('save','toggle') then
  return jsonb_build_object('ok',false,'status',400,'error','Acción no válida.');
 end if;
 requested_id:=nullif(p_data->>'id','');
 if requested_id is not null then
  select * into c from public.ig_delivery_campaigns where id=requested_id
   and owner_id=v_owner and audience='post' for update;
  if not found then return jsonb_build_object('ok',false,'status',404,'error','Automatización no encontrada.'); end if;
  if nullif(p_data->>'updated_at','')::timestamptz is distinct from c.updated_at then
   return jsonb_build_object('ok',false,'status',409,'error','La configuración cambió. Actualiza la página antes de guardar.');
  end if;
 end if;
 if p_action='toggle' then
  if requested_id is null or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then
   return jsonb_build_object('ok',false,'status',400,'error','Estado no válido.'); end if;
  update public.ig_delivery_campaigns set enabled=(p_data->>'enabled')::boolean,
   accept_from=case when not enabled and (p_data->>'enabled')::boolean then clock_timestamp() else accept_from end,
   updated_at=clock_timestamp() where id=requested_id;
  return jsonb_build_object('ok',true,'id',requested_id);
 end if;
 k:=translate(lower(trim(coalesce(p_data->>'keyword',''))),'áéíóúüñ','aeiouun');
 title:=trim(coalesce(p_data->>'display_name','')); msg:=trim(coalesce(p_data->>'message',''));
 mid:=p_data->>'media_id'; url:=p_data->>'post_url';
 if k !~ '^[a-z0-9_]{1,40}$' then return jsonb_build_object('ok',false,'status',400,'error','Escribe una sola palabra clave, sin espacios ni símbolos.'); end if;
 if length(title) not between 1 and 100 or length(msg) not between 1 and 1000 then
  return jsonb_build_object('ok',false,'status',400,'error','Revisa el nombre (1–100) y el mensaje privado (1–1000 caracteres).'); end if;
 if coalesce(mid,'') !~ '^[0-9]{5,30}$' or coalesce(url,'') !~ '^https://www[.]instagram[.]com/(p|reel)/[A-Za-z0-9_-]+/$' then
  return jsonb_build_object('ok',false,'status',400,'error','Primero verifica la publicación de tu cuenta.'); end if;
 if jsonb_typeof(p_data->'enabled') is distinct from 'boolean' or jsonb_typeof(p_data->'public_reply_enabled') is distinct from 'boolean' then
  return jsonb_build_object('ok',false,'status',400,'error','Estado no válido.'); end if;
 if jsonb_typeof(p_data->'public_reply_messages') is distinct from 'array' or jsonb_array_length(p_data->'public_reply_messages')<>3 then
  return jsonb_build_object('ok',false,'status',400,'error','Incluye tres respuestas públicas.'); end if;
 select array_agg(trim(value)) into replies from jsonb_array_elements_text(p_data->'public_reply_messages');
 if exists(select 1 from unnest(replies) r where r is null or length(r) not between 1 and 500) then
  return jsonb_build_object('ok',false,'status',400,'error','Cada respuesta debe tener entre 1 y 500 caracteres.'); end if;
 if requested_id is not null then
  if c.media_id<>mid then return jsonb_build_object('ok',false,'status',400,'error','Para otra publicación, crea una automatización nueva.'); end if;
  update public.ig_delivery_campaigns set display_name=title,keyword=k,message=msg,
   enabled=(p_data->>'enabled')::boolean,public_reply_enabled=(p_data->>'public_reply_enabled')::boolean,
   public_reply_messages=replies,updated_at=clock_timestamp(),
   accept_from=case when not enabled and (p_data->>'enabled')::boolean then clock_timestamp() else accept_from end
   where id=requested_id;
 else
  perform pg_advisory_xact_lock(hashtextextended('ig-panel-'||mid,0));
  if exists(select 1 from public.ig_delivery_campaigns where owner_id=v_owner and media_id=mid and audience='post') then
   return jsonb_build_object('ok',false,'status',409,'error','Esta publicación ya tiene una automatización. Edítala desde la lista.'); end if;
  requested_id:='panel-'||gen_random_uuid()::text;
  insert into public.ig_delivery_campaigns(id,display_name,keyword,message,owner_id,media_id,post_url,
   enabled,mode,audience,allowed_username,accept_from,public_reply_enabled,public_reply_messages)
  values(requested_id,title,k,msg,v_owner,mid,url,(p_data->>'enabled')::boolean,
   'live','post','',clock_timestamp(),(p_data->>'public_reply_enabled')::boolean,replies);
 end if;
 return jsonb_build_object('ok',true,'id',requested_id);
exception when invalid_datetime_format or invalid_text_representation then
 return jsonb_build_object('ok',false,'status',400,'error','Datos no válidos. Actualiza la página e inténtalo nuevamente.');
end; $$;
revoke all on function public.ig_delivery_admin(text,jsonb) from public,anon,authenticated;
grant execute on function public.ig_delivery_admin(text,jsonb) to service_role;

create or replace function public.ig_delivery_ingest(p_raw_base64 text,p_signature text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare secret text; raw bytea; expected text; body jsonb; e jsonb; ch jsonb; v jsonb;
 c public.ig_delivery_campaigns%rowtype; stamp timestamptz; total integer:=0; n integer;
begin
 select app_secret into secret from ig_delivery_private.secrets where singleton;
 if secret is null then return jsonb_build_object('code',503,'body','Meta not configured'); end if;
 if p_signature is null or p_signature !~ '^sha256=[0-9a-f]{64}$' then
   return jsonb_build_object('code',403,'body','Invalid signature'); end if;
 if length(p_raw_base64)>1400000 then return jsonb_build_object('code',413,'body','Too large'); end if;
 begin raw:=decode(p_raw_base64,'base64'); exception when others then
   return jsonb_build_object('code',400,'body','Invalid body'); end;
 expected:='sha256='||encode(extensions.hmac(raw,convert_to(secret,'UTF8'),'sha256'),'hex');
 -- Hash both fixed-size signatures before comparing; do not compare HMAC prefixes.
 if extensions.digest(convert_to(expected,'UTF8'),'sha256') <> extensions.digest(convert_to(p_signature,'UTF8'),'sha256') then
   return jsonb_build_object('code',403,'body','Invalid signature'); end if;
 begin body:=convert_from(raw,'UTF8')::jsonb; exception when others then
   return jsonb_build_object('code',400,'body','Invalid JSON'); end;
 if body->>'object' is distinct from 'instagram' then return jsonb_build_object('code',200,'body','Ignored','queued',0); end if;
 if jsonb_typeof(body->'entry') is distinct from 'array' then return jsonb_build_object('code',400,'body','Invalid entries'); end if;
 for e in select value from jsonb_array_elements(body->'entry') loop
   if coalesce(e->>'time','') !~ '^[0-9]{1,11}$' or jsonb_typeof(e->'changes') is distinct from 'array' then continue; end if;
   stamp:=to_timestamp((e->>'time')::double precision);
   if stamp < now()-interval '7 days' or stamp > now()+interval '5 minutes' then continue; end if;
   for ch in select value from jsonb_array_elements(e->'changes') loop
     if ch->>'field' is distinct from 'comments' then continue; end if;
     v:=ch->'value';
     if nullif(v->>'id','') is null or nullif(v#>>'{from,id}','') is null then continue; end if;
     for c in select * from public.ig_delivery_campaigns
       where enabled and owner_id=e->>'id' and media_id=v#>>'{media,id}'
       and translate(lower(coalesce(v->>'text','')),'áéíóúüñ','aeiouun') ~ (chr(92)||'m'||keyword||chr(92)||'M')
       and stamp >= accept_from
       and v#>>'{from,id}' <> owner_id
       and (audience='post' or (
         lower(allowed_username)=lower(v#>>'{from,username}')
         and (allowed_recipient_id is null or allowed_recipient_id=v#>>'{from,id}')
       )) loop
       insert into public.ig_delivery_jobs(campaign_id,comment_id,recipient_id,event_at)
       values(c.id,v->>'id',v#>>'{from,id}',stamp) on conflict do nothing;
       get diagnostics n=row_count; total:=total+n;
     end loop;
   end loop;
 end loop;
 return jsonb_build_object('code',200,'body','EVENT_RECEIVED','queued',total);
end; $$;

drop function public.ig_delivery_configure(text,text);
create function public.ig_delivery_configure(p_owner_id text,p_app_secret text,p_verify_token text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(p_owner_id,'') !~ '^[0-9]{5,30}$' or length(coalesce(p_app_secret,''))<16 or length(coalesce(p_verify_token,''))<32 then
  raise exception 'Invalid account configuration'; end if;
 if exists(select 1 from ig_delivery_private.secrets where singleton and owner_id is not null and owner_id<>p_owner_id)
  and exists(select 1 from public.ig_delivery_campaigns) then raise exception 'Account change requires a separate installation'; end if;
 update ig_delivery_private.secrets set owner_id=p_owner_id,app_secret=p_app_secret,
 verify_token_hash=encode(extensions.digest(convert_to(p_verify_token,'UTF8'),'sha256'),'hex') where singleton;
end; $$;
revoke all on function public.ig_delivery_configure(text,text,text) from public,anon,authenticated;
grant execute on function public.ig_delivery_configure(text,text,text) to service_role;

revoke all on function public.ig_delivery_ingest(text,text) from public,anon,authenticated;
grant execute on function public.ig_delivery_ingest(text,text) to service_role;
commit;
