import type { UnifiedMexcServiceV2 } from "@/src/services/api/unified-mexc-service-v2";
import type { CoreTradingConfig } from "@/src/services/trading/consolidated/core-trading/types";

export interface DynamicPositionSizeOptions {
  minPositionUsdt?: number; // default 1
  maxPositionUsdt?: number; // optional hard cap
  perTradeFraction?: number; // e.g. 0.02 = 2% of total
  maxUtilizationFraction?: number; // e.g. 0.1 = 10% of free USDT
}

const DEFAULT_OPTIONS: Required<DynamicPositionSizeOptions> = {
  minPositionUsdt: 1,
  maxPositionUsdt: Number.POSITIVE_INFINITY,
  perTradeFraction: 0.02,
  maxUtilizationFraction: 0.1,
};

export async function computeDynamicPositionSizeUsdt(
  mexcService: UnifiedMexcServiceV2,
  config: CoreTradingConfig,
  _target: { positionSizeUsdt?: number | null },
  options: DynamicPositionSizeOptions = {},
): Promise<number> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Prefer explicit configured maxPositionSize if present
  const effectiveMaxPosition =
    typeof config.maxPositionSize === "number" && config.maxPositionSize > 0
      ? Math.min(config.maxPositionSize, opts.maxPositionUsdt)
      : opts.maxPositionUsdt;

  const summary = await mexcService.getAccountBalances();
  if (!summary.success || !summary.data) {
    // Fallback: use explicit target size or safe minimum
    return _target.positionSizeUsdt && _target.positionSizeUsdt > 0
      ? Math.max(_target.positionSizeUsdt, opts.minPositionUsdt)
      : opts.minPositionUsdt;
  }

  const { balances, totalUsdtValue } = summary.data;
  const usdtBalance = balances.find((b) => b.asset.toUpperCase() === "USDT");
  const freeUsdt = usdtBalance
    ? Number(balances.find((b) => b.asset.toUpperCase() === "USDT")?.free || 0)
    : 0;

  // Compute candidates
  const byTotalFraction = totalUsdtValue * opts.perTradeFraction;
  const byFreeFraction = freeUsdt * opts.maxUtilizationFraction;

  let size = Math.min(byTotalFraction, byFreeFraction, effectiveMaxPosition);

  if (!Number.isFinite(size) || size <= 0) {
    size =
      _target.positionSizeUsdt && _target.positionSizeUsdt > 0
        ? _target.positionSizeUsdt
        : opts.minPositionUsdt;
  }

  if (size < opts.minPositionUsdt) size = opts.minPositionUsdt;

  return size;
}
