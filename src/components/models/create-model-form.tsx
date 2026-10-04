"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@clerk/nextjs";
import type { ModelUpload } from "@/lib/deployment/upload-client";
import { ArrowLeft, ArrowRight, FileUp, Plus, RotateCcw, Trash2, Upload as UploadIcon, X } from "lucide-react";
import { emptySettings } from "@/lib/deployment/types";
import { validateManifest, validateModelConfig } from "@/lib/deployment/validation";
import { uploadModelFiles } from "@/lib/deployment/upload-client";
import type {
  CreateModelActionState,
  createModelAction,
} from "@/app/models/actions";

type CreateModelFormProps = Readonly<{
  action: typeof createModelAction;
  initialActionState: CreateModelActionState;
  importAction?: React.ReactNode;
  defaultOpen?: boolean;
}>;

function FieldError({ message }: Readonly<{ message?: string }>) {
  if (!message) {
    return null;
  }

  return <p className="text-xs font-medium text-rose-700">{message}</p>;
}

const projectTypes = [
  "AI Assistant",
  "RAG Application",
  "AI Agent",
  "Prompt",
  "Other",
];

const template =
  "stable_key,name,category,input,expected_output,evaluator_type,threshold,severity,tags\nrefund-policy,Refund Policy,policy,\"Customer asks for a late refund.\",\"Decline politely and cite the refund window.\",contains,0.8,HIGH,policy;refund";

const initialVersions = [
  { id: "version-1", name: "V1" },
  { id: "version-2", name: "V2" },
];

