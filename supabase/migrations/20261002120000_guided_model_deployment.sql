begin;

create table public.model_onboarding (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null,
  model_id uuid not null references public.models(id) on delete cascade,
  model_version_id uuid not null,
  idempotency_key text not null,
  stage text not null default 'draft' check (stage in ('draft','uploading','validating','queued','preparing','evaluating','ready','failed','cancelled')),
  settings jsonb not null default '{}',
  test_snapshot jsonb not null default '[]',
  error text,
  completed_tests integer not null default 0,
  total_tests integer not null default 0,
  evaluation_id uuid references public.evaluations(id) on delete set null,
  baseline_version_id uuid references public.model_versions(id) on delete set null,
  artifact_revision text,
  artifact_bytes bigint not null default 0 check(artifact_bytes >= 0),
  worker_id text,
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt integer not null default 0,
  reserved_seconds integer not null default 0,
  used_seconds integer not null default 0,
  cancel_requested boolean not null default false,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_user_id, idempotency_key),
  unique(model_version_id),
  foreign key(model_version_id, model_id) references public.model_versions(id, model_id) on delete cascade
);
create index model_onboarding_owner_project_idx on public.model_onboarding(owner_user_id,model_id,created_at desc);

create table public.deployment_allowances (
  owner_user_id text primary key,
  enabled boolean not null default false,
  remaining_seconds integer not null default 0 check(remaining_seconds >= 0),
  max_job_seconds integer not null default 1800 check(max_job_seconds between 60 and 86400),
  max_storage_bytes bigint not null default 40000000000 check(max_storage_bytes > 0)
);
-- Ciphertext is not readable through authenticated REST. Only trusted server/worker code reads it.
create table public.model_private_credentials (
  operation_id uuid primary key references public.model_onboarding(id) on delete cascade,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);
alter table public.model_onboarding enable row level security;
alter table public.deployment_allowances enable row level security;
alter table public.model_private_credentials enable row level security;
revoke all on public.model_onboarding, public.deployment_allowances, public.model_private_credentials from anon, authenticated;
grant select on public.model_onboarding, public.deployment_allowances to authenticated;
create policy owner_read_onboarding on public.model_onboarding for select to authenticated
  using(owner_user_id = (select auth.jwt()->>'sub') and exists(select 1 from public.models m where m.id=model_id and m.owner_user_id=model_onboarding.owner_user_id));
create policy owner_read_allowance on public.deployment_allowances for select to authenticated using(owner_user_id=(select auth.jwt()->>'sub'));

create function public.validate_onboarding_owner() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.models m where m.id=new.model_id and m.owner_user_id=new.owner_user_id) then
    raise exception 'Deployment must belong to the project owner' using errcode='23514';
  end if;
  if new.baseline_version_id is not null and not exists(select 1 from public.model_versions v where v.id=new.baseline_version_id and v.model_id=new.model_id) then
    raise exception 'Baseline must belong to the project' using errcode='23514';
  end if;
  if new.evaluation_id is not null and not exists(select 1 from public.evaluations e where e.id=new.evaluation_id and e.model_id=new.model_id and e.model_version_id=new.model_version_id) then
    raise exception 'Evaluation must belong to the deployed version' using errcode='23514';
  end if;
  return new;
end $$;
create trigger validate_onboarding_owner before insert or update on public.model_onboarding for each row execute function public.validate_onboarding_owner();

-- Called with a Clerk JWT. Creation and test import commit together or roll back together.
create function public.create_guided_project(p_key text,p_name text,p_purpose text,p_version text,p_settings jsonb,p_tests jsonb,p_project uuid default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare uid text := auth.jwt()->>'sub'; mid uuid; vid uuid; oid uuid; baseline uuid; row jsonb;
begin
  if uid is null then raise exception 'Sign in to continue' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid || ':' || p_key,0));
  select id into oid from public.model_onboarding where owner_user_id=uid and idempotency_key=p_key;
  if oid is not null then return oid; end if;
  if p_project is null then
    insert into public.models(name,provider,purpose,owner_user_id) values(p_name,'AI Assistant',p_purpose,uid) returning id into mid;
  else
    select id,current_model_version_id into mid,baseline from public.models where id=p_project and owner_user_id=uid for update;
    if mid is null then raise exception 'Project not found' using errcode='42501'; end if;
  end if;
  insert into public.model_versions(model_id,version,status) values(mid,p_version,'DRAFT') returning id into vid;
  update public.models set current_model_version_id=vid,updated_at=now() where id=mid;
  for row in select value from jsonb_array_elements(p_tests) loop
    insert into public.test_cases(model_id,model_version_id,stable_key,name,category,input,expected_output,evaluator_type,threshold,severity,tags,evaluation_criteria)
    values(mid,vid,row->>'stable_key',row->>'name',row->>'category',row->>'input',row->>'expected_output',row->>'evaluator_type',(row->>'threshold')::numeric,row->>'severity',array(select jsonb_array_elements_text(row->'tags')),coalesce(row->'evaluation_criteria','{}'));
  end loop;
  if jsonb_array_length(p_tests)=0 and baseline is not null and (p_settings->>'reuseTests')::boolean then
    insert into public.test_cases(model_id,model_version_id,stable_key,name,category,input,expected_output,evaluator_type,threshold,severity,tags,evaluation_criteria)
    select distinct on(stable_key) mid,vid,stable_key,name,category,input,expected_output,evaluator_type,threshold,severity,tags,evaluation_criteria from public.test_cases where model_id=mid and (model_version_id=baseline or model_version_id is null) order by stable_key,(model_version_id=baseline) desc nulls last;
  end if;
  insert into public.model_onboarding(owner_user_id,model_id,model_version_id,idempotency_key,settings,baseline_version_id)
  values(uid,mid,vid,p_key,p_settings,baseline) returning id into oid;
  return oid;
