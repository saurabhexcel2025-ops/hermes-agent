import { listFallbackChain } from "@/lib/fallbacks-repository";
import { syncFallbacksToHermesConfig } from "@/lib/hermes-config-sync";
import type { FallbackConfig } from "@/types/hermes";

export function mapEnabledFallbackChainForSync() {
  return listFallbackChain()
    .filter((e) => e.enabled)
    .map((e) => ({
      modelId: e.modelIdString,
      provider: e.provider,
      baseUrl: null as string | null,
      overrideBaseUrl: e.overrideBaseUrl,
      apiKey: null as string | null,
    }));
}

export function syncEnabledFallbackChainToHermes(config: FallbackConfig) {
  return syncFallbacksToHermesConfig(mapEnabledFallbackChainForSync(), {
    restorePrimaryOnFallback: config.restorePrimaryOnFallback,
    fallbackNotification: config.fallbackNotification,
    apiMaxRetries: config.apiMaxRetries,
  });
}
