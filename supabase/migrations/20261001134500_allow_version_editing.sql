create policy "demo_public_update_model_versions"
  on public.model_versions
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "demo_public_delete_model_versions"
  on public.model_versions
  for delete
  to anon, authenticated
  using (true);
