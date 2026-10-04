-- R2 handles all new model uploads. Keep legacy read policies and objects for
-- existing deployments, but disable the old browser upload authorization.
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists model_artifact_owner_insert on storage.objects';
  end if;
end $$;