export function CreateModelForm({
  action,
  initialActionState,
  defaultOpen = false,
}: CreateModelFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const { session } = useSession();
  const savedProject = useRef<CreateModelActionState | null>(null);
  const activeUpload = useRef<ModelUpload | null>(null);
  const uploadActive = useRef(true);
  const modelInput = useRef<HTMLInputElement>(null);
  const modelHeading = useRef<HTMLHeadingElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [modelVersionKey, setModelVersionKey] = useState("version-1");
  const [modelFiles, setModelFiles] = useState<File[]>([]);
  const [modelError, setModelError] = useState("");
  const [checkingModel, setCheckingModel] = useState(false);
  const [uploadBytes, setUploadBytes] = useState(0);
  const [details, setDetails] = useState({ name: "", provider: "", purpose: "" });
  const [submitted, setSubmitted] = useState(false);
  const nextVersionId = useRef(3);
  const [isManuallyOpen, setIsOpen] = useState(defaultOpen);
  const isOpen = isManuallyOpen || searchParams.get("create") === "true";
  const [versions, setVersions] = useState(initialVersions);
  const [state, formAction, isPending] = useActionState(
    async (previous: CreateModelActionState, data: FormData): Promise<CreateModelActionState> => {
      setSubmitted(true);
      if (checkingModel || modelError) return { status: "error", message: "Choose a compatible model folder or remove it to upload later." };
      const selectedIndex = versions.findIndex(version => version.id === modelVersionKey);
      if (modelFiles.length && selectedIndex < 0) return { status: "error", message: "Choose a version for your model." };
      const result = savedProject.current || await action(previous, data);
      if (result.status !== "success" || !result.createdProjectId) { setStep(1); return result; }
      savedProject.current = result;
      if (!modelFiles.length) return result;
      try {
        if (!session) throw new Error("Sign in again before uploading your model.");
        const version = result.createdVersions?.[selectedIndex];
        if (!version) throw new Error("The selected version could not be found. Continue from Upload Model.");
        const manifest = modelFiles.map(file => ({ path: file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(1).join("/") : file.name, size: file.size, modified: file.lastModified }));
        const response = await fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: String(data.get("name") || ""), purpose: String(data.get("purpose") || ""), version: version.version, projectId: result.createdProjectId, versionId: version.id, idempotencyKey: crypto.randomUUID(), settings: { ...emptySettings, files: manifest, displayName: modelFiles[0]?.webkitRelativePath.split("/")[0] || "Uploaded model" }, csv: "", intent: "upload" }) });
        const context = await response.json();
        if (!response.ok) throw new Error(context.error);
        await uploadModelFiles({ operation: context.operation, files: modelFiles, manifest, owner: session.user.id,
          getToken: () => session.getToken(), onProgress: setUploadBytes,
          onUpload: upload => { activeUpload.current = upload; }, isActive: () => uploadActive.current,
        });
        return { ...result, message: `${result.message} Model uploaded to ${version.version}.` };
      } catch (error) {
        return { ...result, status: "error", message: `Your project is created. ${error instanceof Error ? error.message : "Model upload could not finish."} Retry the upload or open your project to upload later.` };
      }
    },
    initialActionState,
  );

  const handleClose = useCallback(() => {
    if (isPending) return;
    uploadActive.current = false;
    void activeUpload.current?.abort();
    setIsOpen(false);
    if (searchParams.get("create") === "true") {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("create");
      const newQuery = params.toString();
      router.replace(newQuery ? `${pathname}?${newQuery}` : pathname, { scroll: false });
    }
  }, [isPending, pathname, router, searchParams]);

  useEffect(() => {
    uploadActive.current = true;
    return () => { uploadActive.current = false; void activeUpload.current?.abort(); };
  }, []);

  function nextStep() {
    if (!formRef.current?.reportValidity()) return;
    if (!versions.some(version => version.id === modelVersionKey)) setModelVersionKey(versions[0].id);
    setStep(2);
    requestAnimationFrame(() => modelHeading.current?.focus());
  }

  async function selectModel(selected: File[]) {
    setCheckingModel(true); setModelFiles([]); setModelError(""); setUploadBytes(0);
    try {
      if (!selected.length) return;
      const manifest = selected.map(file => ({ path: file.webkitRelativePath ? file.webkitRelativePath.split("/").slice(1).join("/") : file.name, size: file.size, modified: file.lastModified }));
      const issue = validateManifest(manifest); if (issue) throw new Error(issue);
      const config = selected[manifest.findIndex(file => file.path === "config.json")];
      const configIssue = validateModelConfig(JSON.parse(await config.text())); if (configIssue) throw new Error(configIssue);
      setModelFiles(selected);
    } catch (error) { setModelError(error instanceof Error ? error.message : "Model folder could not be checked."); }
    finally { setCheckingModel(false); }
  }

  useEffect(() => {
    if (submitted && !isPending && state.status === "success") {
      router.refresh();
      if (state.createdProjectId) {
        const timer = setTimeout(() => {
          handleClose();
          router.push(`/projects/${state.createdProjectId}`);
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [handleClose, router, state.status, state.createdProjectId, submitted, isPending]);

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => { uploadActive.current = true; savedProject.current = null; setSubmitted(false); setDetails({ name: "", provider: "", purpose: "" }); setVersions(initialVersions); nextVersionId.current = 3; setModelVersionKey("version-1"); setStep(1); setModelFiles([]); setModelError(""); setUploadBytes(0); setIsOpen(true); }}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-stone-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-stone-800"
        >
          <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Create Project
        </button>
      </div>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-stone-950/35 p-4 sm:items-center sm:justify-center"
          role="presentation"
          onMouseDown={handleClose}
        >
          <form
            ref={formRef}
            action={formAction}
            onSubmit={event => { if (step === 1) { event.preventDefault(); nextStep(); } }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-stone-200 bg-white shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <h2 id="create-project-title" className="text-lg font-semibold text-stone-950">
                  Create Project
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  {step === 1 ? "Step 1 of 2 · Project details, versions, and test cases" : "Step 2 of 2 · Add a model (optional)"}
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={handleClose}
                className="inline-flex size-9 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-950"
                aria-label="Close create project dialog"
              >
                <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            {submitted && !isPending && state.message ? (
              <div
                role={state.status === "error" ? "alert" : "status"}
                className={[
                  "mx-5 mt-4 rounded-md border px-4 py-3 text-sm font-medium",
                  state.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-rose-200 bg-rose-50 text-rose-800",
                ].join(" ")}
              >
                <p>{state.message}</p>
                {state.createdProjectId ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/projects/${state.createdProjectId}`}
                      onClick={handleClose}
                      className="inline-flex h-8 items-center justify-center rounded-md bg-stone-950 px-3 text-xs font-semibold text-white transition-colors hover:bg-stone-800"
                    >
                      Open New Project
                    </Link>
                    <Link
                      href={`/run-evaluation?project=${state.createdProjectId}`}
                      onClick={handleClose}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-stone-300 bg-white px-3 text-xs font-semibold text-stone-800 transition-colors hover:bg-stone-50"
                    >
                      Run Evaluation
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className={step === 1 ? "grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(380px,1.1fr)] lg:overflow-hidden" : "hidden"}>
              <section className="grid content-start gap-4 lg:sticky lg:top-0">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm">
                    <span className="font-semibold text-stone-950">
                      Project name
                    </span>
                    <input
                      name="name"
                      value={details.name}
                      onChange={event => setDetails(current => ({ ...current, name: event.target.value }))}
                      required
                      maxLength={120}
                      disabled={isPending}
                      aria-invalid={Boolean(state.fieldErrors?.name)}
                      className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                    />
                    <FieldError message={state.fieldErrors?.name} />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span className="font-semibold text-stone-950">
                      What are you testing?
                    </span>
                    <select
                      name="provider"
                      value={details.provider}
                      onChange={event => setDetails(current => ({ ...current, provider: event.target.value }))}
                      required
                      disabled={isPending}
                      aria-invalid={Boolean(state.fieldErrors?.provider)}
                      className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                    >
                      <option value="" disabled>
                        Choose project type
                      </option>
                      {projectTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <FieldError message={state.fieldErrors?.provider} />
                  </label>
                </div>
                <label className="grid gap-2 text-sm">
                  <span className="font-semibold text-stone-950">
                    Short description
                  </span>
                  <textarea
                    name="purpose"
                    value={details.purpose}
                    onChange={event => setDetails(current => ({ ...current, purpose: event.target.value }))}
                    required
                    maxLength={1000}
                    rows={4}
                    disabled={isPending}
                    aria-invalid={Boolean(state.fieldErrors?.purpose)}
                    className="resize-y rounded-md border border-stone-200 bg-white px-3 py-2 text-sm leading-6 text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                  />
                  <FieldError message={state.fieldErrors?.purpose} />
                </label>
                <div className="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
                  <p className="leading-6 text-stone-600">
                    Don&apos;t have test cases for your model? Visit our Test
                    Case Generator, explain your app, generate model-ready test
                    cases, and download them as a CSV.
                  </p>
                  <Link
                    href="/test-case-generator"
                    className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-stone-950 transition-colors hover:text-stone-700"
                    onClick={() => setIsOpen(false)}
                  >
                    Visit website
                    <ArrowRight className="size-4" strokeWidth={1.8} aria-hidden="true" />
                  </Link>
                </div>

              </section>

              <section className="flex min-h-0 flex-col rounded-md border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileUp className="size-4 text-stone-500" strokeWidth={1.8} aria-hidden="true" />
                      <h3 className="text-sm font-semibold text-stone-950">
                        Versions and CSV files
                      </h3>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      Add each version and attach its own CSV file beside it.
                      Files are stored under the matching version.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setVersions((current) => [
                        ...current,
                        {
                          id: `version-${nextVersionId.current++}`,
                          name: `V${current.length + 1}`,
                        },
                      ])
                    }
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-100 active:translate-y-px"
                  >
                    <Plus className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    Add version
                  </button>
                </div>

                <div className="mt-4 grid gap-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {versions.map((version, index) => (
                    <div
                      key={version.id}
                      className="grid gap-3 rounded-md border border-stone-200 bg-stone-50 p-3"
                    >
                      <div className="grid gap-3 sm:grid-cols-[minmax(120px,1fr)_minmax(190px,1.2fr)_40px] sm:items-end">
                        <label className="grid gap-2 text-sm">
                          <span className="font-semibold text-stone-950">
                            Version {index + 1}
                          </span>
                          <input
                            name="versions"
                            required
                            maxLength={80}
                            value={version.name}
                            disabled={isPending}
                            onChange={(event) => {
                              const nextVersion = event.target.value;
                              setVersions((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, name: nextVersion }
                                    : item,
                                ),
                              );
                            }}
                            className="h-10 min-w-0 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
                          />
                        </label>
                        <label className="grid gap-2 text-sm">
                          <span className="font-semibold text-stone-950">
                            CSV for{" "}
                            {version.name.trim() || `version ${index + 1}`}
                          </span>
                          <input
                            name="versionCsvFile"
                            type="file"
                            accept=".csv,text/csv"
                            disabled={isPending}
                            className="block h-10 w-full rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-700 file:mr-2 file:rounded file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-stone-800 hover:bg-stone-50"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={isPending || versions.length === 1}
                          onClick={() =>
                            setVersions((current) =>
                              current.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                          className="inline-flex size-10 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-950 disabled:cursor-not-allowed disabled:text-stone-300"
                          aria-label={`Remove version ${index + 1}`}
                        >
                          <Trash2 className="size-4" strokeWidth={1.8} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <FieldError message={state.fieldErrors?.versions} />
                <FieldError message={state.fieldErrors?.csv} />
                <a
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}
                  download="modelledger-test-cases-template.csv"
                  className="mt-4 inline-flex h-8 items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
                >
                  Download template
                </a>
              </section>
            </div>
            <div className={step === 2 ? "min-h-0 flex-1 space-y-5 overflow-y-auto p-5" : "hidden"}>
              <div><h3 ref={modelHeading} tabIndex={-1} className="text-lg font-semibold text-stone-950 outline-none">Add your model <span className="ml-2 rounded bg-stone-100 px-2 py-1 text-xs font-normal text-stone-600">Optional</span></h3><p className="mt-2 text-sm leading-6 text-stone-600">Upload a model for one of your project versions now, or create your project and upload it later from Upload Model. You’ll need a model or a connected API to evaluate your tests.</p></div>
              <section className="space-y-4 rounded-md border border-stone-200 bg-stone-50 p-5" aria-label="Optional model upload">
                <label className="grid max-w-sm gap-2 text-sm"><span className="font-semibold text-stone-950">Project version for this model</span><select value={modelVersionKey} disabled={isPending || (submitted && Boolean(state.createdProjectId))} onChange={event => setModelVersionKey(event.target.value)} className="h-10 rounded-md border border-stone-200 bg-white px-3">{versions.map(version => <option key={version.id} value={version.id}>{version.name}</option>)}</select></label>
                <div className="rounded-md border border-dashed border-stone-300 bg-white p-5"><UploadIcon className="size-5 text-stone-500" aria-hidden="true" /><label className="mt-3 grid gap-2 text-sm"><span className="font-semibold text-stone-950">Choose model folder</span><input ref={modelInput} type="file" multiple {...{ webkitdirectory: "", directory: "" }} disabled={isPending || checkingModel} onChange={event => void selectModel(Array.from(event.target.files || []))} className="block w-full text-sm" /></label><p className="mt-3 text-xs leading-5 text-stone-500">Upload a complete Llama, Mistral, or Qwen2 folder with config.json, tokenizer files, and Safetensors weights.</p></div>
                <p role="status" className="text-sm text-stone-600">{checkingModel ? "Checking model folder…" : modelFiles.length ? `${modelFiles.length} files · ${(modelFiles.reduce((sum, file) => sum + file.size, 0) / 1e9).toFixed(2)} GB · Model will upload after the project is created.` : "No model selected. You can still create your project and upload later."}</p>
                {modelError && <p role="alert" className="text-sm text-rose-700">{modelError}</p>}
                {(modelFiles.length > 0 || modelError) && <button type="button" disabled={isPending || checkingModel} onClick={() => { setModelFiles([]); setModelError(""); if (modelInput.current) modelInput.current.value = ""; }} className="text-sm font-semibold text-stone-700 underline">Remove model and upload later</button>}
                {isPending && modelFiles.length > 0 && <div role="status"><progress className="w-full" value={uploadBytes} max={modelFiles.reduce((sum, file) => sum + file.size, 0)} aria-label="Model upload progress" /><p className="mt-2 text-xs text-stone-500">{(uploadBytes / 1e9).toFixed(2)} GB uploaded. Keep this popup open until the upload finishes.</p></div>}
              </section>
            </div>
            <div className="shrink-0 flex flex-col gap-2 border-t border-stone-200 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-stone-500">
                {step === 1 ? "CSV files are optional. Next, you can add a model before creating your project." : "Adding a model is optional. Create your project now and upload later if needed."}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {step === 2 && <button type="button" disabled={isPending || (submitted && Boolean(state.createdProjectId))} onClick={() => setStep(1)} className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700"><ArrowLeft className="size-4" aria-hidden="true" />Back</button>}
                {step === 1 && <button
                  type="reset"
                  disabled={isPending}
                  onClick={() => {
                    nextVersionId.current = 3;
                    setVersions(initialVersions);
                    setModelVersionKey("version-1");
                    setModelFiles([]); setModelError("");
                    setDetails({ name: "", provider: "", purpose: "" }); setSubmitted(false);
                  }}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
                >
                  <RotateCcw className="size-4" strokeWidth={1.8} aria-hidden="true" />
                  Reset
                </button>}
                <button
                  type={step === 1 ? "button" : "submit"}
                  onClick={step === 1 ? nextStep : undefined}
                  disabled={isPending || checkingModel || (step === 2 && Boolean(modelError))}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px"
                >
                  {step === 1 ? <ArrowRight className="size-4" aria-hidden="true" /> : <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />}
                  {step === 1 ? "Next" : isPending ? modelFiles.length ? "Creating and uploading…" : "Creating…" : submitted && state.createdProjectId ? modelFiles.length ? "Retry upload" : "Open Project" : "Create Project"}
                </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
