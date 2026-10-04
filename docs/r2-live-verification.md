# R2 live verification — 2026-10-04

Verified against the locally configured Cloudflare R2 bucket using its existing bucket-scoped object credentials. Credentials and signed URLs were not printed. No GPU work was started.

## Passed

- All four local R2 configuration fields are present; authenticated bucket access succeeds.
- The application's real storage module creates a multipart session and signs individual parts with exact Content-Length.
- A 64 MiB first part and 33-byte final part upload successfully.
- Resume lists the completed first part, with the correct size.
- Completion rejects a missing final part.
- CompleteMultipartUpload succeeds after both parts arrive; the stored size matches the manifest.
- A private signed download has exactly the same SHA-256 as the uploaded bytes.
- An unsigned request to the S3 object endpoint is rejected. This does not prove that the separate public r2.dev URL or custom domains are disabled.
- Cleanup deletes the temporary object and aborts an additional pending multipart session.
- Supabase application tables, encryption configuration, pilot allowance, authenticated Modal health, and anonymous Modal rejection pass.

## Blocked or unverified

- Browser OPTIONS preflight returns 403 with no allowed-origin header for both `http://localhost:3000` and `https://model-ledger-sigma.vercel.app`. Configure the bucket CORS policy with `docs/r2-cors.json`.
- Vercel's production environment variable listing contains none of `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, or `R2_BUCKET_NAME`. Local configuration does not automatically configure Vercel.
- Modal follow-up completed: the operator login was renewed for 12 hours, `scripts/configure-modal.py` synchronized the R2 and existing worker configuration, and the `modelledger` worker was redeployed successfully. All four R2 variable names were verified in the named worker secret. The rebuilt CPU image includes boto3. The deployed private control endpoint returns HTTP 200 with `status: ready` for authenticated requests and HTTP 401 for anonymous requests. GPU hosting remains disabled. A model download from R2 inside a running preparation job still needs end-to-end verification.
- The new Supabase storage-policy migration has not been verified as applied to the hosted database.
- The token-only production app route probe was inconclusive; authenticated browser upload and two-account end-to-end verification remain outstanding.
- The bucket-scoped object token cannot read CORS or lifecycle configuration (403 AccessDenied). The preflight script now verifies CORS behavior directly, without requiring a broader token. Inspect public access and the seven-day multipart abort lifecycle in the Cloudflare dashboard.
- GPU hosting remains disabled. Model preparation, inference, and completed GPU reports remain outstanding.

## Repeat checks

Run `npm run deployment:check` for database, worker, and browser CORS checks. Run `node scripts/verify-r2-storage.mjs` to repeat the actual application multipart upload, resume, completion, signed download, and deletion tests. The latter creates a temporary 64 MiB plus 33-byte object under an isolated verification prefix and removes it afterward; it does not create project records or invoke Modal compute.

Local ESLint also passes after updating the verification scripts. The previous application verification passed 119 app/database tests, 13 Python tests, type checking, worker bundling, and a production build; the current live verification does not replace the outstanding browser and hosted-worker checks above.
