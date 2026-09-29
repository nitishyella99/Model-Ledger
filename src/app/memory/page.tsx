import { PageHeading } from "@/components/models/page-heading";
import { getModels } from "@/lib/data/models";
import { isHindsightConfigured } from "@/lib/hindsight/client";
import { recallMemorySearch } from "@/lib/hindsight/recall";
import type {
  HindsightRecallMemory,
  MemoryEventType,
} from "@/lib/hindsight/types";

export const dynamic = "force-dynamic";

type MemoryPageProps = Readonly<{
  searchParams?: Promise<{
    q?: string;
    model?: string;
    eventType?: string;
    version?: string;
  }>;
}>;

const memoryEventTypes: Array<MemoryEventType | "all"> = [
  "all",
  "evaluation_failure",
  "evaluation_outcome",
  "regression",
  "resolved_issue",
  "fix_remediation",
  "version_change",
  "approval_decision",
  "rejection_decision",
  "evaluator_note",
];

function formatEventType(value: string | null) {
  return value ? value.replaceAll("_", " ") : "memory";
}

const dateFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "Date not recorded";
}

function EmptyState({
  title,
  description,
}: Readonly<{
  title: string;
  description: string;
}>) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </section>
  );
}

function normalizeEventType(value: string | undefined) {
  return memoryEventTypes.includes(value as MemoryEventType | "all")
    ? (value as MemoryEventType | "all")
    : "all";
}

async function getMemoryExplorerState(
  filters: Readonly<{
    query: string;
    modelId: string;
    eventType: MemoryEventType | "all";
    version: string;
  }>,
) {
  try {
    const configured = isHindsightConfigured();
    const models = await getModels();

    if (!configured) {
      return {
        status: "not-configured" as const,
        models,
      };
    }

    const searchableModels =
      filters.modelId === "all"
        ? models
        : models.filter((model) => model.id === filters.modelId);
    const recalledByModel = await Promise.all(
      searchableModels.map(async (model) => ({
        model,
        recall: await recallMemorySearch({
          modelId: model.id,
          query: filters.query,
          eventType: filters.eventType,
          version: filters.version,
          limit: 12,
        }),
      })),
    );

    return {
      status: "ready" as const,
      models,
      recalledByModel,
    };
  } catch (error) {
    return {
      status: "error" as const,
      description:
        error instanceof Error
          ? error.message
          : "Memory Explorer could not load data.",
    };
  }
}

function MemorySearchForm({
  models,
  filters,
}: Readonly<{
  models: Awaited<ReturnType<typeof getModels>>;
  filters: Readonly<{
    query: string;
    modelId: string;
    eventType: MemoryEventType | "all";
    version: string;
  }>;
}>) {
  return (
    <form className="rounded-md border border-slate-200 bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_180px_auto]">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold text-slate-950">Search memory</span>
          <input
            name="q"
            defaultValue={filters.query}
            placeholder="Search failures, fixes, version changes..."
            className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">Model</span>
          <select
            name="model"
            defaultValue={filters.modelId}
            className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
          >
            <option value="all">All models</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">Memory type</span>
          <select
            name="eventType"
            defaultValue={filters.eventType}
            className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
          >
            {memoryEventTypes.map((eventType) => (
              <option key={eventType} value={eventType}>
                {formatEventType(eventType)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-700">Version</span>
          <input
            name="version"
            defaultValue={filters.version}
            placeholder="v1.6"
            className="h-10 rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
          />
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white"
          >
            Search
          </button>
        </div>
      </div>
    </form>
  );
}

function MemoryResultCard({
  memory,
}: Readonly<{
  memory: HindsightRecallMemory;
}>) {
  return (
    <article className="grid gap-3 rounded-md border border-slate-200 p-4 md:grid-cols-[180px_180px_1fr]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Version
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-950">
          {memory.version ?? memory.modelVersionId ?? "Not recorded"}
        </p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Memory type
        </p>
        <p className="mt-1 text-sm font-semibold capitalize text-slate-950">
          {formatEventType(memory.eventType)}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {formatDate(memory.timestamp)}
        </p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
          Memory
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-700">
          {memory.content}
        </p>
      </div>
    </article>
  );
}

export default async function MemoryPage({ searchParams }: MemoryPageProps) {
  const resolvedSearchParams = await searchParams;
  const filters = {
    query: resolvedSearchParams?.q?.trim() ?? "",
    modelId: resolvedSearchParams?.model ?? "all",
    eventType: normalizeEventType(resolvedSearchParams?.eventType),
    version: resolvedSearchParams?.version?.trim() ?? "",
  };
  const state = await getMemoryExplorerState(filters);

  if (state.status === "error") {
    return (
      <div className="space-y-6">
        <PageHeading
          eyebrow="Historical context"
          title="Memory"
          description="Search what ModelLedger remembers from previous evaluations and model versions."
        />
        <EmptyState title="Memory unavailable" description={state.description} />
      </div>
    );
  }

  if (state.status === "not-configured") {
    return (
      <div className="space-y-6">
        <PageHeading
          eyebrow="Historical context"
          title="Memory"
          description="Search what ModelLedger remembers from previous evaluations and model versions."
        />
        <MemorySearchForm models={state.models} filters={filters} />
        <EmptyState
          title="Hindsight is not configured"
          description="Add HINDSIGHT_API_KEY on the server to enable retained and recalled semantic memory. Supabase-backed evaluation history remains available elsewhere in the app."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
        <PageHeading
        eyebrow="Historical context"
        title="Memory"
        description="Search what ModelLedger remembers from previous evaluations and model versions."
      />
      <MemorySearchForm
        models={state.models}
        filters={filters}
      />
      {state.recalledByModel.length === 0 ? (
        <EmptyState
          title="No relevant historical memory found"
          description="No model matched the current memory search filters."
        />
      ) : (
        <div className="grid gap-4">
          {state.recalledByModel.map(({ model, recall }) => (
            <section
              key={model.id}
              className="rounded-md border border-slate-200 bg-white p-6"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="mt-1 text-base font-semibold text-slate-950">
                    {model.name}
                  </h2>
                </div>
                <span className="rounded-sm border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600">
                  {recall.memories.length} recalled
                </span>
              </div>

              {!recall.ok ? (
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  Historical memory is temporarily unavailable.
                </p>
              ) : recall.memories.length === 0 ? (
                <p className="mt-4 text-sm leading-6 text-slate-600">
                  No relevant historical memory found.
                </p>
              ) : (
                <div className="mt-5 grid gap-3">
                  {recall.memories.map((memory) => (
                    <MemoryResultCard key={memory.id} memory={memory} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
