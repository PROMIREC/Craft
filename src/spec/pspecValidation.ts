import type { ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import fs from "node:fs/promises";
import path from "node:path";
import type { PspecV0_1 } from "@/spec/pspecTypes";

export type PspecValidationError = { message: string; instancePath: string };

let validateFn: ValidateFunction | null = null;

async function getValidator(): Promise<ValidateFunction> {
  if (validateFn) return validateFn;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const schemaPath = path.join(process.cwd(), "schemas", "pspec.schema.json");
  const schemaRaw = await fs.readFile(schemaPath, "utf8");
  const schema = JSON.parse(schemaRaw);
  validateFn = ajv.compile(schema);
  return validateFn;
}

export async function validatePspecAgainstSchema(pspec: unknown): Promise<PspecValidationError[]> {
  const v = await getValidator();
  const ok = v(pspec);
  if (ok) return [];
  return (v.errors ?? []).map((e) => ({
    message: String(e.message ?? "Invalid"),
    instancePath: String(e.instancePath ?? "")
  }));
}

export function validatePspecManufacturability(pspec: PspecV0_1): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const availableDepth = pspec.overall.depth_mm - pspec.constraints.back_clearance_mm;
  if (!(availableDepth > 0)) errors.push("overall.depth_mm must exceed constraints.back_clearance_mm.");

  const envDepth = (componentDepth: number, front: number, rear: number) => componentDepth + front + rear;

  if (availableDepth > 0) {
    const sp = pspec.components.speakers;
    const amp = pspec.components.amplifier;
    const tt = pspec.components.turntable;

    if (envDepth(sp.external_mm.depth_mm, sp.clearance_mm.front_mm, sp.clearance_mm.rear_mm) > availableDepth) {
      errors.push("Speakers exceed available depth (overall.depth_mm - back_clearance_mm) when clearances are applied.");
    }
    if (envDepth(amp.external_mm.depth_mm, amp.clearance_mm.front_mm, amp.clearance_mm.rear_mm) > availableDepth) {
      errors.push("Amplifier exceeds available depth (overall.depth_mm - back_clearance_mm) when clearances are applied.");
    }
    if (envDepth(tt.external_mm.depth_mm, tt.clearance_mm.front_mm, tt.clearance_mm.rear_mm) > availableDepth) {
      errors.push("Turntable exceeds available depth (overall.depth_mm - back_clearance_mm) when clearances are applied.");
    }

    // Example conflict check: LP drawer depth vs cabinet depth minus back clearance.
    if (pspec.components.drawers.count > 0) {
      const minLpDrawerDepthMm = 330;
      if (availableDepth < minLpDrawerDepthMm) {
        errors.push(
          `Drawers requested, but available depth (${availableDepth}mm) is less than minimum LP drawer depth (${minLpDrawerDepthMm}mm).`
        );
      }
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true };
}
