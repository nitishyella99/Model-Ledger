import { z } from "zod";

export const evaluationAiAnalysisSchema = z.object({
  executiveSummary: z.string().trim().min(1),
  keyChanges: z
    .array(
      z.object({
        change: z.string().trim().min(1),
        impact: z.string().trim().min(1),
        evidence: z.string().trim().min(1),
      }),
    )
    .max(8),
  historicalEvidence: z
    .array(
      z.object({
        event: z.string().trim().min(1),
        outcome: z.string().trim().min(1),
        relevance: z.string().trim().min(1),
      }),
    )
    .max(8),
  recommendedActions: z
    .array(
      z.object({
        action: z.string().trim().min(1),
        reason: z.string().trim().min(1),
      }),
    )
    .max(5),
  confidence: z.enum(["LOW", "MEDIUM", "HIGH"]),
  limitations: z.array(z.string().trim().min(1)).max(8),
});

export const evaluationAiAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "executiveSummary",
    "keyChanges",
    "historicalEvidence",
    "recommendedActions",
    "confidence",
    "limitations",
  ],
  properties: {
    executiveSummary: { type: "string" },
    keyChanges: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["change", "impact", "evidence"],
        properties: {
          change: { type: "string" },
          impact: { type: "string" },
          evidence: { type: "string" },
        },
      },
    },
    historicalEvidence: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["event", "outcome", "relevance"],
        properties: {
          event: { type: "string" },
          outcome: { type: "string" },
          relevance: { type: "string" },
        },
      },
    },
    recommendedActions: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["action", "reason"],
        properties: {
          action: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    confidence: {
      type: "string",
      enum: ["LOW", "MEDIUM", "HIGH"],
    },
    limitations: {
      type: "array",
      maxItems: 8,
      items: { type: "string" },
    },
  },
} as const;