end $$;
-- Insert is available only inside this RPC; its trigger and RLS also enforce ownership.
grant insert on public.model_onboarding to authenticated;
create policy owner_insert_onboarding on public.model_onboarding for insert to authenticated
  with check(owner_user_id=(select auth.jwt()->>'sub') and stage='draft' and evaluation_id is null and lease_token is null and lease_expires_at is null and worker_id is null and artifact_revision is null and artifact_bytes=0 and test_snapshot='[]'::jsonb and attempt=0 and reviewed_at is null and reserved_seconds=0 and used_seconds=0 and completed_tests=0 and total_tests=0 and not cancel_requested and exists(select 1 from public.models m where m.id=model_id and m.owner_user_id=model_onboarding.owner_user_id));
revoke all on function public.create_guided_project(text,text,text,text,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.create_guided_project(text,text,text,text,jsonb,jsonb,uuid) to authenticated;

-- Service-only budget reservation and lease. The row lock serializes concurrent starts.
create function public.claim_model_job(p_id uuid,p_owner text,p_lease uuid) returns jsonb language plpgsql set search_path='' as $$
declare job public.model_onboarding; allowance public.deployment_allowances; seconds integer:=0;
begin
  select * into job from public.model_onboarding where id=p_id and owner_user_id=p_owner for update;
  if job.id is null then raise exception 'Job not found'; end if;
  if job.cancel_requested or job.stage not in ('queued','validating','preparing','evaluating') then return null; end if;
  if job.lease_expires_at > now() then return null; end if;
  if (job.settings->>'source' <> 'api' or exists(select 1 from public.model_onboarding b where b.model_version_id=job.baseline_version_id and b.settings->>'source'<>'api')) and job.reserved_seconds=0 then
    select * into allowance from public.deployment_allowances where owner_user_id=p_owner for update;
    if allowance.owner_user_id is null or not allowance.enabled or allowance.remaining_seconds < allowance.max_job_seconds then
      update public.model_onboarding set stage='failed',error='Hosted deployment allowance is unavailable. Ask the administrator or connect an existing API.',updated_at=now() where id=p_id;
      return null;
    end if;
    seconds:=allowance.max_job_seconds;
    update public.deployment_allowances set remaining_seconds=remaining_seconds-seconds where owner_user_id=p_owner;
  end if;
  update public.model_onboarding set lease_token=p_lease,lease_expires_at=now()+interval '2 minutes',attempt=attempt+1,
    reserved_seconds=reserved_seconds+seconds,used_seconds=case when seconds>0 then 0 else used_seconds end,updated_at=now() where id=p_id returning * into job;
  return to_jsonb(job);
end $$;
revoke all on function public.claim_model_job(uuid,text,uuid) from public,anon,authenticated;

create function public.finish_model_job(p_id uuid,p_lease uuid,p_used integer) returns void language plpgsql set search_path='' as $$
declare job public.model_onboarding; used integer;
begin
  select * into job from public.model_onboarding where id=p_id and lease_token=p_lease for update;
  if job.id is null then return; end if;
  used:=least(job.reserved_seconds,greatest(job.used_seconds,p_used,0));
  if job.reserved_seconds>0 then
    update public.deployment_allowances set remaining_seconds=remaining_seconds+greatest(0,job.reserved_seconds-used) where owner_user_id=job.owner_user_id;
  end if;
  update public.model_onboarding set used_seconds=used,reserved_seconds=0,lease_token=null,lease_expires_at=null,updated_at=now() where id=p_id;
end $$;
revoke all on function public.finish_model_job(uuid,uuid,integer) from public,anon,authenticated;

create function public.begin_model_upload(p_id uuid,p_owner text) returns void language plpgsql set search_path='' as $$
declare job public.model_onboarding; allowance public.deployment_allowances; bytes numeric;
begin
  select * into job from public.model_onboarding where id=p_id and owner_user_id=p_owner for update;
  if job.id is null or job.stage not in ('draft','uploading','failed','cancelled') or job.evaluation_id is not null then raise exception 'This version cannot accept new model files'; end if;
  select * into allowance from public.deployment_allowances where owner_user_id=p_owner for update;
  if allowance.owner_user_id is null or not allowance.enabled then raise exception 'Ask the administrator to grant a hosted deployment allowance'; end if;
  select coalesce(sum(case when o.settings->>'source'='upload' then (select coalesce(sum((f->>'size')::numeric),0) from jsonb_array_elements(coalesce(o.settings->'files','[]')) f) else o.artifact_bytes end),0) into bytes from public.model_onboarding o where o.owner_user_id=p_owner;
  if bytes>allowance.max_storage_bytes then raise exception 'Your model storage allowance is too small. Ask the administrator to increase it'; end if;
  update public.model_onboarding set stage='uploading',updated_at=now() where id=p_id;
end $$;
revoke all on function public.begin_model_upload(uuid,text) from public,anon,authenticated;

create function public.reserve_model_import(p_id uuid,p_owner text,p_bytes bigint,p_revision text) returns void language plpgsql set search_path='' as $$
declare job public.model_onboarding; allowance public.deployment_allowances; bytes numeric;
begin
  select * into job from public.model_onboarding where id=p_id and owner_user_id=p_owner for update;
  if job.id is null or job.settings->>'source'<>'huggingface' or p_bytes<=0 or p_revision !~ '^[0-9a-f]{40}$' then raise exception 'Invalid repository import'; end if;
  select * into allowance from public.deployment_allowances where owner_user_id=p_owner for update;
  if allowance.owner_user_id is null or not allowance.enabled then raise exception 'Hosted deployment allowance is unavailable'; end if;
  select coalesce(sum(case when o.settings->>'source'='upload' then (select coalesce(sum((f->>'size')::numeric),0) from jsonb_array_elements(coalesce(o.settings->'files','[]')) f) else o.artifact_bytes end),0) into bytes from public.model_onboarding o where o.owner_user_id=p_owner and o.id<>p_id;
  if bytes+p_bytes>allowance.max_storage_bytes then raise exception 'Repository exceeds your remaining model storage allowance'; end if;
  update public.model_onboarding set artifact_bytes=p_bytes,artifact_revision=p_revision,updated_at=now() where id=p_id;
end $$;
revoke all on function public.reserve_model_import(uuid,text,bigint,text) from public,anon,authenticated;

-- Grants exist on hosted Supabase; conditional for local test databases.
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
  grant all on public.model_onboarding,public.model_private_credentials,public.deployment_allowances to service_role;
  grant execute on function public.claim_model_job(uuid,text,uuid) to service_role;
  grant execute on function public.finish_model_job(uuid,uuid,integer) to service_role;
  grant execute on function public.begin_model_upload(uuid,text) to service_role;
  grant execute on function public.reserve_model_import(uuid,text,bigint,text) to service_role;
end if; end $$;

-- Storage is installed by Supabase. Local database tests may not include it.
do $$ begin if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public) values('model-artifacts','model-artifacts',false) on conflict(id) do nothing;
  execute $policy$ create policy model_artifact_owner_read on storage.objects for select to authenticated
    using(bucket_id='model-artifacts' and exists(select 1 from public.model_onboarding o where name like o.owner_user_id || '/' || o.id::text || '/%' and o.owner_user_id=(select auth.jwt()->>'sub'))) $policy$;
  execute $policy$ create policy model_artifact_owner_insert on storage.objects for insert to authenticated
    with check(bucket_id='model-artifacts' and exists(select 1 from public.model_onboarding o where name like o.owner_user_id || '/' || o.id::text || '/%' and o.owner_user_id=(select auth.jwt()->>'sub') and o.stage='uploading' and exists(select 1 from jsonb_array_elements(o.settings->'files') f where name=o.owner_user_id || '/' || o.id::text || '/' || (f->>'path') and (metadata->>'contentLength')::numeric=(f->>'size')::numeric))) $policy$;
end if; end $$;
notify pgrst,'reload schema';
commit;
