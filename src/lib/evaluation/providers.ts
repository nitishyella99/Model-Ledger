import type {
  ModelExecutionRequest,
  ModelExecutionResult,
  TokenUsage,
} from "./pipeline-types";

type OpenAiChatCompletionResponse = Readonly<{
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  model?: string;
  id?: string;
}>;

export type ModelExecutor = Readonly<{
  execute: (request: ModelExecutionRequest) => Promise<ModelExecutionResult>;
}>;

function emptyUsage(): TokenUsage {
  return {
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
  };
}

function defaultBaseUrlForProvider(provider: string) {
  const normalizedProvider = provider.trim().toLowerCase();

  if (normalizedProvider === "nvidia-nim" || normalizedProvider === "nvidia") {
    return "https://integrate.api.nvidia.com/v1";
  }

  if (normalizedProvider === "groq") {
    return "https://api.groq.com/openai/v1";
  }

  return "https://api.openai.com/v1";
}

function normalizeBaseUrl(value: string | null, provider: string) {
  return (value || defaultBaseUrlForProvider(provider)).replace(/\/+$/, "");
}

function getApiKey(credentialReference: string) {
  const key = credentialReference.trim();

  if (!key) {
    return null;
  }

  return process.env[key] ?? null;
}

function defaultTimeoutMsForProvider(provider: string) {
  const normalizedProvider = provider.trim().toLowerCase();

  if (normalizedProvider === "nvidia-nim" || normalizedProvider === "nvidia") {
    return 30_000;
  }

  return 30_000;
}

function resolveModelName(provider: string, modelName: string) {
  const normalizedProvider = provider.trim().toLowerCase();
  const trimmedModel = modelName ? modelName.trim() : "";

  if (
    normalizedProvider === "nvidia-nim" ||
    normalizedProvider === "nvidia" ||
    process.env.NVIDIA_API_KEY
  ) {
    if (
      !trimmedModel ||
      trimmedModel === "deepseek-ai/deepseek-v4.1-flash" ||
      trimmedModel.includes("llama-3.3-70b") ||
      trimmedModel.includes("llama-3.1-70b")
    ) {
      return process.env.LLM_MODEL || "meta/llama-3.2-11b-vision-instruct";
    }
  }

  return trimmedModel || process.env.LLM_MODEL || "meta/llama-3.2-11b-vision-instruct";
}

function statusForHttpStatus(status: number): ModelExecutionResult["status"] {
  if (status === 401 || status === 403) {
    return "AUTH_FAILURE";
  }

  if (status === 408 || status === 504) {
    return "TIMEOUT";
  }

  if (status === 429) {
    return "RATE_LIMIT";
  }

  return "API_FAILURE";
}

function estimateOpenAiCompatibleCost(
  modelName: string,
  usage: TokenUsage,
): number | null {
  const totalTokens = usage.totalTokens;

  if (!totalTokens) {
    return null;
  }

  const lowerModelName = modelName.toLowerCase();
  const costPerMillion =
    lowerModelName.includes("gpt-4o-mini") ||
    lowerModelName.includes("gpt-5-nano")
      ? 0.6
      : lowerModelName.includes("gpt-4o") || lowerModelName.includes("gpt-5")
        ? 5
        : null;

  return costPerMillion === null
    ? null
    : Number(((totalTokens / 1_000_000) * costPerMillion).toFixed(6));
}

export class OpenAiCompatibleExecutor implements ModelExecutor {
  async execute(
    request: ModelExecutionRequest,
  ): Promise<ModelExecutionResult> {
    const startedAt = Date.now();
    const apiKey = getApiKey(request.configuration.credentialReference);

    if (!apiKey) {
      return {
        output: "",
        latencyMs: Date.now() - startedAt,
        tokenUsage: emptyUsage(),
        estimatedCostUsd: null,
        providerMetadata: null,
        status: "AUTH_FAILURE",
        error: `Credential reference ${request.configuration.credentialReference} is not configured.`,
      };
    }

    const effectiveModelName = resolveModelName(
      request.configuration.provider,
      request.configuration.modelName,
    );

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      request.timeoutMs ??
        defaultTimeoutMsForProvider(request.configuration.provider),
    );

    try {
      const response = await fetch(
        request.configuration.endpointUrl ||
          `${normalizeBaseUrl(
            request.configuration.baseUrl,
            request.configuration.provider,
          )}/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: effectiveModelName,
            messages: [
              ...(request.configuration.systemPrompt
                ? [
                    {
                      role: "system",
                      content: request.configuration.systemPrompt,
                    },
                  ]
                : []),
              {
                role: "user",
                content: request.testCase.input,
              },
            ],
            temperature: request.configuration.temperature,
            max_tokens: request.configuration.maxTokens ?? undefined,
            ...((request.configuration.providerSettings &&
            typeof request.configuration.providerSettings === "object" &&
            !Array.isArray(request.configuration.providerSettings)
              ? request.configuration.providerSettings
              : {}) as Record<string, unknown>),
          }),
        },
      );

      if (!response.ok) {
        return {
          output: "",
          latencyMs: Date.now() - startedAt,
          tokenUsage: emptyUsage(),
          estimatedCostUsd: null,
          providerMetadata: { httpStatus: response.status },
          status: statusForHttpStatus(response.status),
          error: `Provider request failed with status ${response.status}.`,
        };
      }

      const body = (await response.json()) as OpenAiChatCompletionResponse;
      const output = body.choices?.[0]?.message?.content;

      if (typeof output !== "string") {
        return {
          output: "",
          latencyMs: Date.now() - startedAt,
          tokenUsage: emptyUsage(),
          estimatedCostUsd: null,
          providerMetadata: { id: body.id, model: body.model },
          status: "MALFORMED_RESPONSE",
          error: "Provider response did not include assistant text.",
        };
      }

      const tokenUsage = {
        inputTokens: body.usage?.prompt_tokens ?? null,
        outputTokens: body.usage?.completion_tokens ?? null,
        totalTokens: body.usage?.total_tokens ?? null,
      };

      return {
        output,
        latencyMs: Date.now() - startedAt,
        tokenUsage,
        estimatedCostUsd: estimateOpenAiCompatibleCost(
          request.configuration.modelName,
          tokenUsage,
        ),
        providerMetadata: {
          id: body.id,
          model: body.model ?? request.configuration.modelName,
        },
        status: "SUCCESS",
        error: null,
      };
    } catch (error) {
      return {
        output: "",
        latencyMs: Date.now() - startedAt,
        tokenUsage: emptyUsage(),
        estimatedCostUsd: null,
        providerMetadata: null,
        status: error instanceof DOMException && error.name === "AbortError"
          ? "TIMEOUT"
          : "API_FAILURE",
        error:
          error instanceof Error
            ? error.message
            : "Provider request failed unexpectedly.",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createModelExecutor(provider: string): ModelExecutor {
  const normalizedProvider = provider.trim().toLowerCase();

  if (
    normalizedProvider === "openai" ||
    normalizedProvider === "openai-compatible" ||
    normalizedProvider === "nvidia-nim" ||
    normalizedProvider === "nvidia" ||
    normalizedProvider === "groq"
  ) {
    return new OpenAiCompatibleExecutor();
  }

  throw new Error(`Unsupported model provider: ${provider}`);
}
