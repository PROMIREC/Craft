export function stableStringify(value: unknown): string {
  return JSON.stringify(sortRec(value), null, 2) + "\n";
}

function sortRec(value: any): any {
  if (Array.isArray(value)) return value.map(sortRec);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const v = (value as any)[key];
      if (v === undefined) continue;
      out[key] = sortRec(v);
    }
    return out;
  }
  return value;
}

