-- Run after schema.sql. Applied to the connected project during implementation.
create schema if not exists vault_private;
revoke all on schema vault_private from public,anon,authenticated;
create table vault_private.admins(user_id uuid primary key references auth.users(id) on delete cascade);
insert into vault_private.admins(user_id) values ('faf70977-0a34-4255-8013-84edb89f0d21');
create table vault_private.access_grants(email text primary key check(email=lower(trim(email))),kind text not null check(kind in ('allowlist','subscription')),expires_at timestamptz,updated_at timestamptz not null default now(),updated_by uuid references auth.users(id));
create table vault_private.usage(user_id uuid primary key references auth.users(id) on delete cascade,used integer not null default 0 check(used>=0));
insert into vault_private.usage(user_id,used) select user_id,count(*) from public.vault_items group by user_id;
create table vault_private.subscription_requests(user_id uuid primary key references auth.users(id) on delete cascade,status text not null default 'pending' check(status in ('pending','approved','declined')),requested_at timestamptz not null default now(),resolved_at timestamptz);
alter table vault_private.admins enable row level security;
alter table vault_private.access_grants enable row level security;
alter table vault_private.usage enable row level security;
alter table vault_private.subscription_requests enable row level security;
revoke all on all tables in schema vault_private from public,anon,authenticated;

create function vault_private.unlimited(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from vault_private.admins where user_id=p_user) or exists(
 select 1 from auth.users u join vault_private.access_grants g on g.email=lower(u.email)
 where u.id=p_user and u.email_confirmed_at is not null and (g.expires_at is null or g.expires_at>now()));
$$;
create function vault_private.require_admin() returns uuid language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from vault_private.admins where user_id=auth.uid()) then raise exception 'Admin access required' using errcode='42501'; end if;
 return auth.uid();
end $$;

create function public.get_vault_plan() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_grant vault_private.access_grants; v_admin boolean; v_used integer; v_request text;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select exists(select 1 from vault_private.admins where user_id=v_user) into v_admin;
 select g.* into v_grant from vault_private.access_grants g join auth.users u on lower(u.email)=g.email where u.id=v_user and u.email_confirmed_at is not null;
 select used into v_used from vault_private.usage where user_id=v_user;
 select status into v_request from vault_private.subscription_requests where user_id=v_user;
 return jsonb_build_object('is_admin',v_admin,'unlimited',vault_private.unlimited(v_user),'plan',case when v_admin then 'admin' when v_grant.email is not null and (v_grant.expires_at is null or v_grant.expires_at>now()) then v_grant.kind else 'free' end,'used',coalesce(v_used,0),'limit',5,'expires_at',v_grant.expires_at,'request_status',v_request);
end $$;

create function vault_private.enforce_item_limit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
   if new.user_id<>old.user_id or new.id<>old.id then raise exception 'Vault item ownership and ID cannot change' using errcode='42501'; end if;
   return new;
 elsif tg_op='DELETE' then
   update vault_private.usage set used=greatest(used-1,0) where user_id=old.user_id;
   return old;
 end if;
 if auth.uid() is null or auth.uid()<>new.user_id then raise exception 'Invalid vault owner' using errcode='42501'; end if;
 insert into vault_private.usage(user_id) values(new.user_id) on conflict do nothing;
 -- Atomic counter update serializes concurrent inserts, including backup restores.
 update vault_private.usage set used=used+1 where user_id=new.user_id and (used<5 or vault_private.unlimited(new.user_id));
 if not found then raise exception 'Free plan limit reached: request a subscription to save more than 5 passwords.' using errcode='P0001'; end if;
 return new;
end $$;
create trigger enforce_vault_insert before insert on public.vault_items for each row execute function vault_private.enforce_item_limit();
create trigger immutable_vault_owner before update on public.vault_items for each row execute function vault_private.enforce_item_limit();
create trigger count_vault_delete after delete on public.vault_items for each row execute function vault_private.enforce_item_limit();

create function public.request_vault_subscription() returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if vault_private.unlimited(auth.uid()) then raise exception 'Unlimited access is already active'; end if;
 insert into vault_private.subscription_requests(user_id) values(auth.uid())
 on conflict(user_id) do update set status='pending',requested_at=now(),resolved_at=null
 where vault_private.subscription_requests.status<>'pending';
end $$;

