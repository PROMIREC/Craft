import { dibQuestionSetV0_1, type DibQuestion } from "@/dib/questionSet.v0_1";

export type DibValidationError = { path: string; message: string };

function getByPointer(obj: any, pointer: string): any {
  if (!pointer.startsWith("/")) return undefined;
  const parts = pointer.split("/").slice(1).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as any)[p];
  }
  return cur;
}

function questionApplies(question: DibQuestion, draft: Record<string, unknown>): boolean {
  if (!question.depends_on) return true;
  const v = getByPointer(draft, question.depends_on.path);
  if ("equals" in question.depends_on) return v === question.depends_on.equals;
  if ("gte" in question.depends_on) return typeof v === "number" && v >= question.depends_on.gte;
  return true;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export function validateDibDraft(draft: Record<string, unknown>): DibValidationError[] {
  const errors: DibValidationError[] = [];

  for (const q of dibQuestionSetV0_1.questions) {
    if (!questionApplies(q, draft)) continue;
    const v = getByPointer(draft, q.store_path);

    if (q.required && v === undefined) {
      errors.push({ path: q.store_path, message: "Required." });
      continue;
    }
    if (v === undefined) continue;

    if (q.kind === "confirm") {
      if (v !== true) errors.push({ path: q.store_path, message: "Must be confirmed." });
    } else if (q.kind === "boolean") {
      if (typeof v !== "boolean") errors.push({ path: q.store_path, message: "Must be true/false." });
    } else if (q.kind === "enum") {
      if (typeof v !== "string" || !q.options?.includes(v)) {
        errors.push({ path: q.store_path, message: `Must be one of: ${(q.options ?? []).join(", ")}` });
      }
    } else if (q.kind === "integer") {
      if (!isFiniteNumber(v) || !Number.isInteger(v)) errors.push({ path: q.store_path, message: "Must be an integer." });
    } else if (q.kind === "number" || q.kind === "number_mm") {
      if (!isFiniteNumber(v)) errors.push({ path: q.store_path, message: "Must be a number." });
    } else if (q.kind === "text") {
      if (typeof v !== "string") errors.push({ path: q.store_path, message: "Must be text." });
    }

    if (isFiniteNumber(v)) {
      if (q.min !== undefined && v < q.min) errors.push({ path: q.store_path, message: `Must be ≥ ${q.min}.` });
      if (q.max !== undefined && v > q.max) errors.push({ path: q.store_path, message: `Must be ≤ ${q.max}.` });
    }
  }

  // Cross-field validations (V1 minimal)
  const overallDepth = getByPointer(draft, "/overall/depth_mm");
  const backClearance = getByPointer(draft, "/constraints/back_clearance_mm");
  if (isFiniteNumber(overallDepth) && isFiniteNumber(backClearance)) {
    if (backClearance >= overallDepth) {
      errors.push({
        path: "/constraints/back_clearance_mm",
        message: "Must be less than overall depth."
      });
    }
  }

  return errors;
}

