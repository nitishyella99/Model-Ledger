# Integrated project and model onboarding

## Product decision

Creating a project includes adding its first model version and test suite. Users never visit a separate endpoint-creation screen. The deployment service creates and attaches an endpoint internally. A project workspace owns its model versions, deployment progress, tests, evaluations, and reports.

This document defines the intended interface and implementation contract. The guided implementation now exists behind `GUIDED_DEPLOYMENT_ENABLED`; follow [the infrastructure and pilot verification guide](model-deployment-setup.md) before enabling hosted model runs. Live deployment acceptance remains pending infrastructure configuration and the real-model smoke test.

## Create project screen

Use a dedicated, responsive page opened by the existing Create project action. Keep one form with three numbered sections and a persistent summary on desktop; place the summary above the submit button on mobile. Preserve entered values after validation errors.

Title: Create your model project

Description: Add your model and tests here. We will prepare the model and run your first evaluation when it is ready.

### 1. Project details

- Project name: required.
- What should your model do?: short description, used to guide test generation.
- First version: default V1, editable. Start with one version rather than requiring V1 and V2.

### 2. Add your model

Primary option: Upload model. Present a file picker and drop area for a supported model package. Display the supported architecture and package requirements before selection. Show file size, upload progress, resumable upload state, and a Replace action.

Alternative options within the same section: Import from Hugging Face and Connect an existing API. Switching options must preserve each option's entered values.

For repository import, collect the repository and optional revision; private repository credentials remain private. For an existing API, collect endpoint, exact model ID, and private credentials, and check the connection inside this form.

For uploaded weights, inspect configuration and tokenizer metadata and choose a supported serving recipe. Explain missing files inline. Do not promise automatic support for arbitrary model files or execute arbitrary uploaded code.

Show the detected model and resource estimate when available. If hosting incurs charges, show the estimate, resource limit, and idle shutdown behavior before submission. Place rare runtime options in Advanced settings. Do not expose an endpoint setup task for uploads.

### 3. Add tests

Offer Upload test CSV and Generate test prompts. Explain that generated prompts need reviewed expected answers before they can establish correctness.

Display a preview with test count and validation errors. Give a downloadable CSV template. The initial suite is shared for comparisons; later versions reuse the same inputs, expected results, and test identifiers by default.

Allow Save draft while tests or model details are incomplete. A draft remains in the same workspace with a specific Continue setup action. Do not start paid hosting for an incomplete draft unless the user explicitly chooses to deploy without evaluating.

### Submit and handoff

Primary action with a valid model and reviewed tests: Create project and evaluate.

Secondary action: Save draft.

Summary: project name, first version, model source, test count, and estimated hosting usage when available.

Submitting creates a single durable onboarding operation and immediately opens its project workspace. Repeated submissions reuse that operation rather than creating duplicate projects or deployments. Persist project, initial version, and deployment association consistently; external deployment is asynchronous and recoverable.

## Project workspace

The header shows the project name, selected version, model identity, and current status. Below it, one prominent activity panel explains what is happening and provides the next relevant action.

| State | Message | Main action |
| --- | --- | --- |
| Draft | Finish adding your model and tests. | Continue setup |
| Uploading | Uploading your V1 model: percentage and transferred size. | Resume upload when interrupted |
| Validating | Checking model files and compatibility. | View model details |
| Missing files | Add the named files to continue. | Replace model package |
| Preparing | Preparing your model to answer test requests. | View progress |
| Model startup failed | Explain the concrete failure and preserve tests. | Retry preparation or correct model |
| Needs tests | Your model is ready. Add reviewed tests to evaluate it. | Add tests |
| Evaluating | Testing V1: completed cases out of total. | View live results |
| Evaluation failed | Explain the failure and preserve completed results. | Retry evaluation |
| Report ready | Your V1 report is ready, with pass and failure counts. | View report |
| Paused | Hosting is paused to reduce usage. | Resume and evaluate |

Progress comes from persisted upload, deployment, and run records, never timers simulating success. Refreshing the page or reopening the project restores the current state. Cancellation stops queued work and requests deployment shutdown when applicable. A deployment failure does not delete the project or send the user back through project creation.

Workspace tabs: Overview, Versions, Tests, Reports. Model settings belong to the version; endpoint details are available in Advanced details for troubleshooting.

## Add V2

The project overview and first report include Add a version and compare. This opens the same embedded model section with the project preselected, version defaulted to V2, and Use existing test suite selected.

The user uploads the updated model or connects its API, reviews the shared test suite, and clicks Prepare V2 and compare. The app deploys V2, evaluates it, and opens the comparison once both versions have comparable results. If V1 lacks a baseline run, explain that and offer Run baseline and compare in the same flow.

Offer extra version-specific tests separately. Compare unchanged shared cases for regressions; label new or changed tests separately so different test difficulty is not presented as a model improvement.

## Implementation mapping

- Replace the current project-creation modal with the integrated creation screen while preserving its project, version, and CSV functionality.
- Add authenticated ownership for projects, model artifacts, credentials, deployments, and runs.
- Upload large model files directly to private object storage using scoped resumable upload sessions; do not route model weights through a Next.js server action.
- Add durable deployment and onboarding records linked to each model version, including status, artifact revision, runtime recipe, endpoint, failure reason, and job identifier.
- Provision supported inference workers through a configured hosting backend. Store credentials privately and resolve them by user/version rather than requiring visitors to name server environment variables.
- After a deployment health check, save its exact model ID and OpenAI-compatible endpoint into the existing executable version configuration.
- Dispatch the existing evaluation logic through a background job after model readiness and test validation. Use idempotent job transitions and retry controls.
- Remove the model-name substitution that can replace selected model identifiers. Uploaded/custom model versions must never silently fall back to NVIDIA.
- Add version-aware setup guidance to the project overview and replace competing primary actions with the one action appropriate to the persisted state.
- Configure the hosting backend and private storage before enabling the production upload/deploy submission. A selectable upload mock must not claim the model is deployed or evaluated.

## Acceptance criteria

1. A new user can create a project, attach V1, add reviewed tests, and start evaluation from one creation flow.
2. Uploading a model never requires independently creating or copying an endpoint.
3. The workspace always explains the current state and the next relevant action.
4. Failed uploads, failed deployments, and missing tests preserve the project and entered data.
5. Adding V2 reuses the baseline suite by default and associates the new deployment with V2 only.
6. Reports record the actual executed model and test revision.
7. Upload/deploy readiness and errors are backed by real service state.
