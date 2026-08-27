export type RatioLike = {
  key: string;
  label: string;
};

const COMMON_RATIO_ORDER = ['auto', '1:1', '3:4', '4:3', '9:16', '16:9', '2:3'];
const COLLAPSE_THRESHOLD = 8;

export function shouldCollapseRatioOptions(options: RatioLike[], threshold = COLLAPSE_THRESHOLD) {
  return options.length > threshold;
}

export function getVisibleRatioOptions<T extends RatioLike>(
  options: T[],
  expanded: boolean,
  selectedKey: string,
  threshold = COLLAPSE_THRESHOLD,
) {
  if (!shouldCollapseRatioOptions(options, threshold) || expanded) return options;

  const byKey = new Map(options.map((item) => [item.key, item]));
  const visible: T[] = [];
  for (const key of COMMON_RATIO_ORDER) {
    const item = byKey.get(key);
    if (item) visible.push(item);
  }

  const selected = byKey.get(selectedKey);
  if (selected && !visible.some((item) => item.key === selected.key)) {
    visible.push(selected);
  }

  return visible.length ? visible : options.slice(0, threshold);
}
