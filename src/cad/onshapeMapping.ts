import path from "node:path";
import { stableStringify } from "@/pipeline/stableJson";
import { atomicWriteFile, assertValidProjectId, projectRoot, safeJoin } from "@/storage/fsStorage";
import type { PspecV0_1 } from "@/spec/pspecTypes";

export const ONSHAPE_TEMPLATE_CONTRACT_VERSION = "0.1.0" as const;

export type OnshapeVariableUnit = "mm" | "count" | "flag" | "enum";
export type OnshapeVariableSource = "DIB" | "DEFAULT" | "DERIVED";

export type OnshapeVariableProvenance = {
  var: string;
  value: number;
  unit: OnshapeVariableUnit;
  source: OnshapeVariableSource;
  pspecPath: string;
  notes?: string;
};

export type OnshapeMappingErrorCode = "MISSING_FIELD" | "INVALID_VALUE" | "OUT_OF_RANGE";

export type OnshapeMappingError = {
  code: OnshapeMappingErrorCode;
  var: string;
  pspecPath?: string;
  message: string;
};

export type OnshapeMappingResult =
  | {
      ok: true;
      contract_version: typeof ONSHAPE_TEMPLATE_CONTRACT_VERSION;
      variables: Record<string, number>;
      provenance: OnshapeVariableProvenance[];
    }
  | {
      ok: false;
      contract_version: typeof ONSHAPE_TEMPLATE_CONTRACT_VERSION;
      errors: OnshapeMappingError[];
    };

