# ModelLedger

ModelLedger is a Next.js application for evaluating AI model changes before they reach users. It helps teams register model projects, version prompts and configurations, import test cases, run automated evaluations, compare model versions, and inspect regressions with Supabase-backed reports.

## Download and run

Download this repository using **Code → Download ZIP**, extract it, and open a terminal in the extracted folder. You can also clone it:

```bash
git clone https://github.com/nitishyella99/Model-Ledger.git
cd Model-Ledger
npm ci
```

Use Node.js 20.9 or newer (Node.js 22 LTS recommended). The lockfile is included so `npm ci` installs the same dependency versions.

1. Copy `.env.example` to `.env.local`. On Windows PowerShell, run `Copy-Item .env.example .env.local`; on macOS/Linux, run `cp .env.example .env.local`.
2. Create your own Supabase and Clerk projects. Fill in the Supabase URL/anon key and Clerk publishable/secret keys in `.env.local`. Complete the native Clerk–Supabase integration described in [Clerk setup](docs/clerk-setup.md).
3. In your Supabase SQL Editor, run **every** file in `supabase/migrations/` in filename order, one file at a time. Include both files starting with `20260927173000`. Start with a fresh database. The included seed is optional and its unassigned projects are not visible to new accounts; create your own project after signing in.
4. Set `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, and your provider API key for AI test generation and analysis. The default example uses NVIDIA NIM. For another OpenAI-compatible endpoint, use `LLM_API_KEY` and update the provider, model, and base URL. Model-version evaluation credentials are configured in the app.
5. Run `npm run dev` and open [localhost:3000](http://localhost:3000). The app opens at login, which explains the product. Create an account, create a project and version, import [the included sample CSV](examples/test-cases.csv), then run an evaluation and open its report.

Authentication, a configured database, and model-provider credentials are necessary to use the full application. Repository downloads do not include credentials or access to the original owner's services. Hindsight memory is optional: leave its key blank to run without it. Guided deployment is optional and stays disabled until its separate [setup](docs/model-deployment-setup.md) is complete.

For a production server:

```bash
npm run build
npm start
```

Before publishing your own deployment, configure the production Clerk domain/integration and the same environment variables on your host. The server must support Next.js server actions and API routes.

The multi-user guided deployment pilot combines project creation, model folders/Hugging Face imports/API connections, and reviewed tests in one flow, with durable progress and a next-step panel. It is disabled until private Cloudflare R2 storage, Modal workers, credentials, and user allowances are configured. See [deployment setup and live verification](docs/model-deployment-setup.md).

## Try the App

Vercel app link: [https://model-ledger-sigma.vercel.app/](https://model-ledger-sigma.vercel.app/)

How to use the app: [https://youtu.be/iE3JqI9ffJc](https://youtu.be/iE3JqI9ffJc)

Sample CSV files for testing: [Download ZIP from Google Drive](https://drive.google.com/file/d/1mDzv6pnQpN2T8f_uxmTLkShvqJ68-e7M/view?usp=drive_link)

The ZIP contains sample `V1`, `V2`, and `V3` CSV files that judges can use to test the full ModelLedger workflow without preparing their own data.

## Judge Demo Checklist

Follow every step in order. ModelLedger depends on the relationship between a project, its versions, and the test cases uploaded for each version. If a project, version, or CSV upload step is skipped, the evaluation cannot produce a meaningful report and the app may look like it failed.

1. Open the live app: [https://model-ledger-sigma.vercel.app/](https://model-ledger-sigma.vercel.app/)
2. Download the sample ZIP file: [ModelLedger sample CSV files](https://drive.google.com/file/d/1mDzv6pnQpN2T8f_uxmTLkShvqJ68-e7M/view?usp=drive_link)
3. Create a new project from the Projects page.
4. Go to the Versions tab and create three versions for that project:
   - `v1`
   - `v2`
   - `v3`
5. Open each version and import the matching CSV file:
   - Upload the `V1` CSV into version `v1`
   - Upload the `V2` CSV into version `v2`
   - Upload the `V3` CSV into version `v3`
6. Confirm that test cases are visible after each CSV import.
7. Run an evaluation for the project/version you want to inspect.
8. Open the generated report from the Reports page to review pass rates, failures, regressions, latency, token usage, and recommendations.
9. Use the Compare page to compare versions and see how behavior changed across `v1`, `v2`, and `v3`.

## Features

- Project and model registry for tracking AI applications.
- Version history for prompts, provider settings, and model configuration changes.
- Test case management with CSV import support.
- AI test generation from model context, with validated prompt-only cases and review CSV downloads.
- Automated evaluation runs against OpenAI-compatible providers.
- Evaluation reports with pass rates, failures, token usage, latency, and estimated cost.
- Version comparison views for spotting regressions between model releases.
- Recommendation analysis for failed or degraded evaluations.
- Hindsight memory integration for retaining lessons from prior failures.
- Supabase schema migrations and seed data for local development.

## Tech Stack

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase
- NVIDIA NIM / OpenAI-compatible chat completion APIs
- Vectorize Hindsight client
- Node.js test runner

## AI Test Generator

Open `/test-case-generator`, describe your system and testing focus, and select 5, 8, 10, 12, or 15 cases. The server calls the AI provider configured by `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, and the provider API key. Credentials stay on the server. Insufficient context prompts a follow-up question before generation.

