# Cloudflare R2 model storage

New folder uploads go directly from the browser to a private R2 bucket. The web server authenticates the owner, checks the saved manifest, signs individual 64 MiB parts for 15 minutes, and verifies uploaded part sizes before completing a file. A signed session binds each multipart upload to the owner, operation, and exact folder manifest and expires after seven days. The browser saves that session locally to resume after closing the page. Completed files are skipped only after checking their size in R2.

Supabase continues to store project records, manifests, allowances, credentials, tests, and reports. Modal downloads R2 model files into its existing private Volume before inference. Hugging Face imports download directly into that Volume and API models do not store weights here. R2 and Modal have their own billing; this removes new model weight storage from Supabase, rather than making storage or GPU execution unlimited or free.

## Configure R2

1. Create a Cloudflare R2 bucket, for example `model-artifacts`. Leave public access, the `r2.dev` URL, and public custom domains disabled.
2. Create a bucket-scoped R2 API token with Object Read & Write access. Save the S3 Access Key ID and Secret Access Key in `.env.local` and the hosting environment. Do not paste secrets into chat or use `NEXT_PUBLIC_*` variables.
3. Configure the following on both the web server and the `modelledger-worker` Modal secret:

```dotenv
R2_ACCOUNT_ID=YOUR_CLOUDFLARE_ACCOUNT_ID
R2_ACCESS_KEY_ID=YOUR_BUCKET_SCOPED_ACCESS_KEY
R2_SECRET_ACCESS_KEY=YOUR_BUCKET_SCOPED_SECRET
R2_BUCKET_NAME=model-artifacts
```

Keep the existing Supabase database credentials, Clerk configuration, and `MODEL_CREDENTIAL_KEY_V1`. The encryption key also signs upload sessions and must remain stable.

4. Set the bucket CORS policy. Replace the example origin with the actual app URL and add any development or preview origins explicitly. This example supports local Next.js development:

```json
[
  {
    "AllowedOrigins": ["https://model-ledger-sigma.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

5. Add a lifecycle rule that aborts incomplete multipart uploads after **seven days**. Abandoned multipart parts otherwise occupy storage. Use the application delete action to remove a model; it aborts pending sessions, deletes R2 objects and any Modal cache, and retains reports and project versions.
6. Apply `supabase/migrations/20261004090000_retire_model_storage_uploads.sql` after the existing migrations. It disables the previous browser insert policy while preserving reads of existing Supabase artifacts. No new R2 tables are required.
7. Synchronize worker secrets with `scripts/configure-modal.py`, rebuild the worker with `npm run worker:build`, redeploy `workers/modal_app.py`, and redeploy the web app with the four R2 environment variables. `scripts/configure-production.mjs` includes those variables in its configuration list.
8. Run `npm run deployment:check`. It checks R2 bucket access and upload CORS in addition to the existing database, allowance, and worker checks. Inspect the allowed origins and public-access settings in Cloudflare; this command does not prove that public URLs are disabled.

## Existing Supabase files

Operations without `settings.artifactStorage: "r2"` retain legacy Supabase reads and cleanup. Existing completed models continue working without copying them automatically or deleting their storage. Replace unevaluated legacy uploads through Upload Model to switch that version to R2; use a new version for evaluated models. Interrupted legacy uploads must be restarted through Upload Model. Back up any existing artifacts before manually removing the old bucket; keep it while any legacy model depends on it.

## Verify before rollout

Run type checking, lint, the test suite, worker build, and production build. With configured R2, upload a compatible folder containing a weight shard larger than 64 MiB, interrupt it after at least one part, reselect the same folder, and confirm only missing parts upload. Verify final size, worker download, a completed evaluation, deletion, and isolation with two accounts. Confirm a stale session cannot finish an upload after cancellation and a changed manifest cannot resume the previous session.

References: [R2 S3 credentials and presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 bucket CORS](https://developers.cloudflare.com/r2/buckets/cors/), [R2 lifecycle rules](https://developers.cloudflare.com/r2/buckets/object-lifecycles/), [Modal model weight storage](https://modal.com/docs/guide/model-weights).
