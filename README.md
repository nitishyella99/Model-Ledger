# ModelLedger

## How to use the app

1. Open [ModelLedger](https://model-ledger-sigma.vercel.app/) and sign in or create an account.
2. Go to **Projects** and create a project for the AI model or application you want to test.
3. Open the project's **Versions** tab and add a version with its model settings and prompt.
4. Open that version and add test cases or import a CSV containing inputs and expected answers. You can start with the [sample CSV](examples/test-cases.csv).
5. To generate test cases, open **Test Case Generator**, describe your application and what you want to test, answer any follow-up questions, and review the generated cases before importing them.
6. Open **Run Evaluation**, select your project and version, and run the tests.
7. Open **Reports** to review results, failed cases, regressions, and recommendations.
8. To compare changes, add another version, import the same test cases, run an evaluation, and open **Compare** to review the versions side by side.

[Watch the walkthrough](https://youtu.be/iE3JqI9ffJc).

## Install and run locally

### Requirements

- Node.js 20.9 or newer and npm.
- Git, or a downloaded and extracted copy of this repository.
- Your own Supabase project and Clerk application.
- Credentials for the model provider you want to evaluate. AI test generation and report analysis also require a configured AI provider.

### 1. Download and install

```bash
git clone https://github.com/nitishyella99/Model-Ledger.git
cd Model-Ledger
npm ci
```

Alternatively, choose **Code → Download ZIP** on GitHub, extract the archive, open a terminal in the extracted folder, and run `npm ci`. Keep `package-lock.json` so npm installs the pinned dependency versions.

### 2. Create your environment file

Copy `.env.example` to `.env.local` in the project root.

Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

macOS/Linux:

```bash
cp .env.example .env.local
```

Fill in these values using your own service credentials:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR-SUPABASE-ANON-KEY
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=YOUR-CLERK-PUBLISHABLE-KEY
CLERK_SECRET_KEY=YOUR-CLERK-SECRET-KEY
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/dashboard

LLM_PROVIDER=nvidia-nim
LLM_MODEL=meta/llama-3.2-11b-vision-instruct
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_API_KEY=YOUR-NVIDIA-API-KEY

GUIDED_DEPLOYMENT_ENABLED=false
```

The NVIDIA values match the included environment template; choose a model available to your provider account. For another OpenAI-compatible provider, update `LLM_PROVIDER`, `LLM_MODEL`, and `LLM_BASE_URL`, remove the NVIDIA key, and set `LLM_API_KEY` to the appropriate API key. These server settings power test generation, AI analysis, and applicable evaluation services. Configure the model being tested separately in its version settings. Server credential references such as `NVIDIA_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, and `LLM_API_KEY` are restricted to their matching provider origin.

Leave the optional deployment credentials blank while `GUIDED_DEPLOYMENT_ENABLED=false`. Never commit `.env.local` or put secret keys in `NEXT_PUBLIC_*` variables. Downloads include the environment template, not working credentials.

### 3. Configure authentication

1. Create a Clerk application and enable sign-up and your chosen sign-in methods.
2. Copy its publishable and secret keys into `.env.local`.
3. Activate the Supabase integration in Clerk and copy the Clerk instance domain.
4. In Supabase Authentication, add Clerk as a native third-party authentication provider using that domain. Match the development or production Clerk instance to the environment you are running.

The app uses Clerk session tokens with Supabase row-level security. Use the native integration rather than a legacy JWT template. Each user owns private projects; a service-role key is not required for the standard workspace.

See [authentication setup](docs/clerk-setup.md) for additional configuration and ownership details.

### 4. Set up the database

For a new installation, use a fresh Supabase project. Open its SQL Editor and run every file in [supabase/migrations](supabase/migrations) in this exact order, one file at a time:

```text
20260927160400_create_modelledger_mvp_schema.sql
20260927173000_add_evaluation_result_test_key.sql
20260927173000_enable_demo_rls_and_integrity.sql
20260928073000_add_automatic_evaluation_pipeline.sql
20260928090000_add_evaluation_recommendations.sql
20260928234838_scope_test_cases_to_versions.sql
20261001134500_allow_version_editing.sql
20261002090000_clerk_project_ownership.sql
20261002120000_guided_model_deployment.sql
20261004090000_retire_model_storage_uploads.sql
```

Apply all ten files, including both with the `20260927173000` timestamp. Later migrations replace the early demo policies with ownership policies; do not rerun the demo policies afterward.

Copy the project's URL and public anon key into `.env.local`. Seed data is optional and its unassigned projects are not visible to newly registered accounts. Create your own project after signing in. For an existing installation, back up the database and apply only pending migrations in order.

See [Supabase setup](supabase/README.md) for migration recovery details.

### 5. Start the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), or the URL shown in the terminal if that port is occupied. Sign up, create a project and version, configure its model, import [the sample CSV](examples/test-cases.csv), and run an evaluation using the usage steps above. Restart the server whenever you change `.env.local`.

## Optional integrations

### Hindsight memory

To retain and recall lessons from earlier evaluations, add your Hindsight credentials:

```dotenv
HINDSIGHT_API_KEY=YOUR-HINDSIGHT-API-KEY
HINDSIGHT_BASE_URL=https://api.hindsight.vectorize.io
```

Leaving the key blank disables the integration. Core evaluations and reports can run without it.

### Guided model deployment

Uploading model folders, importing models from Hugging Face, and durable guided API evaluations require additional infrastructure. Keep `GUIDED_DEPLOYMENT_ENABLED=false` until you complete [the deployment setup guide](docs/model-deployment-setup.md).

The guide covers private Cloudflare R2 storage and CORS, a stable encryption key, Supabase service-role access, Modal installation and worker deployment, private control endpoint credentials, and user allowances. These features require operator configuration and may incur service costs. Python 3.11 or newer is needed for the documented worker package checks; Python is not required for the standard Next.js workspace.

The related environment variables are included in `.env.example`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `SUPABASE_SERVICE_ROLE_KEY`, `MODEL_CREDENTIAL_KEY_V1`, `MODAL_CONTROL_URL`, `MODAL_PROXY_TOKEN_ID`, `MODAL_PROXY_TOKEN_SECRET`, and `MODELLEDGER_DEPLOY_GPU`. Store secrets only on the server and worker. The guide also explains API-only operation with GPU hosting disabled.

## Production setup

Configure production Clerk domains and the matching Clerk–Supabase integration. Apply the database migrations and set the same environment variables on your hosting platform before building.

```bash
npm ci
npm run build
npm start
```

Deploy to a host that supports Next.js server actions, middleware, and API routes. A static-file host alone cannot run this application. Set browser-facing environment values before the build and keep server secrets in the host's environment settings.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local development. |
| `npm run build` | Build the production app. |
| `npm start` | Serve the production build. |
| `npm run lint` | Check code style and lint rules. |
| `npm run type-check` | Check TypeScript types. |
| `npm test` | Run the automated test suites, including isolated database ownership checks. |
| `npm run supabase:check` | Check Supabase connectivity using your configured environment. |
| `npm run worker:build` | Build the optional deployment worker. |
| `npm run deployment:check` | Check optional deployment infrastructure configuration. |

## Troubleshooting

- **Authentication is not configured:** add both Clerk keys, confirm they belong to the same instance, and restart the server.
- **Database or permission errors:** confirm the Supabase URL/key, the native Clerk integration, and all migrations. Sign in before opening workspace pages. Existing unassigned seed or legacy projects stay hidden.
- **Model authentication or connection errors:** check the version's endpoint, model identifier, and credentials. Server credential references must match the destination provider. Guided API endpoints must use public HTTPS; private-network endpoints are rejected.
- **AI generation or analysis unavailable:** check your `LLM_*` settings and provider key, model access, quota, and rate limits.
- **Guided deployment unavailable:** finish the linked infrastructure setup and allowance configuration before enabling it.
