# Guided model deployment pilot

Model deletion and replacement require the updated worker control route `POST /delete-model` for models that have already run on the hosted worker. Rebuild with `npm run worker:build` and redeploy `workers/modal_app.py` when updating an existing installation. The web app first marks the model for removal, then removes its worker-volume copy and private storage files before deleting its deployment record and connection. Project versions, test cases, and historical reports are retained. Models uploaded but never run do not need worker-volume cleanup. Active evaluations and comparisons must finish or stop before removal.

The code integrates project creation, private model uploads/imports/API connections, test review, durable evaluation, and version comparison. It is disabled by default in a new installation. See `model-deployment-verification.md` for the current operator rollout and verification record.

## Configure the infrastructure

Run `npm run deployment:check` to check server configuration, migrated resources, private storage, a pilot allowance (when `DEPLOYMENT_PILOT_USER_ID` is set), and the private worker health endpoint. It reports missing setup without printing credentials or enabling the flow. `node scripts/deployment-preflight.mjs --init-key` generates the local encryption key only when absent; it preserves a configured key.

For Windows operator tooling, use the isolated environment:

```powershell
python -m venv .venv-modal
.\.venv-modal\Scripts\python.exe -m pip install -r workers/requirements-operator.txt
.\.venv-modal\Scripts\python.exe -m modal token new --expires-in 12h
```

Use `.\.venv-modal\Scripts\python.exe -m modal` in place of `modal` in subsequent commands. This environment is ignored by Git and ESLint.

1. Apply migrations in order, including `20261002090000_clerk_project_ownership.sql` before `20261002120000_guided_model_deployment.sql`. Keep the existing Clerk JWT/Supabase integration. Unassigned legacy projects stay hidden until an administrator assigns their text Clerk user ID.
2. Configure a private Cloudflare R2 bucket and its browser CORS policy using [the R2 setup guide](r2-model-storage.md). Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET_NAME` on both the web server and Modal worker. No Supabase paid storage plan or upload-limit configuration is needed for new model files. Apply `20261004090000_retire_model_storage_uploads.sql` to disable the old browser uploads; existing Supabase files remain readable until explicitly replaced or deleted.
3. Generate a dedicated random 32-byte base64 `MODEL_CREDENTIAL_KEY_V1`, and save it in the web server and Modal secret. Keep it stable and backed up: changing it makes saved credentials unreadable. Only server/worker code can access credentials.
4. Set `SUPABASE_SERVICE_ROLE_KEY` on the web server. Keep it server-only. Set `NEXT_PUBLIC_SUPABASE_URL` and the existing public key as usual.
5. Install the Modal CLI in an operator environment and authenticate it. Create the `modelledger-worker` Modal secret with `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MODEL_CREDENTIAL_KEY_V1`, `MODAL_PROXY_TOKEN_ID`, `MODAL_PROXY_TOKEN_SECRET`, and (after first deployment) `MODAL_CONTROL_URL` and all four `R2_*` fields. Add the existing judge configuration (`LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY` or `NVIDIA_API_KEY`) for tests using `llm_judge`. Optionally add `HINDSIGHT_API_KEY` and `HINDSIGHT_BASE_URL` to retain report outcomes privately after the report is ready; memory failures cannot undo a completed report.
6. Run `npm run worker:build`, then `modal deploy workers/modal_app.py` from the repository root. The build creates a Node worker bundle; the Modal CPU image uses Node 22. The private control service and one-minute reconciler run evaluations durably. Hosted mode also registers the A100 80 GB serving class. Create Modal proxy-auth tokens for the private control service. Set its URL and those tokens on both web server and Modal secret, then redeploy. Endpoints remain internal; users never configure them for uploaded models.

   For an API-only rollout, set `MODELLEDGER_DEPLOY_GPU=false` on the web server, in the worker secret, and in the operator environment **before** deploying Modal. This omits the GPU serving class. Existing API models can evaluate; uploaded folders and repository imports remain saved drafts with an explanation. On Windows:

   ```powershell
   $env:PYTHONIOENCODING = 'utf-8'
   $env:MODELLEDGER_DEPLOY_GPU = 'false'
   .\.venv-modal\Scripts\python.exe scripts/configure-modal.py
   .\.venv-modal\Scripts\python.exe -m modal deploy workers/modal_app.py
   ```

   `configure-modal.py` synchronizes only the worker's permitted configuration and secrets without printing them. After first deployment, rerun it with `--control-url https://YOUR-CONTROL.modal.run`, then redeploy. Credential transfer requires the operator's authorization.
