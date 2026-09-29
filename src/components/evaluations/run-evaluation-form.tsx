"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ClipboardCheck,
  Download,
  FileUp,
  Play,
  Plus,
  Search,
} from "lucide-react";
import type { RunEvaluationActionState } from "@/app/run-evaluation/actions";
import type { TestCaseActionState } from "@/app/tests/actions";

type SelectOption = Readonly<{
  label: string;
  value: string;
}>;

type VersionOption = SelectOption &
  Readonly<{
    modelId: string;
  }>;

type TestCaseOption = Readonly<{
  id: string;
  modelId: string;
  modelVersionId: string | null;
  stableKey: string;
  name: string;
  category: string;
  evaluatorType: string;
  threshold: number;
  severity: string;
  input: string;
  expectedOutput: string;
  tags: string[];
}>;

type ConfigurationOption = Readonly<{
  modelVersionId: string;
  provider: string;
  modelName: string;
  baseUrl: string | null;
  credentialReference: string;
  temperature: number;
  maxTokens: number | null;
}>;

type RunEvaluationFormProps = Readonly<{
  models: SelectOption[];
  versions: VersionOption[];
  testCases: TestCaseOption[];
  configurations: ConfigurationOption[];
  initialRunState: RunEvaluationActionState;
  initialTestCaseState: TestCaseActionState;
  runAction: (
    state: RunEvaluationActionState,
    formData: FormData,
  ) => Promise<RunEvaluationActionState>;
  createTestCaseAction: (
    state: TestCaseActionState,
    formData: FormData,
  ) => Promise<TestCaseActionState>;
  importCsvAction: (
    state: TestCaseActionState,
    formData: FormData,
  ) => Promise<TestCaseActionState>;
  initialModelId?: string;
  initialVersionId?: string;
}>;

const template =
  "stable_key,name,category,input,expected_output,evaluator_type,threshold,severity,tags\nrefund-policy,Refund Policy,policy,\"Customer asks for a late refund.\",\"Decline politely and cite the refund window.\",contains,0.8,HIGH,policy;refund";

function parseCsvPreview(csv: string) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const [header, ...rows] = lines;

  if (!header) {
    return [];
  }

  const headers = header.split(",").map((value) => value.trim().toLowerCase());
  const indexOf = (name: string) => headers.indexOf(name);

  return rows.slice(0, 8).map((row, index) => {
    const values = row.match(/("([^"]|"")*"|[^,]+)/g) ?? [];
    const clean = (value: string | undefined) =>
      (value ?? "").replace(/^"|"$/g, "").replaceAll('""', '"').trim();

    return {
      id: `${index}-${row}`,
      name: clean(values[indexOf("name")]),
      category: clean(values[indexOf("category")]),
      input: clean(values[indexOf("input")]),
      expected: clean(values[indexOf("expected_output")]),
      valid:
        Boolean(clean(values[indexOf("name")])) &&
        Boolean(clean(values[indexOf("category")])) &&
        Boolean(clean(values[indexOf("input")])) &&
        Boolean(clean(values[indexOf("expected_output")])),
    };
  });
}

async function readCsvFile(file: File | null) {
  if (!file) {
    return "";
  }

  return file.text();
}

