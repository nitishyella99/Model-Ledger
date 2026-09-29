"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp } from "lucide-react";
import type {
  TestCaseActionState,
  importTestCasesCsvAction,
} from "@/app/tests/actions";

type ProjectTestCasesImportProps = Readonly<{
  action: typeof importTestCasesCsvAction;
  initialState: TestCaseActionState;
  modelId: string;
  versions: ReadonlyArray<{
    id: string;
    version: string;
  }>;
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

  return rows.slice(0, 6).map((row, index) => {
    const values = row.match(/("([^"]|"")*"|[^,]+)/g) ?? [];
    const clean = (value: string | undefined) =>
      (value ?? "").replace(/^"|"$/g, "").replaceAll('""', '"').trim();
    const name = clean(values[indexOf("name")]);
    const category = clean(values[indexOf("category")]);
    const input = clean(values[indexOf("input")]);
    const expected = clean(values[indexOf("expected_output")]);

    return {
      id: `${index}-${row}`,
      name,
      category,
      valid: Boolean(name && category && input && expected),
    };
  });
}

async function readCsvFile(file: File | null) {
  if (!file) {
    return "";
  }

  return file.text();
}

export function ProjectTestCasesImport({
  action,
  initialState,
  modelId,
  versions,
}: ProjectTestCasesImportProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(action, initialState);
  const [csv, setCsv] = useState("");
  const [modelVersionId, setModelVersionId] = useState("");
  const csvPreview = useMemo(() => parseCsvPreview(csv), [csv]);
  const canImport = Boolean(modelVersionId) && !isPending;

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form
      action={formAction}
      className="rounded-md border border-stone-200 bg-white"
    >
      <input type="hidden" name="modelId" value={modelId} />
      <input type="hidden" name="modelVersionId" value={modelVersionId} />
      <div className="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-stone-950">
            Import test cases
          </h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Upload a CSV file or paste its content. Imports update existing tests
            with the same stable key.
          </p>
        </div>
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}
          download="modelledger-test-cases-template.csv"
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
        >
          <Download className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Template
        </a>
      </div>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3">
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-stone-950">Version</span>
            <select
              value={modelVersionId}
              onChange={(event) => setModelVersionId(event.target.value)}
              className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
            >
              <option value="">Select version</option>
              {versions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.version}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-stone-950">CSV content</span>
            <textarea
              name="csv"
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              placeholder={template}
              rows={10}
              className="resize-y rounded-md border border-stone-200 bg-white px-3 py-2 text-sm leading-6 text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="flex items-center gap-2 font-semibold text-stone-950">
              <FileUp className="size-4" strokeWidth={1.8} aria-hidden="true" />
              Upload CSV file
            </span>
            <input
              name="csvFile"
              type="file"
              accept=".csv,text/csv"
              onChange={async (event) => {
                const text = await readCsvFile(event.target.files?.[0] ?? null);
                setCsv(text);
              }}
              className="block w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 file:mr-3 file:rounded file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-stone-800 hover:bg-stone-50"
            />
          </label>
        </div>

        <aside className="rounded-md border border-stone-200 bg-stone-50 p-3">
          <h3 className="text-sm font-semibold text-stone-950">Preview</h3>
          {csvPreview.length > 0 ? (
            <div className="mt-3 overflow-hidden rounded-md border border-stone-200 bg-white">
              {csvPreview.map((row) => (
                <div
                  key={row.id}
                  className="border-b border-stone-200 p-3 text-sm last:border-b-0"
                >
                  <p className="font-semibold text-stone-950">
                    {row.name || "Unnamed test"}
                  </p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-stone-500">
                    {row.category || "No category"}
                  </p>
                  <p
                    className={[
                      "mt-2 text-xs font-semibold",
                      row.valid ? "text-emerald-700" : "text-rose-700",
                    ].join(" ")}
                  >
                    {row.valid ? "Ready to import" : "Missing required fields"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm leading-6 text-stone-600">
              Required columns: name, category, input, and expected_output.
            </p>
          )}
        </aside>
      </div>
      <div className="flex flex-col gap-3 border-t border-stone-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        {state.message ? (
          <p
            className={[
              "rounded-md border px-3 py-2 text-sm font-medium",
              state.status === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800",
            ].join(" ")}
          >
            {state.message}
          </p>
        ) : (
          <p className="text-sm text-stone-600">
            Select a version first. CSV imports are saved under that version.
          </p>
        )}
        <button
          type="submit"
          disabled={!canImport}
          className="inline-flex h-9 items-center justify-center rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {isPending ? "Importing..." : "Import CSV"}
        </button>
      </div>
    </form>
  );
}