7. Grant each pilot user's allowance using an administrator/service-role connection. The following example reserves up to 30 minutes per hosted job and grants two hours of capacity and 40 GB storage. Use the actual Clerk user ID and an operator-approved budget.

```sql
insert into public.deployment_allowances
  (owner_user_id, enabled, remaining_seconds, max_job_seconds, max_storage_bytes)
values ('user_REPLACE_WITH_CLERK_ID', true, 7200, 1800, 40000000000)
on conflict (owner_user_id) do update
set enabled = excluded.enabled,
    remaining_seconds = excluded.remaining_seconds,
    max_job_seconds = excluded.max_job_seconds,
    max_storage_bytes = excluded.max_storage_bytes;
```

Allowances count job wall time, including preparation and evaluation, as a conservative pilot limit; they are not a billing meter or a USD guarantee. GPU containers stop after 60 idle seconds. Use Modal's operator billing limits as an additional cap. Existing API evaluations need the durable worker infrastructure, but do not reserve GPU capacity unless their comparison also needs a hosted baseline.

8. Set `GUIDED_DEPLOYMENT_ENABLED=true` on the server only after verifying the migration, private storage, encryption, worker, and allowance. Restart/redeploy the web app. New project opens the integrated setup screen. To pause new guided requests, disable the flag; already queued Modal jobs remain durable and should be cancelled separately if needed.

## Pilot verification before acceptance

Run `npm run type-check`, `npm run lint`, `npm test`, `npm run worker:build`, and `npm run build` locally. Database tests use an isolated PGlite database; they do not modify Supabase.

With Python 3.11 or newer available, run `python tests/deployment/model-package.test.py` to check the actual pre-GPU package validator against complete, truncated, malformed, missing-shard, and incompatible model fixtures. These tests do not import Modal or allocate a GPU.

Use two real signed-in accounts to verify creation, uploads, reports, exports, cancellation, and memory access. Neither account may read the other's projects or resources. Upload a complete small Llama/Mistral/Qwen2 text-generation model, or import a compatible repository, and use the CSV template with reviewed expected answers. Confirm the immutable revision, successful GPU startup, actual outputs, and completed report. Then add V2 with reused tests and confirm its comparison. Change an expected answer and confirm it is shown as a changed test, not a regression.

Close the browser during evaluation and return to the workspace. Interrupt and resume an R2 multipart upload with the original folder. Expire the session and switch accounts. Submit twice. Interrupt a worker and confirm checkpoints prevent duplicate results. Cancel an active job and verify partial results and allowance settlement. Exhaust an allowance and verify the saved project explains recovery. Verify keyboard focus, mobile layout, and progress announcements with an authenticated browser.

The automated checks do not replace live verification. An API-only rollout can verify real API V1/V2 runs while retaining `MODELLEDGER_DEPLOY_GPU=false`. A real GPU deployment and resumable model-upload verification remain required before enabling hosted model execution.

## Supported input and recovery

Upload complete standard Llama, Mistral, or Qwen2 text-generation folders with `config.json`, tokenizer assets, and complete Safetensors weights. Archives, pickle weights, adapters, arbitrary uploaded Python, multimodal packages, and quantized configurations are rejected. Folder manifests are checked in the browser; downloaded Safetensors containers and shard indexes are checked before allocating a GPU. The initial serving limit is 4,096 context tokens and at most 512 generated tokens per case. Repository revisions are pinned before downloads and caches/serving instances are isolated by owner, operation, and revision.

Private API keys and repository tokens use AES-256-GCM encryption. API destinations must be public HTTPS on the standard port; DNS is checked and pinned on each outbound request and redirects are rejected. Localhost and private-network model servers need a public secured API connection.

Drafts keep form entries and CSV text. Uploads resume through signed R2 multipart sessions; completed objects are skipped after verifying size. Re-select the original folder after returning to a browser. A worker lease is renewed every 30 seconds and expires after two minutes. The reconciler takes over expired work, reuses the test/configuration snapshot and saved case checkpoints, and settles each budget reservation once. Cancellation is checked between cases and while awaiting Modal GPU calls. Optional recommendations and memory are shown by the existing report services and do not gate the durable job's completion.

Monitor failed jobs and stalled leases through administrator access to `model_onboarding`; never expose service logs or keys to visitors. During the pilot, review operator storage usage and clean unused model artifacts through administrator tooling. Storage lifecycle cleanup, a USD billing meter, and shared-team roles are outside this initial rollout.

References: [Modal private web endpoints](https://modal.com/docs/guide/webhooks), [Modal scheduled functions](https://modal.com/docs/guide/cron), [Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads).
