"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw, Save } from "lucide-react";
import type {
  ModelVersionConfigurationActionState,
  saveModelVersionConfigurationAction,
} from "@/app/versions/actions";
import type { Json } from "@/types/database";

type ModelConfigurationFormProps = Readonly<{
  action: typeof saveModelVersionConfigurationAction;
  initialActionState: ModelVersionConfigurationActionState;
  versionId: string;
  configuration: {
    provider: string;
    model_name: string;
    base_url: string | null;
    endpoint_url: string | null;
    system_prompt: string | null;
    temperature: number;
    max_tokens: number | null;
    provider_settings: Json;
    credential_reference: string;
  } | null;
}>;

const providerOptions = [
  {
    label: "NVIDIA NIM",
    value: "nvidia-nim",
    defaultModel: "deepseek-ai/deepseek-v4.1-flash",
    credential: "NVIDIA_API_KEY",
    baseUrl: "https://integrate.api.nvidia.com/v1",
  },
  {
    label: "OpenAI",
    value: "openai",
    defaultModel: "gpt-4o-mini",
    credential: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    label: "OpenAI-compatible",
    value: "openai-compatible",
    defaultModel: "gpt-4o-mini",
    credential: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    label: "Groq",
    value: "groq",
    defaultModel: "llama-3.3-70b-versatile",
    credential: "GROQ_API_KEY",
    baseUrl: "https://api.groq.com/openai/v1",
  },
];

function stringifyProviderSettings(value: Json) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "{}";
  }

  return JSON.stringify(value, null, 2);
}

function FieldHelp({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p className="text-xs leading-5 text-stone-500">{children}</p>;
}

export function ModelConfigurationForm({
  action,
  initialActionState,
  versionId,
  configuration,
}: ModelConfigurationFormProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    action,
    initialActionState,
  );
  const initialProvider = configuration?.provider ?? "nvidia-nim";
  const [provider, setProvider] = useState(initialProvider);
  const selectedProvider = useMemo(
    () =>
      providerOptions.find((option) => option.value === provider) ??
      providerOptions[0],
    [provider],
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="rounded-md border border-stone-200 bg-white"
    >
      <div className="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-stone-950">
            Executable Model Configuration
          </h2>
          <p className="mt-1 text-sm leading-6 text-stone-600">
            Store the provider, model, endpoint settings, and server-side
            credential reference used when this version is evaluated.
          </p>
        </div>
        <span
          className={[
            "inline-flex h-8 w-fit items-center gap-2 rounded-md border px-3 text-xs font-semibold",
            configuration
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-900",
          ].join(" ")}
        >
          <CheckCircle2 className="size-3.5" strokeWidth={1.8} />
          {configuration ? "Ready to execute" : "Configuration required"}
        </span>
      </div>

      {state.message ? (
        <p
          className={[
            "mx-4 mt-4 rounded-md border px-3 py-2 text-sm font-medium",
            state.status === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          ].join(" ")}
        >
          {state.message}
        </p>
      ) : null}

      <input type="hidden" name="modelVersionId" value={versionId} />

      <div className="grid gap-4 p-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-stone-950">Provider</span>
          <select
            name="provider"
            value={provider}
            disabled={isPending}
            onChange={(event) => setProvider(event.target.value)}
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
          >
            {providerOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FieldHelp>
            Supported by the current executor: OpenAI-compatible chat
            completions.
          </FieldHelp>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-stone-950">Model</span>
          <input
            name="modelName"
            disabled={isPending}
            defaultValue={configuration?.model_name ?? selectedProvider.defaultModel}
            placeholder={selectedProvider.defaultModel}
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
          />
          <FieldHelp>Exact provider model name sent to the API.</FieldHelp>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-stone-950">
            Credential environment variable
          </span>
          <input
            name="credentialReference"
            disabled={isPending}
            defaultValue={
              configuration?.credential_reference ?? selectedProvider.credential
            }
            placeholder={selectedProvider.credential}
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
          />
          <FieldHelp>
            Use an environment variable name only. The secret stays on the
            server and is never stored in Supabase.
          </FieldHelp>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-stone-950">Temperature</span>
          <input
            name="temperature"
            type="number"
            min="0"
            max="2"
            step="0.01"
            disabled={isPending}
            defaultValue={configuration?.temperature ?? 0}
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
          />
          <FieldHelp>Range: 0 to 2.</FieldHelp>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-stone-950">Base URL</span>
          <input
            name="baseUrl"
            disabled={isPending}
            defaultValue={configuration?.base_url ?? ""}
            placeholder={
              selectedProvider.baseUrl
            }
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
          />
          <FieldHelp>
            Optional. Leave blank to use the default for {selectedProvider.label}.
          </FieldHelp>
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-stone-950">Endpoint URL</span>
          <input
            name="endpointUrl"
            disabled={isPending}
            defaultValue={configuration?.endpoint_url ?? ""}
            placeholder="https://provider.example/v1/chat/completions"
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
          />
          <FieldHelp>
            Optional override for the full chat-completions endpoint.
          </FieldHelp>
        </label>

        <label className="grid gap-2 text-sm md:col-span-2">
          <span className="font-semibold text-stone-950">System prompt</span>
          <textarea
            name="systemPrompt"
            rows={4}
            disabled={isPending}
            defaultValue={configuration?.system_prompt ?? ""}
            className="resize-y rounded-md border border-stone-200 bg-white px-3 py-2 text-sm leading-6 text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
          />
        </label>

        <label className="grid gap-2 text-sm">
          <span className="font-semibold text-stone-950">Max tokens</span>
          <input
            name="maxTokens"
            type="number"
            min="1"
            step="1"
            disabled={isPending}
            defaultValue={configuration?.max_tokens ?? ""}
            className="h-10 rounded-md border border-stone-200 bg-white px-3 text-sm text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
          />
          <FieldHelp>Optional. Leave blank for provider default.</FieldHelp>
        </label>

        <label className="grid gap-2 text-sm md:col-span-2">
          <span className="font-semibold text-stone-950">
            Provider settings JSON
          </span>
          <textarea
            name="providerSettings"
            rows={5}
            disabled={isPending}
            defaultValue={stringifyProviderSettings(
              configuration?.provider_settings ?? {},
            )}
            className="font-mono resize-y rounded-md border border-stone-200 bg-white px-3 py-2 text-xs leading-5 text-stone-700 outline-none transition-colors hover:bg-stone-50 focus:border-stone-400"
          />
          <FieldHelp>
            Optional extra request fields merged into the provider request.
          </FieldHelp>
        </label>
      </div>

      <div className="flex flex-col gap-2 border-t border-stone-200 p-4 sm:flex-row sm:justify-end">
        <button
          type="reset"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
        >
          <RotateCcw className="size-4" strokeWidth={1.8} />
          Reset
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-stone-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          <Save className="size-4" strokeWidth={1.8} />
          {isPending ? "Saving..." : "Save Configuration"}
        </button>
      </div>
    </form>
  );
}
