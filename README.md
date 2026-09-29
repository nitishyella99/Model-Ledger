# ModelLedger

ModelLedger is a Next.js application for evaluating AI model changes before they reach users. It helps teams register model projects, version prompts and configurations, import test cases, run automated evaluations, compare model versions, and inspect regressions with Supabase-backed reports.

## Try the App

Vercel app link: [https://model-ledger-sigma.vercel.app/](https://model-ledger-sigma.vercel.app/)

How to use the app: [https://youtu.be/iE3JqI9ffJc](https://youtu.be/iE3JqI9ffJc)

## Features

- Project and model registry for tracking AI applications.
- Version history for prompts, provider settings, and model configuration changes.
- Test case management with CSV import support.
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

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- A Supabase project or local Supabase instance
- API credentials for the model provider you want to evaluate

### Installation

```bash
npm install
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
HINDSIGHT_API_KEY=
HINDSIGHT_BASE_URL=https://api.hindsight.vectorize.io
LLM_PROVIDER=nvidia-nim
LLM_MODEL=meta/llama-3.2-11b-vision-instruct
NVIDIA_API_KEY=
LLM_BASE_URL=https://integrate.api.nvidia.com/v1
```

`LLM_BASE_URL` can point to any OpenAI-compatible `/v1` endpoint. Supported provider defaults include NVIDIA NIM, Groq, and OpenAI-compatible APIs.

### Database Setup

Apply the Supabase migrations in `supabase/migrations` to create the ModelLedger schema, demo policies, evaluation pipeline tables, recommendations, and version-scoped test cases.

The demo RLS policies are designed for an MVP workflow and allow anonymous reads and limited writes required by the app. Replace them with authenticated, ownership-aware policies before using this in production.

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
2. Create versions for that project so each prompt, provider, or configuration change is tracked separately.
3. Import test cases into each version. These tests define the expected behavior that ModelLedger will evaluate.
4. Run an evaluation for the selected project and version.
5. Open the generated report to review pass rates, failures, regressions, latency, token usage, and recommendations.

## Security Notes

- Do not commit `.env.local` or any real provider keys.
- Only expose Supabase anon keys through `NEXT_PUBLIC_*` variables.
- Do not place service-role keys in browser-facing code.
- Replace demo RLS policies before production deployment.

## Contributing

1. Create a feature branch.
2. Make focused changes with tests when behavior changes.
3. Run `npm run lint`, `npm run type-check`, and `npm test`.
4. Open a pull request with a clear summary and verification notes.


