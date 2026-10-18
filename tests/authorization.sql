-- Integration test for the configured project. Fixtures and access changes roll back.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111','free-test@example.invalid',now()),
 ('22222222-2222-4222-8222-222222222222','other-test@example.invalid',now());
insert into public.vault_config(user_id,salt,verifier) values
 ('11111111-1111-4111-8111-111111111111','test','{}'),
 ('22222222-2222-4222-8222-222222222222','test','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.vault_items(id,user_id,payload) select gen_random_uuid(),'11111111-1111-4111-8111-111111111111','{}' from generate_series(1,5);
do $$ begin
 if (public.get_vault_plan()->>'used')::integer<>5 then raise exception 'Usage count incorrect'; end if;
 begin
 insert into public.vault_items(id,user_id,payload) values(gen_random_uuid(),auth.uid(),'{}');
 raise exception 'Sixth password was accepted' using errcode='XX000';
 exception when raise_exception then if sqlerrm not like 'Free plan limit reached:%' then raise; end if; end;
 begin perform public.admin_vault_overview();raise exception 'Admin access bypassed' using errcode='XX000';exception when insufficient_privilege then null;end;
 begin perform public.admin_set_vault_access('free-test@example.invalid','allowlist');raise exception 'Self-upgrade allowed' using errcode='XX000';exception when insufficient_privilege then null;end;
 begin perform public.admin_decline_vault_request(auth.uid());raise exception 'Non-admin decline allowed' using errcode='XX000';exception when insufficient_privilege then null;end;
 begin perform 1 from vault_private.access_grants;raise exception 'Private access exposed' using errcode='XX000';exception when insufficient_privilege then null;end;
 begin update public.vault_items set user_id='22222222-2222-4222-8222-222222222222';raise exception 'Owner update allowed' using errcode='XX000';exception when insufficient_privilege then null;end;
 if (public.get_vault_plan()->>'used')::integer<>5 then raise exception 'Failed insert corrupted count';end if;
end $$;
delete from public.vault_items where id=(select id from public.vault_items limit 1);
do $$ begin
 begin
 insert into public.vault_items(id,user_id,payload) select gen_random_uuid(),auth.uid(),'{}' from generate_series(1,2);
 raise exception 'Bulk limit bypassed' using errcode='XX000';
 exception when raise_exception then if sqlerrm not like 'Free plan limit reached:%' then raise;end if;end;
 if (public.get_vault_plan()->>'used')::integer<>4 or (select count(*) from public.vault_items)<>4 then raise exception 'Bulk rollback failed';end if;
end $$;
select public.request_vault_subscription();
select public.request_vault_subscription();
select set_config('request.jwt.claim.sub','faf70977-0a34-4255-8013-84edb89f0d21',true);
select public.admin_set_vault_access('FREE-TEST@example.invalid','allowlist');
select public.admin_set_vault_access('future-member@example.invalid','allowlist');
do $$ begin
 if not (public.get_vault_plan()->>'is_admin')::boolean then raise exception 'Admin missing';end if;
 if not exists(select 1 from jsonb_array_elements(public.admin_vault_overview('free-test')->'grants') g where g->>'email'='free-test@example.invalid') then raise exception 'Grant missing';end if;
end $$;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.vault_items(id,user_id,payload) select gen_random_uuid(),auth.uid(),'{}' from generate_series(1,3);
do $$ begin
 if not (public.get_vault_plan()->>'unlimited')::boolean or (public.get_vault_plan()->>'used')::integer<>7 then raise exception 'Allowlist failed';end if;
 if public.get_vault_plan()->>'request_status'<>'approved' then raise exception 'Request approval failed';end if;
end $$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin if (select count(*) from public.vault_items)<>0 then raise exception 'Cross-user read exposed';end if;end $$;
select set_config('request.jwt.claim.sub','faf70977-0a34-4255-8013-84edb89f0d21',true);
select public.admin_set_vault_access('free-test@example.invalid','subscription',now()+interval '1 day');
reset role;
update vault_private.access_grants set expires_at=now()-interval '1 minute' where email='free-test@example.invalid';
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin
 if (public.get_vault_plan()->>'unlimited')::boolean then raise exception 'Expired subscription still active';end if;
 if (select count(*) from public.vault_items)<>7 then raise exception 'Expired account lost read access';end if;
 begin insert into public.vault_items(id,user_id,payload) values(gen_random_uuid(),auth.uid(),'{}');raise exception 'Expired account added password' using errcode='XX000';exception when raise_exception then if sqlerrm not like 'Free plan limit reached:%' then raise;end if;end;
end $$;
update public.vault_items set payload='{"test":true}' where user_id=auth.uid();
select set_config('request.jwt.claim.sub','faf70977-0a34-4255-8013-84edb89f0d21',true);
select public.admin_set_vault_access('free-test@example.invalid','free');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$ begin if public.get_vault_plan()->>'plan'<>'free' then raise exception 'Revocation failed';end if;end $$;
reset role;
select 'PASS: free limit, bulk rollback, admin authorization, grants, expiry, revocation and isolation' as result;
rollback;
