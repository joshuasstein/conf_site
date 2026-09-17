"use client";

import { useState } from "react";

export type SortDir = "asc" | "desc";

// Value a column sorts by. null/undefined always sort last, regardless of direction.
type SortValue = string | number | boolean | null | undefined;

/**
 * Client-side table sorting. `accessors` maps a column key to the value that
 * column sorts by. Clicking a header cycles asc → desc; clicking a different
 * header starts at asc. Strings compare case-insensitively and numeric-aware
 * ("Talk 2" before "Talk 10"); booleans sort true first when ascending.
 */
export function useSort<T>(
  items: T[],
  accessors: Record<string, (item: T) => SortValue>,
  initial?: { key: string; dir?: SortDir },
) {
  const [sort, setSort] = useState<{ key: string | null; dir: SortDir }>({
    key: initial?.key ?? null,
    dir: initial?.dir ?? "asc",
  });

  const { key, dir } = sort;
  let sorted = items;
  const accessor = key ? accessors[key] : undefined;
  if (accessor) {
    const factor = dir === "asc" ? 1 : -1;
    sorted = [...items].sort((a, b) => {
      const va = accessor(a);
      const vb = accessor(b);
      // Missing values sink to the bottom in either direction.
      const aEmpty = va === null || va === undefined || va === "";
      const bEmpty = vb === null || vb === undefined || vb === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;

      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else if (typeof va === "boolean" && typeof vb === "boolean") cmp = va === vb ? 0 : va ? -1 : 1;
      else cmp = String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
      return cmp * factor;
    });
  }

  const toggle = (k: string) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));

  return { sorted, sortKey: key, sortDir: dir, toggle };
}
