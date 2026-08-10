export type SplitColor = {
  id: string;
  bg: string;
  border: string;
  accent: string;
};

export const SPLIT_COLORS: SplitColor[] = [
  {
    id: "green",
    bg: "rgba(52, 211, 153, 0.14)",
    border: "rgba(52, 211, 153, 0.4)",
    accent: "#34d399",
  },
  {
    id: "purple",
    bg: "rgba(167, 139, 250, 0.14)",
    border: "rgba(167, 139, 250, 0.4)",
    accent: "#a78bfa",
  },
  {
    id: "amber",
    bg: "rgba(251, 191, 36, 0.14)",
    border: "rgba(251, 191, 36, 0.4)",
    accent: "#fbbf24",
  },
  {
    id: "blue",
    bg: "rgba(96, 165, 250, 0.14)",
    border: "rgba(96, 165, 250, 0.4)",
    accent: "#60a5fa",
  },
  {
    id: "pink",
    bg: "rgba(244, 114, 182, 0.14)",
    border: "rgba(244, 114, 182, 0.4)",
    accent: "#f472b6",
  },
  {
    id: "teal",
    bg: "rgba(45, 212, 191, 0.14)",
    border: "rgba(45, 212, 191, 0.4)",
    accent: "#2dd4bf",
  },
];

/** Split after these 0-based page indices (between index and index+1). */
export function buildGroupsFromSplits(
  pageCount: number,
  splitAfter: Set<number>,
): number[][] {
  if (pageCount <= 0) return [];
  const groups: number[][] = [];
  let current: number[] = [];

  for (let i = 0; i < pageCount; i += 1) {
    current.push(i);
    if (splitAfter.has(i) && i < pageCount - 1) {
      groups.push(current);
      current = [];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

export function groupIndexForPage(
  groups: number[][],
  pageIndex: number,
): number {
  return groups.findIndex((group) => group.includes(pageIndex));
}

export function splitsEveryNPages(pageCount: number, n: number): Set<number> {
  const splits = new Set<number>();
  if (n < 1 || pageCount < 2) return splits;
  for (let i = n - 1; i < pageCount - 1; i += n) {
    splits.add(i);
  }
  return splits;
}

export function toggleSplitAfter(splitAfter: Set<number>, index: number): Set<number> {
  const next = new Set(splitAfter);
  if (next.has(index)) next.delete(index);
  else next.add(index);
  return next;
}
