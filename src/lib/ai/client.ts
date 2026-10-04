import "server-only";

import { evaluationAiAnalysisJsonSchema } from "./schemas";
import type { AiCompletionProvider, AiCompletionRequest } from "./types";

type ChatCompletionMessage = Readonly<{
  role: "system" | "user";
  content: string;
}>;

type ChatCompletionResponse = Readonly<{
  choices?: Array<{
    message?: {
      content?: string | null;
      reasoning_content?: string | null;
    };
  }>;
}>;

const DEFAULT_TIMEOUT_MS = 30_000;

function getProviderConfig() {
  const provider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const apiKey =
    process.env.LLM_API_KEY ??
    process.env.NVIDIA_API_KEY ??
    process.env.OPENAI_API_KEY ??
    process.env.GROQ_API_KEY;
  const baseUrl =
    process.env.LLM_BASE_URL ??
    (provider === "nvidia-nim" || provider === "nvidia" || process.env.NVIDIA_API_KEY
      ? "https://integrate.api.nvidia.com/v1"
      : provider === "groq" || process.env.GROQ_API_KEY
        ? "https://api.groq.com/openai/v1"
        : "https://api.openai.com/v1");
  const model =
    process.env.LLM_MODEL ??
    (provider === "nvidia-nim" || provider === "nvidia" || process.env.NVIDIA_API_KEY
      ? "meta/llama-3.2-11b-vision-instruct"
      : provider === "groq" || process.env.GROQ_API_KEY
        ? "llama-3.3-70b-versatile"
        : "gpt-4o-mini");

  return {
    provider,
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
  };
}

export function isEvaluationAiConfigured() {
  return Boolean(getProviderConfig().apiKey);
}

function extractJsonContent(response: ChatCompletionResponse) {
  const messageObj = response.choices?.[0]?.message;
  let content = messageObj?.content;

  if (!content && messageObj && typeof messageObj.reasoning_content === "string") {
    content = messageObj.reasoning_content;
  }

  if (!content) {
    throw new Error("LLM response did not include message content.");
  }

  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

function supportsStrictJsonSchema(provider: string) {
  return provider !== "nvidia-nim" && provider !== "nvidia";
}

export const completeEvaluationAnalysis: AiCompletionProvider = async (
  request: AiCompletionRequest,
) => {
  const config = getProviderConfig();

  if (!config.apiKey) {
    throw new Error("No LLM API key is configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const messages: ChatCompletionMessage[] = [
    { role: "system", content: request.system },
    { role: "user", content: request.user },
  ];
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0.1,
        response_format: supportsStrictJsonSchema(config.provider)
          ? {
              type: "json_schema",
              json_schema: {
                name: request.schemaName,
                strict: true,
                schema: request.jsonSchema ?? evaluationAiAnalysisJsonSchema,
              },
            }
          : {
              type: "json_object",
            },
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed with status ${response.status}.`);
    }

    return extractJsonContent((await response.json()) as ChatCompletionResponse);
  } finally {
    clearTimeout(timeout);
  }
};

export const completeJsonCompletion = async (
  request: AiCompletionRequest,
  options: { timeoutMs?: number; maxTokens?: number } = {},
) => {
  const config = getProviderConfig();

  if (!config.apiKey) {
    throw new Error("No LLM API key is configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.user },
        ],
        temperature: 0,
        ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
        response_format: request.jsonSchema && supportsStrictJsonSchema(config.provider) ? {
          type: "json_schema",
          json_schema: { name: request.schemaName, strict: true, schema: request.jsonSchema },
        } : {
          type: "json_object",
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM request failed with status ${response.status}.`);
    }

    return extractJsonContent((await response.json()) as ChatCompletionResponse);
  } finally {
    clearTimeout(timeout);
  }
};

export const completeLlmJudge = completeJsonCompletion;
export const completeRunAnalysis: AiCompletionProvider = (request) =>
  completeJsonCompletion(request, { timeoutMs: 75_000, maxTokens: 6000 });
export const completeTestCaseGeneration: AiCompletionProvider = (request) =>
  completeJsonCompletion(request, { timeoutMs: 75_000, maxTokens: 12000 });