function Step({
  number,
  title,
  children,
}: Readonly<{
  number: number;
  title: string;
  children: React.ReactNode;
}>) {
  return (
    <section className="rounded-md border border-stone-200 bg-white">
      <div className="flex items-center gap-3 border-b border-stone-200 p-4">
        <span className="grid size-7 place-items-center rounded-full bg-stone-950 text-xs font-semibold text-white">
          {number}
        </span>
        <h2 className="text-sm font-semibold text-stone-950">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function RunEvaluationForm({
  models,
  versions,
  testCases,
  configurations,
  initialRunState,
  initialTestCaseState,
  runAction,
  createTestCaseAction,
  importCsvAction,
  initialModelId,
  initialVersionId,
}: RunEvaluationFormProps) {
  const router = useRouter();
  const defaultModelId = initialModelId || models[0]?.value || "";
  const defaultVersionId =
    initialVersionId ||
    versions.find((version) => version.modelId === defaultModelId)?.value ||
    "";
  const [runState, runFormAction, isRunning] = useActionState(
    runAction,
    initialRunState,
  );
  const [createState, createFormAction, isCreating] = useActionState(
    createTestCaseAction,
    initialTestCaseState,
  );
  const [importState, importFormAction, isImporting] = useActionState(
    importCsvAction,
    initialTestCaseState,
  );
  const [modelId, setModelId] = useState(defaultModelId);
  const [modelVersionId, setModelVersionId] = useState(defaultVersionId);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [csv, setCsv] = useState("");

  useEffect(() => {
    if (runState.status === "success" && runState.createdEvaluationId) {
      router.push(`/reports/${runState.createdEvaluationId}`);
    }
  }, [router, runState]);

  useEffect(() => {
    if (createState.status === "success") {
      router.refresh();
    }
  }, [createState.status, router]);

  useEffect(() => {
    if (importState.status === "success") {
      router.refresh();
    }
  }, [importState.status, router]);

  const versionOptions = versions.filter((version) => version.modelId === modelId);
  const selectedVersion = versions.find((version) => version.value === modelVersionId);
  const configuration = configurations.find(
    (entry) => entry.modelVersionId === modelVersionId,
  );
  const projectTestsMap = new Map<string, TestCaseOption>();
  for (const testCase of testCases) {
    if (testCase.modelId !== modelId) continue;
    const key = testCase.stableKey || testCase.id;
    const existing = projectTestsMap.get(key);
    if (!existing) {
      projectTestsMap.set(key, testCase);
    } else if (
      modelVersionId &&
      testCase.modelVersionId === modelVersionId &&
      existing.modelVersionId !== modelVersionId
    ) {
      projectTestsMap.set(key, testCase);
    }
  }
  const modelTests = Array.from(projectTestsMap.values());
  const categories = [...new Set(modelTests.map((testCase) => testCase.category))].sort();
  const filteredTests = modelTests.filter((testCase) => {
    const text = `${testCase.name} ${testCase.category} ${testCase.stableKey} ${testCase.tags.join(" ")}`.toLowerCase();
    const matchesQuery = !query || text.includes(query.toLowerCase());
    const matchesCategory = category === "all" || testCase.category === category;

    return matchesQuery && matchesCategory;
  });
  const selectedTests = modelTests.filter((testCase) => selectedIds.has(testCase.id));
  const csvPreview = useMemo(() => parseCsvPreview(csv), [csv]);
  const canRun = Boolean(modelId && modelVersionId && configuration && selectedIds.size > 0);
  const configurationHref = modelVersionId ? `/versions/${modelVersionId}` : "/versions";

  function toggleTest(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  return (
    <div className="space-y-4">
      <Step number={1} title="Select Version">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-stone-950">Project</span>
            <select
              value={modelId}
              onChange={(event) => {
                setModelId(event.target.value);
                setModelVersionId("");
                setSelectedIds(new Set());
              }}
              className="h-10 rounded-md border border-stone-200 bg-white px-3"
            >
              {models.map((model) => (
                <option key={model.value} value={model.value}>
                  {model.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-stone-950">Version</span>
            <select
              value={modelVersionId}
              onChange={(event) => {
                setModelVersionId(event.target.value);
                setSelectedIds(new Set());
              }}
              className="h-10 rounded-md border border-stone-200 bg-white px-3"
            >
              <option value="">Select version</option>
              {versionOptions.map((version) => (
                <option key={version.value} value={version.value}>
                  {version.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </Step>

      <Step number={2} title="Confirm Model Configuration">
        {configuration ? (
          <dl className="grid gap-px overflow-hidden rounded-md border border-stone-200 bg-stone-200 sm:grid-cols-3">
            {[
              ["Provider", configuration.provider],
              ["Model", configuration.modelName],
              ["Credential", configuration.credentialReference],
              ["Base URL", configuration.baseUrl ?? "Default provider URL"],
              ["Temperature", String(configuration.temperature)],
              ["Max tokens", configuration.maxTokens?.toString() ?? "Provider default"],
            ].map(([label, value]) => (
              <div key={label} className="bg-white p-3">
                <dt className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-stone-950">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-sm font-medium leading-6 text-amber-950">
              Configure this model version before running an evaluation.
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              The evaluator needs a provider, model name, and server-side
              credential reference before it can call the model.
            </p>
            <Link
              href={configurationHref}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white"
            >
              Configure Version
            </Link>
          </div>
        )}
      </Step>

      <Step number={3} title="Select / Import Test Cases">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <div className="flex flex-col gap-2 md:flex-row">
              <label className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 size-4 text-stone-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tests"
                  className="h-10 w-full rounded-md border border-stone-200 bg-white pl-9 pr-3 text-sm"
                />
              </label>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm"
              >
                <option value="all">All categories</option>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  setSelectedIds(new Set(filteredTests.map((test) => test.id)))
                }
                className="h-10 rounded-md border border-stone-200 px-3 text-sm font-semibold"
              >
                Select visible
              </button>
            </div>
            <div className="mt-3 max-h-[420px] overflow-y-auto rounded-md border border-stone-200">
              {filteredTests.length === 0 ? (
                <div className="p-4 text-sm leading-6 text-stone-600">
                  <p className="font-medium text-stone-950">
                    {modelTests.length === 0
                      ? "No tests have been added for this project yet."
                      : "No canonical tests match this filter."}
                  </p>
                  <p className="mt-1">
                    Add a test manually or import CSV content from the panel on
                    the right. Successful saves refresh this list from Supabase.
                  </p>
                </div>
              ) : (
                filteredTests.map((testCase) => (
                  <label
                    key={testCase.id}
                    className="grid cursor-pointer gap-1 border-b border-stone-200 p-3 last:border-b-0 hover:bg-stone-50"
                  >
                    <span className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(testCase.id)}
                        onChange={() => toggleTest(testCase.id)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-stone-950">
                          {testCase.name}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                          {testCase.category} · {testCase.evaluatorType} · threshold{" "}
                          {testCase.threshold}
                        </span>
                      </span>
                    </span>
                    <span className="line-clamp-2 pl-7 text-sm text-stone-600">
                      {testCase.input}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="grid gap-3">
            <form action={createFormAction} className="rounded-md border border-stone-200 p-3">
              <input type="hidden" name="modelId" value={modelId} />
              <input type="hidden" name="modelVersionId" value={modelVersionId} />
              <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-950">
                <Plus className="size-4" /> Manual test
              </h3>
              <div className="mt-3 grid gap-2">
                <input name="name" placeholder="Name" className="h-9 rounded-md border border-stone-200 px-3 text-sm" />
                <input name="category" placeholder="Category" className="h-9 rounded-md border border-stone-200 px-3 text-sm" />
                <textarea name="input" placeholder="Input" rows={3} className="rounded-md border border-stone-200 px-3 py-2 text-sm" />
                <textarea name="expectedOutput" placeholder="Expected output" rows={3} className="rounded-md border border-stone-200 px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-2">
                  <select name="evaluatorType" className="h-9 rounded-md border border-stone-200 px-2 text-sm" defaultValue="contains">
                    <option value="exact_match">Exact match</option>
                    <option value="contains">Contains</option>
                    <option value="llm_judge">LLM judge</option>
                  </select>
                  <input name="threshold" defaultValue="0.8" className="h-9 rounded-md border border-stone-200 px-3 text-sm" />
                </div>
                <select name="severity" className="h-9 rounded-md border border-stone-200 px-2 text-sm" defaultValue="MEDIUM">
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
                <button disabled={isCreating} className="inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white">
                  {isCreating ? "Saving..." : "Save test"}
                </button>
                {createState.message ? <p className="text-xs text-stone-600">{createState.message}</p> : null}
              </div>
            </form>

            <form action={importFormAction} className="rounded-md border border-stone-200 p-3">
              <input type="hidden" name="modelId" value={modelId} />
              <input type="hidden" name="modelVersionId" value={modelVersionId} />
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-950">
                  <FileUp className="size-4" /> CSV import
                </h3>
                <a
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}
                  download="modelledger-test-cases-template.csv"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-stone-700"
                >
                  <Download className="size-3.5" /> Template
                </a>
              </div>
              <textarea
                name="csv"
                value={csv}
                onChange={(event) => setCsv(event.target.value)}
                placeholder={template}
                rows={6}
                className="mt-3 w-full rounded-md border border-stone-200 px-3 py-2 text-xs"
              />
              <label className="mt-3 grid gap-1 text-xs font-semibold text-stone-700">
                Upload CSV file
                <input
                  name="csvFile"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (event) => {
                    const text = await readCsvFile(event.target.files?.[0] ?? null);
                    setCsv(text);
                  }}
                  className="block w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-xs font-normal"
                />
              </label>
              {csvPreview.length > 0 ? (
                <div className="mt-2 rounded-md border border-stone-200">
                  {csvPreview.map((row) => (
                    <div key={row.id} className="border-b border-stone-200 p-2 text-xs last:border-b-0">
                      <span className={row.valid ? "text-emerald-700" : "text-rose-700"}>
                        {row.valid ? "Valid" : "Missing required field"}
                      </span>{" "}
                      {row.name || "Unnamed"} · {row.category || "No category"}
                    </div>
                  ))}
                </div>
              ) : null}
              <button disabled={isImporting || !modelVersionId} className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-300">
                {isImporting ? "Importing..." : "Import CSV"}
              </button>
              {importState.message ? <p className="mt-2 text-xs text-stone-600">{importState.message}</p> : null}
            </form>
          </div>
        </div>
      </Step>

      <Step number={4} title="Review">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            ["Project", models.find((model) => model.value === modelId)?.label ?? "Not selected"],
            ["Version", selectedVersion?.label ?? "Not selected"],
            ["Configuration", configuration ? "Ready" : "Missing"],
            ["Selected tests", String(selectedIds.size)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-stone-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-stone-500">
                {label}
              </p>
              <p className="mt-1 text-sm font-semibold text-stone-950">{value}</p>
            </div>
          ))}
        </div>
        {selectedTests.length > 0 ? (
          <p className="mt-3 text-sm text-stone-600">
            Ready to run {selectedTests.length} canonical tests. The model output
            and PASS/FAIL will be produced automatically.
          </p>
        ) : null}
      </Step>

      <form action={runFormAction} className="rounded-md border border-stone-200 bg-white p-4">
        <input type="hidden" name="modelId" value={modelId} />
        <input type="hidden" name="modelVersionId" value={modelVersionId} />
        {[...selectedIds].map((id) => (
          <input key={id} type="hidden" name="testCaseIds" value={id} />
        ))}
        {runState.status === "error" && runState.message ? (
          <p className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
            {runState.message}
          </p>
        ) : null}
        {isRunning ? (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
            Execution in progress: creating run, calling provider, evaluating outputs, and saving telemetry.
          </div>
        ) : null}
        <button
          disabled={!canRun || isRunning}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-stone-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {isRunning ? (
            <>
              <ClipboardCheck className="size-4" /> Testing...
            </>
          ) : (
            <>
              <Play className="size-4" /> Test This Version
            </>
          )}
        </button>
      </form>
    </div>
  );
}
