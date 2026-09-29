"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, X } from "lucide-react";
import type {
  CreateModelActionState,
  createModelAction,
} from "@/app/models/actions";

type CreateModelFormProps = Readonly<{
  action: typeof createModelAction;
  initialActionState: CreateModelActionState;
  importAction?: React.ReactNode;
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

export function CreateModelForm({
  action,
  initialActionState,
  importAction,
}: CreateModelFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    action,
    initialActionState,
  );

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
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
          onMouseDown={() => setIsOpen(false)}
        >
          <form
            ref={formRef}
            action={formAction}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-project-title"
            className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-md border border-stone-200 bg-white shadow-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-stone-200 p-5">
              <div>
                <h2 id="create-project-title" className="text-lg font-semibold text-stone-950">
                  Create Project
                </h2>
                <p className="mt-1 text-sm text-stone-600">
                  Add the AI application you want to evaluate.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex size-9 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-950"
                aria-label="Close create project dialog"
              >
                <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            {state.message ? (
              <p
                className={[
                  "mx-5 mt-4 rounded-md border px-3 py-2 text-sm font-medium",
                  state.status === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-800",
                ].join(" ")}
              >
                {state.message}
              </p>
            ) : null}
            <div className="grid gap-4 p-5 md:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-stone-950">Project Name</span>
          <input
            name="name"
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
            defaultValue=""
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
        <label className="grid gap-2 text-sm md:col-span-2">
          <span className="font-semibold text-stone-950">
            Short Description
          </span>
          <textarea
            name="purpose"
            rows={3}
            disabled={isPending}
            aria-invalid={Boolean(state.fieldErrors?.purpose)}
            className="resize-y rounded-md border border-stone-200 bg-white px-3 py-2 text-sm leading-6 text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
          />
          <FieldError message={state.fieldErrors?.purpose} />
        </label>
            </div>
            <div className="flex flex-col gap-2 border-t border-stone-200 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-stone-500">
                Add or import tests from the evaluation workspace after the
                project exists.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
        {importAction}
        <button
          type="reset"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 active:translate-y-px"
        >
          <RotateCcw className="size-4" strokeWidth={1.8} aria-hidden="true" />
          Reset
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 active:translate-y-px"
        >
          <Plus className="size-4" strokeWidth={1.8} aria-hidden="true" />
          {isPending ? "Creating..." : "Create Project"}
        </button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
