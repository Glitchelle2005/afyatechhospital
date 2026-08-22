import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Lovable AI Gateway provider. Server-only: the key never reaches the browser. */
export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { "Lovable-API-Key": apiKey },
  });
}
