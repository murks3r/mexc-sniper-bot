/**
 * Correlation Calculator Module
 *
 * Extracted from enhanced-risk-manager.ts to reduce complexity
 * Handles asset correlation estimation using matrix lookups and category-based logic
 */

/**
 * Major crypto correlations based on market data patterns
 */
const CORRELATION_MATRIX: Record<string, Record<string, number>> = {
  BTC: { ETH: 0.72, BNB: 0.65, ADA: 0.58, SOL: 0.61, DOT: 0.55 },
  ETH: { BTC: 0.72, BNB: 0.68, ADA: 0.62, SOL: 0.71, DOT: 0.59 },
  BNB: { BTC: 0.65, ETH: 0.68, ADA: 0.52, SOL: 0.58, DOT: 0.51 },
  ADA: { BTC: 0.58, ETH: 0.62, BNB: 0.52, SOL: 0.56, DOT: 0.61 },
  SOL: { BTC: 0.61, ETH: 0.71, BNB: 0.58, ADA: 0.56, DOT: 0.54 },
  DOT: { BTC: 0.55, ETH: 0.59, BNB: 0.51, ADA: 0.61, SOL: 0.54 },
};

/**
 * Asset categories for correlation estimation
 */
const ASSET_CATEGORIES: Record<string, string[]> = {
  major: ["BTC", "ETH", "BNB"],
  defi: ["UNI", "SUSHI", "COMP", "AAVE", "CRV"],
  layer1: ["ETH", "SOL", "ADA", "DOT", "AVAX", "NEAR"],
  meme: ["DOGE", "SHIB", "PEPE", "FLOKI"],
  gaming: ["AXS", "SAND", "MANA", "ENJ", "GALA"],
  metaverse: ["SAND", "MANA", "ENJ", "CHR"],
  stablecoin: ["USDT", "USDC", "BUSD", "DAI"],
};

/**
 * Same-category correlation values
 */
const SAME_CATEGORY_CORRELATIONS: Record<string, number> = {
  major: 0.75,
  defi: 0.68,
  layer1: 0.62,
  meme: 0.71,
  gaming: 0.65,
  metaverse: 0.74,
  stablecoin: 0.95,
  other: 0.45,
};

/**
 * Cross-category correlation mappings
 */
const CROSS_CATEGORY_CORRELATIONS: Array<{
  categories: [string, string];
  correlation: number;
}> = [
  { categories: ["major", "layer1"], correlation: 0.58 },
  { categories: ["layer1", "major"], correlation: 0.58 },
  { categories: ["defi", "layer1"], correlation: 0.55 },
  { categories: ["layer1", "defi"], correlation: 0.55 },
];

/**
 * Extract base asset from trading pair symbol
 */
export function extractBaseAsset(symbol: string): string {
  return symbol.replace(/USDT$|BUSD$|BTC$|ETH$|BNB$/, "").toUpperCase();
}

/**
 * Get asset category
 */
function getAssetCategory(asset: string): string {
  for (const [category, assets] of Object.entries(ASSET_CATEGORIES)) {
    if (assets.includes(asset)) {
      return category;
    }
  }
  return "other";
}

/**
 * Get correlation for same category assets
 */
function getSameCategoryCorrelation(category: string): number {
  return SAME_CATEGORY_CORRELATIONS[category] || SAME_CATEGORY_CORRELATIONS.other;
}

/**
 * Get cross-category correlation
 */
function getCrossCategoryCorrelation(category1: string, category2: string): number | null {
  for (const { categories, correlation } of CROSS_CATEGORY_CORRELATIONS) {
    if (
      (categories[0] === category1 && categories[1] === category2) ||
      (categories[0] === category2 && categories[1] === category1)
    ) {
      return correlation;
    }
  }
  return null;
}

/**
 * Estimate correlation between two symbols
 */
export function estimateCorrelation(symbol1: string, symbol2: string): number {
  // Return 1 for identical symbols
  if (symbol1 === symbol2) {
    return 1;
  }

  try {
    const asset1 = extractBaseAsset(symbol1);
    const asset2 = extractBaseAsset(symbol2);

    // Check direct correlation matrix first
    if (CORRELATION_MATRIX[asset1]?.[asset2]) {
      return CORRELATION_MATRIX[asset1][asset2];
    }

    const category1 = getAssetCategory(asset1);
    const category2 = getAssetCategory(asset2);

    // Same category correlations
    if (category1 === category2) {
      return getSameCategoryCorrelation(category1);
    }

    // Stablecoins have low correlation with other assets
    if (category1 === "stablecoin" || category2 === "stablecoin") {
      return 0.15;
    }

    // Check cross-category correlations
    const crossCategoryCorr = getCrossCategoryCorrelation(category1, category2);
    if (crossCategoryCorr !== null) {
      return crossCategoryCorr;
    }

    // Default correlation for unrelated assets
    return 0.35;
  } catch (error) {
    // Conservative default on error
    return 0.35;
  }
}
