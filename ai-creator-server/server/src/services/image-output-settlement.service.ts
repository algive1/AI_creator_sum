export interface ImageOutputSettlementInput {
  urls: string[];
  expectedImageCount: number;
  frozenPointsCost: number;
  unitPointsCost?: number | null;
}

export interface ImageOutputSettlementPlan {
  outputUrls: string[];
  expectedImageCount: number;
  actualImageCount: number;
  pointsCost: number;
  refundPointsCost: number;
  partial: boolean;
  shouldFail: boolean;
}

export function planImageOutputSettlement(input: ImageOutputSettlementInput): ImageOutputSettlementPlan {
  const expectedImageCount = Math.max(1, Math.trunc(Number(input.expectedImageCount || 1)));
  const frozenPointsCost = Math.max(0, Math.trunc(Number(input.frozenPointsCost || 0)));
  const urls = Array.isArray(input.urls) ? input.urls.filter(Boolean) : [];
  const outputUrls = urls.slice(0, expectedImageCount);
  const actualImageCount = outputUrls.length;
  const shouldFail = actualImageCount === 0;
  const partial = actualImageCount > 0 && actualImageCount < expectedImageCount;
  const unitPointsCost = Math.max(0, Math.trunc(Number(input.unitPointsCost || 0)));
  const proportionalCost = Math.ceil((frozenPointsCost * actualImageCount) / expectedImageCount);
  const rawPointsCost = unitPointsCost > 0 ? unitPointsCost * actualImageCount : proportionalCost;
  const pointsCost = shouldFail ? 0 : Math.min(frozenPointsCost, Math.max(0, rawPointsCost));
  const refundPointsCost = shouldFail ? frozenPointsCost : Math.max(0, frozenPointsCost - pointsCost);

  return {
    outputUrls,
    expectedImageCount,
    actualImageCount,
    pointsCost,
    refundPointsCost,
    partial,
    shouldFail,
  };
}
