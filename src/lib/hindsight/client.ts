import "server-only";

import { HindsightClient } from "@vectorize-io/hindsight-client";
import type { HindsightClientLike } from "./types";

let client: HindsightClientLike | null = null;

function getHindsightConfig() {
  const apiKey = process.env.HINDSIGHT_API_KEY;
  const baseUrl =
    process.env.HINDSIGHT_BASE_URL ?? "https://api.hindsight.vectorize.io";

  return {
    apiKey,
    baseUrl,
    enabled: Boolean(apiKey),
  };
}

export function isHindsightConfigured() {
  return getHindsightConfig().enabled;
}

export function getHindsightClient(): HindsightClientLike | null {
  const config = getHindsightConfig();

  if (!config.enabled) {
    return null;
  }
  const apiKey = config.apiKey;

  if (!apiKey) {
    return null;
  }

  if (!client) {
    const hindsightClient = new HindsightClient({
      baseUrl: config.baseUrl,
      apiKey,
    });

    client = {
      retain: hindsightClient.retain.bind(hindsightClient),
      recall: hindsightClient.recall.bind(hindsightClient),
      getBankProfile: hindsightClient.getBankProfile.bind(hindsightClient),
      createBank: hindsightClient.createBank.bind(hindsightClient),
    } satisfies HindsightClientLike;
  }

  return client;
}