create function public.admin_vault_overview(p_search text default '',p_page integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 perform vault_private.require_admin();
 if p_page<0 or p_page>100000 or length(p_search)>200 then raise exception 'Invalid search or page'; end if;
 select jsonb_build_object(
 'stats',(select jsonb_build_object('users',count(*),'passwords',coalesce((select sum(used) from vault_private.usage),0),'pending',(select count(*) from vault_private.subscription_requests where status='pending'),'grants',(select count(*) from vault_private.access_grants where expires_at is null or expires_at>now())) from auth.users),
 'users',coalesce((select jsonb_agg(t) from (select u.id,u.email,u.created_at,u.email_confirmed_at,coalesce(c.used,0) as used,case when a.user_id is not null then 'admin' when g.email is not null and (g.expires_at is null or g.expires_at>now()) then g.kind else 'free' end as plan,g.expires_at
 from auth.users u left join vault_private.usage c on c.user_id=u.id left join vault_private.access_grants g on g.email=lower(u.email) left join vault_private.admins a on a.user_id=u.id
 where coalesce(u.email,'') ilike '%'||p_search||'%' order by u.created_at desc limit 50 offset p_page*50) t),'[]'::jsonb),
 'grants',coalesce((select jsonb_agg(t) from (select email,kind,expires_at,updated_at from vault_private.access_grants where email ilike '%'||p_search||'%' order by updated_at desc limit 50 offset p_page*50) t),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(t) from (select r.user_id,u.email,r.status,r.requested_at from vault_private.subscription_requests r join auth.users u on u.id=r.user_id where r.status='pending' and u.email ilike '%'||p_search||'%' order by r.requested_at limit 50 offset p_page*50) t),'[]'::jsonb)
 ) into v_result;
 return v_result;
end $$;

create function public.admin_set_vault_access(p_email text,p_kind text,p_expires_at timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare v_admin uuid; v_email text:=lower(trim(p_email));
begin
 v_admin:=vault_private.require_admin();
 if length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Enter a valid email'; end if;
 if p_kind not in ('allowlist','subscription','free') or p_kind is null then raise exception 'Invalid access type'; end if;
 if p_kind='subscription' and (p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '10 years') then raise exception 'Subscription needs a future expiry within 10 years'; end if;
 if p_kind='free' then delete from vault_private.access_grants where email=v_email;
 else
 insert into vault_private.access_grants(email,kind,expires_at,updated_by) values(v_email,p_kind,case when p_kind='allowlist' then null else p_expires_at end,v_admin)
 on conflict(email) do update set kind=excluded.kind,expires_at=excluded.expires_at,updated_by=v_admin,updated_at=now();
 update vault_private.subscription_requests r set status='approved',resolved_at=now() from auth.users u where u.id=r.user_id and lower(u.email)=v_email and r.status='pending';
 end if;
end $$;
create function public.admin_decline_vault_request(p_user_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform vault_private.require_admin();
 update vault_private.subscription_requests set status='declined',resolved_at=now() where user_id=p_user_id and status='pending';
end $$;

revoke all on all functions in schema vault_private from public,anon,authenticated;
revoke all on function public.get_vault_plan(),public.request_vault_subscription(),public.admin_vault_overview(text,integer),public.admin_set_vault_access(text,text,timestamptz),public.admin_decline_vault_request(uuid) from public,anon,authenticated;
grant execute on function public.get_vault_plan(),public.request_vault_subscription(),public.admin_vault_overview(text,integer),public.admin_set_vault_access(text,text,timestamptz),public.admin_decline_vault_request(uuid) to authenticated;

-- Keep privileged implementations outside the exposed API schema.
alter function public.get_vault_plan() set schema vault_private;
alter function public.request_vault_subscription() set schema vault_private;
alter function public.admin_vault_overview(text,integer) set schema vault_private;
alter function public.admin_set_vault_access(text,text,timestamptz) set schema vault_private;
alter function public.admin_decline_vault_request(uuid) set schema vault_private;
create function public.get_vault_plan() returns jsonb language sql security invoker set search_path='' as $$ select vault_private.get_vault_plan() $$;
create function public.request_vault_subscription() returns void language sql security invoker set search_path='' as $$ select vault_private.request_vault_subscription() $$;
create function public.admin_vault_overview(p_search text default '',p_page integer default 0) returns jsonb language sql security invoker set search_path='' as $$ select vault_private.admin_vault_overview(p_search,p_page) $$;
create function public.admin_set_vault_access(p_email text,p_kind text,p_expires_at timestamptz default null) returns void language sql security invoker set search_path='' as $$ select vault_private.admin_set_vault_access(p_email,p_kind,p_expires_at) $$;
create function public.admin_decline_vault_request(p_user_id uuid) returns void language sql security invoker set search_path='' as $$ select vault_private.admin_decline_vault_request(p_user_id) $$;
revoke all on function public.get_vault_plan(),public.request_vault_subscription(),public.admin_vault_overview(text,integer),public.admin_set_vault_access(text,text,timestamptz),public.admin_decline_vault_request(uuid) from public,anon,authenticated;
grant usage on schema vault_private to authenticated;
grant execute on function public.get_vault_plan(),public.request_vault_subscription(),public.admin_vault_overview(text,integer),public.admin_set_vault_access(text,text,timestamptz),public.admin_decline_vault_request(uuid) to authenticated;
