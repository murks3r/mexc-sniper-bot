/**
 * MEXC Client Factory
 *
 * Factory for creating UnifiedMexcServiceV2 instances.
 * Provides backward compatibility with UnifiedMexcClient type.
 */

import type { UnifiedMexcServiceV2 } from "./unified-mexc-service-v2";
import { getUnifiedMexcServiceV2 } from "./unified-mexc-service-v2";

/**
 * UnifiedMexcClient type alias for backward compatibility
 */
export type UnifiedMexcClient = UnifiedMexcServiceV2;

/**
 * Get a unified MEXC client instance
 */
export function getUnifiedMexcClient(config?: {
  apiKey?: string;
  secretKey?: string;
  passphrase?: string;
}): UnifiedMexcClient {
  return getUnifiedMexcServiceV2(config);
}