function revId(revision: number): string {
  return `rev-${String(revision).padStart(4, "0")}`;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function roundMm(value: number): number {
  return Math.round(value);
}

function intInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function enumCode<T extends string>(value: string, mapping: Record<T, number>): number | null {
  if (Object.prototype.hasOwnProperty.call(mapping, value)) return (mapping as any)[value] as number;
  return null;
}

export function mapPspecToOnshapeVariables(
  pspec: PspecV0_1,
  _profile?: PspecV0_1["output_profile"]
): OnshapeMappingResult {
  const errors: OnshapeMappingError[] = [];
  const variables: Record<string, number> = {};
  const provenance: OnshapeVariableProvenance[] = [];

  function addError(e: OnshapeMappingError) {
    errors.push(e);
  }

  function addVar(args: {
    var: string;
    unit: OnshapeVariableUnit;
    source: OnshapeVariableSource;
    pspecPath: string;
    value: unknown;
    range?: { min: number; max: number };
    rounding?: "mm";
    notes?: string;
  }) {
    if (args.value === undefined || args.value === null) {
      addError({
        code: "MISSING_FIELD",
        var: args.var,
        pspecPath: args.pspecPath,
        message: "Missing required PSPEC field."
      });
      return;
    }

    if (!isFiniteNumber(args.value)) {
      addError({
        code: "INVALID_VALUE",
        var: args.var,
        pspecPath: args.pspecPath,
        message: `Expected a finite number, got ${typeof args.value}.`
      });
      return;
    }

    const n = args.rounding === "mm" ? roundMm(args.value) : args.value;

    if (!Number.isInteger(n)) {
      addError({
        code: "INVALID_VALUE",
        var: args.var,
        pspecPath: args.pspecPath,
        message: "Expected an integer value."
      });
      return;
    }

    if (args.range && !intInRange(n, args.range.min, args.range.max)) {
      addError({
        code: "OUT_OF_RANGE",
        var: args.var,
        pspecPath: args.pspecPath,
        message: `Value ${n} is outside allowed range ${args.range.min}…${args.range.max}.`
      });
      return;
    }

    variables[args.var] = n;
    provenance.push({
      var: args.var,
      value: n,
      unit: args.unit,
      source: args.source,
      pspecPath: args.pspecPath,
      ...(args.notes ? { notes: args.notes } : {})
    });
  }

  function addFlag(args: { var: string; source: OnshapeVariableSource; pspecPath: string; value: unknown; notes?: string }) {
    if (args.value === undefined || args.value === null) {
      addError({ code: "MISSING_FIELD", var: args.var, pspecPath: args.pspecPath, message: "Missing required PSPEC field." });
      return;
    }
    if (typeof args.value !== "boolean") {
      addError({ code: "INVALID_VALUE", var: args.var, pspecPath: args.pspecPath, message: "Expected a boolean value." });
      return;
    }
    const n = args.value ? 1 : 0;
    variables[args.var] = n;
    provenance.push({
      var: args.var,
      value: n,
      unit: "flag",
      source: args.source,
      pspecPath: args.pspecPath,
      ...(args.notes ? { notes: args.notes } : {})
    });
  }

  const mmPos = { min: 1, max: 10000 };
  const mmClr = { min: 0, max: 2000 };

  addVar({ var: "OVERALL_W", unit: "mm", source: "DIB", pspecPath: "/overall/width_mm", value: pspec.overall.width_mm, rounding: "mm", range: mmPos });
  addVar({ var: "OVERALL_H", unit: "mm", source: "DIB", pspecPath: "/overall/height_mm", value: pspec.overall.height_mm, rounding: "mm", range: mmPos });
  addVar({ var: "OVERALL_D", unit: "mm", source: "DIB", pspecPath: "/overall/depth_mm", value: pspec.overall.depth_mm, rounding: "mm", range: mmPos });
  addVar({
    var: "OVERALL_BACK_CLEARANCE",
    unit: "mm",
    source: "DIB",
    pspecPath: "/constraints/back_clearance_mm",
    value: pspec.constraints.back_clearance_mm,
    rounding: "mm",
    range: mmClr
  });

  // Derived: available depth.
  addVar({
    var: "OVERALL_AVAILABLE_DEPTH",
    unit: "mm",
    source: "DERIVED",
    pspecPath: "DERIVED: /overall/depth_mm - /constraints/back_clearance_mm",
    value: pspec.overall.depth_mm - pspec.constraints.back_clearance_mm,
    rounding: "mm",
    range: { min: 1, max: 10000 },
    notes: "Derived: round(overall.depth_mm - constraints.back_clearance_mm)."
  });

  addVar({
    var: "MAT_THICKNESS",
    unit: "mm",
    source: "DIB",
    pspecPath: "/material/thickness_mm",
    value: pspec.material.thickness_mm,
    rounding: "mm",
    range: { min: 1, max: 2000 }
  });

  // Optional enum codes (still emitted deterministically when present).
  const materialTypeCode = enumCode(pspec.material.type, {
    plywood: 0,
    mdf: 1,
    veneer_plywood: 2,
    other: 3
  } as const);
  if (materialTypeCode === null) {
    addError({
      code: "INVALID_VALUE",
      var: "MAT_TYPE_CODE",
      pspecPath: "/material/type",
      message: `Unexpected material.type: ${JSON.stringify(pspec.material.type)}.`
    });
  } else {
    addVar({
      var: "MAT_TYPE_CODE",
      unit: "enum",
      source: "DIB",
      pspecPath: "/material/type",
      value: materialTypeCode,
      range: { min: 0, max: 3 }
    });
  }

  const speakerClrNote = "Derived in PSPEC v0.1: clearance_mm is applied equally to all sides from DIB speakers.required_clearance_mm.";
  const ampClrNote = "Derived in PSPEC v0.1: clearance_mm is applied equally to all sides from DIB amplifier.required_clearance_mm.";
  const ttClrNote = "Default in PSPEC v0.1: turntable clearance_mm is always 0.";

  const speaker = pspec.components.speakers;
  const spkDims = speaker.external_mm;

  for (const side of ["L", "R"] as const) {
    addVar({ var: `SPK_${side}_W`, unit: "mm", source: "DIB", pspecPath: "/components/speakers/external_mm/width_mm", value: spkDims.width_mm, rounding: "mm", range: mmPos });
    addVar({ var: `SPK_${side}_H`, unit: "mm", source: "DIB", pspecPath: "/components/speakers/external_mm/height_mm", value: spkDims.height_mm, rounding: "mm", range: mmPos });
    addVar({ var: `SPK_${side}_D`, unit: "mm", source: "DIB", pspecPath: "/components/speakers/external_mm/depth_mm", value: spkDims.depth_mm, rounding: "mm", range: mmPos });

    addVar({ var: `SPK_${side}_CLR_L`, unit: "mm", source: "DERIVED", pspecPath: "/components/speakers/clearance_mm/left_mm", value: speaker.clearance_mm.left_mm, rounding: "mm", range: mmClr, notes: speakerClrNote });
    addVar({ var: `SPK_${side}_CLR_R`, unit: "mm", source: "DERIVED", pspecPath: "/components/speakers/clearance_mm/right_mm", value: speaker.clearance_mm.right_mm, rounding: "mm", range: mmClr, notes: speakerClrNote });
    addVar({ var: `SPK_${side}_CLR_T`, unit: "mm", source: "DERIVED", pspecPath: "/components/speakers/clearance_mm/top_mm", value: speaker.clearance_mm.top_mm, rounding: "mm", range: mmClr, notes: speakerClrNote });
    addVar({ var: `SPK_${side}_CLR_B`, unit: "mm", source: "DERIVED", pspecPath: "/components/speakers/clearance_mm/bottom_mm", value: speaker.clearance_mm.bottom_mm, rounding: "mm", range: mmClr, notes: speakerClrNote });
    addVar({ var: `SPK_${side}_CLR_F`, unit: "mm", source: "DERIVED", pspecPath: "/components/speakers/clearance_mm/front_mm", value: speaker.clearance_mm.front_mm, rounding: "mm", range: mmClr, notes: speakerClrNote });
    addVar({ var: `SPK_${side}_CLR_REAR`, unit: "mm", source: "DERIVED", pspecPath: "/components/speakers/clearance_mm/rear_mm", value: speaker.clearance_mm.rear_mm, rounding: "mm", range: mmClr, notes: speakerClrNote });
  }

  const tt = pspec.components.turntable;
  addVar({ var: "TURNTABLE_W", unit: "mm", source: "DIB", pspecPath: "/components/turntable/external_mm/width_mm", value: tt.external_mm.width_mm, rounding: "mm", range: mmPos });
  addVar({ var: "TURNTABLE_H", unit: "mm", source: "DIB", pspecPath: "/components/turntable/external_mm/height_mm", value: tt.external_mm.height_mm, rounding: "mm", range: mmPos });
  addVar({ var: "TURNTABLE_D", unit: "mm", source: "DIB", pspecPath: "/components/turntable/external_mm/depth_mm", value: tt.external_mm.depth_mm, rounding: "mm", range: mmPos });
  addVar({ var: "TURNTABLE_CLR_L", unit: "mm", source: "DEFAULT", pspecPath: "/components/turntable/clearance_mm/left_mm", value: tt.clearance_mm.left_mm, rounding: "mm", range: mmClr, notes: ttClrNote });
  addVar({ var: "TURNTABLE_CLR_R", unit: "mm", source: "DEFAULT", pspecPath: "/components/turntable/clearance_mm/right_mm", value: tt.clearance_mm.right_mm, rounding: "mm", range: mmClr, notes: ttClrNote });
  addVar({ var: "TURNTABLE_CLR_T", unit: "mm", source: "DEFAULT", pspecPath: "/components/turntable/clearance_mm/top_mm", value: tt.clearance_mm.top_mm, rounding: "mm", range: mmClr, notes: ttClrNote });
  addVar({ var: "TURNTABLE_CLR_B", unit: "mm", source: "DEFAULT", pspecPath: "/components/turntable/clearance_mm/bottom_mm", value: tt.clearance_mm.bottom_mm, rounding: "mm", range: mmClr, notes: ttClrNote });
  addVar({ var: "TURNTABLE_CLR_F", unit: "mm", source: "DEFAULT", pspecPath: "/components/turntable/clearance_mm/front_mm", value: tt.clearance_mm.front_mm, rounding: "mm", range: mmClr, notes: ttClrNote });
  addVar({ var: "TURNTABLE_CLR_REAR", unit: "mm", source: "DEFAULT", pspecPath: "/components/turntable/clearance_mm/rear_mm", value: tt.clearance_mm.rear_mm, rounding: "mm", range: mmClr, notes: ttClrNote });

  const amp = pspec.components.amplifier;
  addVar({ var: "AMP_W", unit: "mm", source: "DIB", pspecPath: "/components/amplifier/external_mm/width_mm", value: amp.external_mm.width_mm, rounding: "mm", range: mmPos });
  addVar({ var: "AMP_H", unit: "mm", source: "DIB", pspecPath: "/components/amplifier/external_mm/height_mm", value: amp.external_mm.height_mm, rounding: "mm", range: mmPos });
  addVar({ var: "AMP_D", unit: "mm", source: "DIB", pspecPath: "/components/amplifier/external_mm/depth_mm", value: amp.external_mm.depth_mm, rounding: "mm", range: mmPos });
  addVar({ var: "AMP_CLR_L", unit: "mm", source: "DERIVED", pspecPath: "/components/amplifier/clearance_mm/left_mm", value: amp.clearance_mm.left_mm, rounding: "mm", range: mmClr, notes: ampClrNote });
  addVar({ var: "AMP_CLR_R", unit: "mm", source: "DERIVED", pspecPath: "/components/amplifier/clearance_mm/right_mm", value: amp.clearance_mm.right_mm, rounding: "mm", range: mmClr, notes: ampClrNote });
  addVar({ var: "AMP_CLR_T", unit: "mm", source: "DERIVED", pspecPath: "/components/amplifier/clearance_mm/top_mm", value: amp.clearance_mm.top_mm, rounding: "mm", range: mmClr, notes: ampClrNote });
  addVar({ var: "AMP_CLR_B", unit: "mm", source: "DERIVED", pspecPath: "/components/amplifier/clearance_mm/bottom_mm", value: amp.clearance_mm.bottom_mm, rounding: "mm", range: mmClr, notes: ampClrNote });
  addVar({ var: "AMP_CLR_F", unit: "mm", source: "DERIVED", pspecPath: "/components/amplifier/clearance_mm/front_mm", value: amp.clearance_mm.front_mm, rounding: "mm", range: mmClr, notes: ampClrNote });
  addVar({ var: "AMP_CLR_REAR", unit: "mm", source: "DERIVED", pspecPath: "/components/amplifier/clearance_mm/rear_mm", value: amp.clearance_mm.rear_mm, rounding: "mm", range: mmClr, notes: ampClrNote });

  const ventDirCode = enumCode(amp.ventilation_direction, {
    front: 0,
    rear: 1,
    up: 2,
    left: 3,
    right: 4
  } as const);
  if (ventDirCode === null) {
    addError({
      code: "INVALID_VALUE",
      var: "AMP_VENT_DIR_CODE",
      pspecPath: "/components/amplifier/ventilation_direction",
      message: `Unexpected amplifier.ventilation_direction: ${JSON.stringify(amp.ventilation_direction)}.`
    });
  } else {
    addVar({
      var: "AMP_VENT_DIR_CODE",
      unit: "enum",
      source: "DIB",
      pspecPath: "/components/amplifier/ventilation_direction",
      value: ventDirCode,
      range: { min: 0, max: 4 }
    });
  }

  addVar({
    var: "DRAWER_COUNT",
    unit: "count",
    source: "DIB",
    pspecPath: "/components/drawers/count",
    value: pspec.components.drawers.count,
    range: { min: 0, max: 6 }
  });
  addVar({
    var: "DRAWER_LP_CAP_TARGET",
    unit: "count",
    source: "DIB",
    pspecPath: "/components/drawers/lp_capacity_target",
    value: pspec.components.drawers.lp_capacity_target,
    range: { min: 0, max: 3000 }
  });

  addFlag({
    var: "ACCESS_REAR_SERVICE_HATCH",
    source: "DIB",
    pspecPath: "/access/rear_service_hatch",
    value: pspec.access.rear_service_hatch
  });

  if (errors.length) {
    errors.sort((a, b) => a.var.localeCompare(b.var));
    return { ok: false, contract_version: ONSHAPE_TEMPLATE_CONTRACT_VERSION, errors };
  }

  provenance.sort((a, b) => a.var.localeCompare(b.var));
  return { ok: true, contract_version: ONSHAPE_TEMPLATE_CONTRACT_VERSION, variables, provenance };
}

export function onshapeCadDirForRevision(projectId: string, revision: number): string {
  assertValidProjectId(projectId);
  if (!Number.isInteger(revision) || revision < 1) throw new Error("Invalid revision");
  return safeJoin(projectRoot(projectId), "revisions", revId(revision), "cad");
}

export async function writeOnshapeMappingArtifacts(args: {
  projectId: string;
  revision: number;
  variables: Record<string, number>;
  provenance: OnshapeVariableProvenance[];
}): Promise<void> {
  assertValidProjectId(args.projectId);
  if (!Number.isInteger(args.revision) || args.revision < 1) throw new Error("Invalid revision");
  const cadDir = onshapeCadDirForRevision(args.projectId, args.revision);

  const variablesPath = path.join(cadDir, "onshape.variables.json");
  const provenancePath = path.join(cadDir, "onshape.provenance.json");

  await atomicWriteFile(variablesPath, stableStringify(args.variables));
  await atomicWriteFile(provenancePath, stableStringify(args.provenance));
}