The pipeline validates the response structure, removes duplicate prompts and answer instructions, and retries invalid model output once. Provider errors and timeouts are shown in the conversation; they do not produce template cases. Downloads use the project importer's CSV columns. Fill in `expected_output` after reviewing each prompt before importing the file and running an evaluation.

## Authentication

The app opens directly at Clerk sign-in, where the page explains ModelLedger and its evaluation workflow. The former marketing pages have been removed; their URLs redirect visitors to sign-in and signed-in users to `/dashboard`. Account creation and recovery remain available through Clerk. Workspace requests preserve the requested destination through login. Anonymous API, RPC, and report-export requests return JSON with status `401`. Newly added routes require login unless explicitly included in `src/lib/public-routes.ts`.

Sign up or sign in through Clerk to access your private projects. Account management and logout are available in the topbar. Configure Clerk before running the app: [setup and rollout](docs/clerk-setup.md).

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- A Supabase project or local Supabase instance
- API credentials for the model provider you want to evaluate

### Installation

```bash
npm ci
```

### Environment Variables

Copy the example environment file and fill in your local values:

```bash
cp .env.example .env.local
```

Required variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
HINDSIGHT_API_KEY=
HINDSIGHT_BASE_URL=https://api.hindsight.vectorize.io
LLM_PROVIDER=nvidia-nim
LLM_MODEL=meta/llama-3.2-11b-vision-instruct
NVIDIA_API_KEY=
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
```

`LLM_BASE_URL` can point to any OpenAI-compatible `/v1` endpoint. Supported provider defaults include NVIDIA NIM, Groq, and OpenAI-compatible APIs.

### Database Setup

Apply the Supabase migrations in `supabase/migrations` to create the ModelLedger schema, evaluation pipeline tables, recommendations, version-scoped test cases, and ownership policies.

Clerk authentication and ownership-aware Supabase policies isolate each user’s projects. Apply all migrations, including `20261002090000_clerk_project_ownership.sql`, before serving this version. Existing projects remain unassigned and private. See [authentication setup](docs/clerk-setup.md) for the required dashboard configuration and rollout checks.

### Development

```bash
npm run dev
```

Open the local Next.js URL shown in your terminal.

## Available Scripts

```bash
npm run dev
npm run build
npm run lint
npm run type-check
npm test
npm run supabase:check
```

- `npm run dev` starts the development server.
- `npm run build` creates a production build.
- `npm run lint` runs ESLint.
- `npm run type-check` runs TypeScript checks without emitting files.
- `npm test` compiles and runs the evaluation, pipeline, AI analysis, and hindsight memory tests.
- `npm run supabase:check` validates Supabase connectivity.

## Project Structure

```text
src/app             Next.js routes, pages, and server actions
src/components      Reusable UI and product components
src/lib/ai          AI analysis schemas, prompts, and client logic
src/lib/data        Supabase data access helpers
src/lib/evaluation  Evaluation engine, metrics, reporting, and orchestration
src/lib/hindsight   Hindsight memory client and formatting helpers
src/types           Shared TypeScript types
supabase            Database migrations, seed data, and Supabase notes
tests               Node test-runner suites
scripts             Local validation and test scripts
```

## Evaluation Flow

1. Create a project for the AI application you want to evaluate.
2. Add one or more model versions with provider settings and prompts.
3. Import or create test cases for the project.
4. Run an evaluation against a selected version.
5. Review pass rates, failures, regressions, latency, token usage, and cost.
6. Compare versions and use recommendations to decide what to fix next.

## How to Create a Report

1. Create a project for the AI application or model workflow you want to test.
2. Create one or more versions for that project from the Versions tab.
3. Open each version and upload/import its test cases. For the provided judge demo data, create `v1`, `v2`, and `v3`, then upload the matching `V1`, `V2`, and `V3` CSV files into those versions.
4. Check that the imported test cases are visible before running an evaluation.
5. Run an evaluation for the selected project and version.
6. Open the generated report to review pass rates, failures, regressions, latency, token usage, and recommendations.

Important: a report needs all required setup data. Create the project first, create the versions second, upload test cases third, and run evaluation last.

## Security Notes

- Do not commit `.env.local` or any real provider keys.
- Only expose Supabase anon keys through `NEXT_PUBLIC_*` variables.
- Do not place service-role keys in browser-facing code.
- Apply the Clerk ownership migration and configure the native third-party integration before deployment.

## Contributing

1. Create a feature branch.
2. Make focused changes with tests when behavior changes.
3. Run `npm run lint`, `npm run type-check`, and `npm test`.
4. Open a pull request with a clear summary and verification notes.
