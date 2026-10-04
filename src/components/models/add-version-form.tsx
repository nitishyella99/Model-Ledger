"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GitCommitHorizontal, Plus, RotateCcw, X } from "lucide-react";
import type {
  AddVersionActionState,
  addVersionAction,
} from "@/app/versions/actions";

type SelectOption = Readonly<{
  label: string;
  value: string;
}>;

type AddVersionFormProps = Readonly<{
  action: typeof addVersionAction;
  initialActionState: AddVersionActionState;
  models: SelectOption[];
  initialModelId?: string;
}>;

const changeTypes = [
  { label: "System Prompt", value: "SYSTEM_PROMPT" },
  { label: "Temperature", value: "MODEL_CONFIG" },
  { label: "Provider/Model", value: "MODEL_CONFIG" },
  { label: "Retrieval configuration", value: "MODEL_CONFIG" },
  { label: "Tools", value: "TOOLING" },
  { label: "Guardrails", value: "POLICY" },
  { label: "Other", value: "OTHER" },
];

function FieldError({ message }: Readonly<{ message?: string }>) {
  if (!message) {
    return null;
  }

  return <p className="text-xs font-medium text-rose-700">{message}</p>;
}

export function AddVersionForm({
  action,
  initialActionState,
  models,
  initialModelId,
}: AddVersionFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isOpen, setIsOpen] = useState(Boolean(initialModelId));
  const [selectedChangeLabel, setSelectedChangeLabel] = useState("");
  const [fieldName, setFieldName] = useState("");
  const [state, formAction, isPending] = useActionState(
    action,
    initialActionState,
  );
  const selectedChangeType = useMemo(
    () =>
      changeTypes.find((changeType) => changeType.label === selectedChangeLabel),
    [selectedChangeLabel],
  );

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      if (state.createdVersionId) {
        router.push(`/versions/${state.createdVersionId}`);
      } else {
        router.refresh();
      }
    }
  }, [router, state.createdVersionId, state.status]);

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 active:translate-y-px"
        >
          <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Add Version
        </button>
      </div>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-stone-950/35 p-4 sm:items-center sm:justify-center"
          role="presentation"
          onMouseDown={() => setIsOpen(false)}
        >
    <form
      ref={formRef}
      action={formAction}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-version-title"
      className="max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-md border border-slate-200 bg-white shadow-xl"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
        <div>
        <h2 id="add-version-title" className="text-lg font-semibold text-slate-950">
          Add Version
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Create the next version for a project. Add change details only when
          they help explain the report later.
        </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="inline-flex size-9 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
          aria-label="Close add version dialog"
        >
          <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
        </button>
      </div>
        {state.message ? (
          <p
            className={[
              "mt-3 rounded-md border px-3 py-2 text-sm font-medium",
              state.status === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800",
            ].join(" ")}
          >
            {state.message}
          </p>
        ) : null}
      <div className="grid gap-4 p-4 md:grid-cols-3">
        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-slate-950">Model</span>
          <select
            name="modelId"
            defaultValue={initialModelId ?? ""}
            disabled={isPending}
            aria-invalid={Boolean(state.fieldErrors?.modelId)}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-slate-400"
          >
            <option value="">Select model</option>
            {models.map((model) => (
              <option key={model.value} value={model.value}>
                {model.label}
              </option>
            ))}
          </select>
          <FieldError message={state.fieldErrors?.modelId} />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-slate-950">
            Version identifier
          </span>
          <input
            name="version"
            disabled={isPending}
            placeholder="v1.7"
            aria-invalid={Boolean(state.fieldErrors?.version)}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-slate-400"
          />
          <FieldError message={state.fieldErrors?.version} />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-slate-950">Status</span>
          <select
            name="status"
            defaultValue="DRAFT"
            disabled={isPending}
            aria-invalid={Boolean(state.fieldErrors?.status)}
            className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-slate-400"
          >
            <option value="DRAFT">Draft</option>
            <option value="APPROVED">Approved</option>
            <option value="MONITORING">Monitoring</option>
            <option value="DEPRECATED">Deprecated</option>
          </select>
          <FieldError message={state.fieldErrors?.status} />
        </label>
      </div>
      <div className="border-t border-slate-200 p-4">
        <div className="mb-4 flex items-center gap-2">
          <GitCommitHorizontal
            className="size-4 text-slate-500"
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <h3 className="text-sm font-semibold text-slate-950">
            Optional change record
          </h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-slate-950">Change type</span>
            <select
              disabled={isPending}
              value={selectedChangeLabel}
              onChange={(event) => {
                setSelectedChangeLabel(event.target.value);
                setFieldName(event.target.value);
              }}
              aria-invalid={Boolean(state.fieldErrors?.changeType)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-slate-400"
            >
              <option value="">No change record</option>
              {changeTypes.map((changeType) => (
                <option key={changeType.label} value={changeType.label}>
                  {changeType.label}
                </option>
              ))}
            </select>
            <input
              type="hidden"
              name="changeType"
              value={selectedChangeType?.value ?? ""}
            />
            <FieldError message={state.fieldErrors?.changeType} />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-slate-950">Field name</span>
            <input
              name="fieldName"
              disabled={isPending}
              value={fieldName}
              onChange={(event) => setFieldName(event.target.value)}
              className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-slate-400"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-slate-950">Previous value</span>
            <textarea
              name="previousValue"
              rows={3}
              disabled={isPending}
              className="resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-slate-400"
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span className="font-semibold text-slate-950">New value</span>
            <textarea
              name="newValue"
              rows={3}
              disabled={isPending}
              className="resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-slate-400"
            />
          </label>
          <label className="grid gap-2 text-sm md:col-span-2">
            <span className="font-semibold text-slate-950">Description</span>
            <textarea
              name="description"
              rows={3}
              disabled={isPending}
              aria-invalid={Boolean(state.fieldErrors?.description)}
              className="resize-y rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition-colors hover:bg-slate-50 focus:border-slate-400"
            />
            <FieldError message={state.fieldErrors?.description} />
          </label>
        </div>
      </div>
      <div className="flex flex-col gap-2 border-t border-slate-200 p-4 sm:flex-row sm:justify-end">
        <button
          type="reset"
          disabled={isPending}
          onClick={() => {
            setSelectedChangeLabel("");
            setFieldName("");
          }}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:translate-y-px"
        >
          <RotateCcw className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Reset
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 active:translate-y-px"
        >
          <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />
          {isPending ? "Adding..." : "Add Version"}
        </button>
      </div>
    </form>
        </div>
      ) : null}
    </>
  );
}
