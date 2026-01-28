import type { DibV0_1 } from "@/dib/dibStorage";
import type { PspecV0_1 } from "@/spec/pspecTypes";

function clearanceAll(mm: number) {
  return {
    left_mm: mm,
    right_mm: mm,
    top_mm: mm,
    bottom_mm: mm,
    front_mm: mm,
    rear_mm: mm
  };
}

export function generatePspecV0_1(args: {
  projectId: string;
  revision: number;
  createdAtIso: string;
  crg: { original_filename: string; format: "glb" | "gltf" | "fbx" | "obj"; bytes: number; sha256: string; uploaded_at: string };
  dib: DibV0_1;
  dibSha256: string;
}): PspecV0_1 {
  const speakerClearance = clearanceAll(args.dib.speakers.required_clearance_mm);
  const ampClearance = clearanceAll(args.dib.amplifier.required_clearance_mm);

  const pspec: PspecV0_1 = {
    pspec_version: "0.1.0",
    project_id: args.projectId,
    revision: args.revision,
    created_at: args.createdAtIso,
    units: "mm",
    archetype: {
      id: "record_console",
      version: "0.1",
      speaker_enclosure_type: "sealed"
    },
    inputs: {
      crg: {
        original_filename: args.crg.original_filename,
        format: args.crg.format,
        bytes: args.crg.bytes,
        sha256: args.crg.sha256,
        uploaded_at: args.crg.uploaded_at
      },
      dib: {
        revision: args.dib.revision,
        sha256: args.dibSha256,
        confirmed_at: args.dib.confirmed_at
      }
    },
    overall: { ...args.dib.overall },
    material: { ...args.dib.material },
    constraints: { ...args.dib.constraints },
    access: { ...args.dib.access },
    output_profile: args.dib.output_profile as any,
    components: {
      speakers: {
        count: 2,
        enclosure_type: "sealed",
        external_mm: { ...args.dib.speakers.external_mm },
        weight_kg: args.dib.speakers.weight_kg,
        clearance_mm: speakerClearance,
        isolation: { ...args.dib.speakers.isolation }
      },
      turntable: {
        external_mm: { ...args.dib.turntable.external_mm },
        isolation: args.dib.turntable.isolation,
        clearance_mm: clearanceAll(0)
      },
      amplifier: {
        external_mm: { ...args.dib.amplifier.external_mm },
        ventilation_direction: args.dib.amplifier.ventilation_direction as any,
        clearance_mm: ampClearance
      },
      drawers: { ...args.dib.drawers }
    }
  };

  return pspec;
}

export function pspecSummaryMarkdown(pspec: PspecV0_1): string {
  const availableDepth = pspec.overall.depth_mm - pspec.constraints.back_clearance_mm;

  return [
    `# PSPEC Summary`,
    ``,
    `- Project: \`${pspec.project_id}\``,
    `- PSPEC revision: **${pspec.revision}**`,
    `- Units: **mm**`,
    `- Archetype: **${pspec.archetype.id}** (sealed speakers)`,
    ``,
    `## Inputs`,
    `- CRG (non-authoritative): \`${pspec.inputs.crg.original_filename}\` (${pspec.inputs.crg.bytes.toLocaleString()} bytes)`,
    `- DIB (authoritative): revision ${pspec.inputs.dib.revision}`,
    ``,
    `## Overall`,
    `- Width: ${pspec.overall.width_mm} mm`,
    `- Height: ${pspec.overall.height_mm} mm`,
    `- Depth: ${pspec.overall.depth_mm} mm`,
    `- Back clearance reserved: ${pspec.constraints.back_clearance_mm} mm`,
    `- Available depth (depth - back clearance): ${availableDepth} mm`,
    ``,
    `## Material`,
    `- Type: ${pspec.material.type}`,
    `- Thickness: ${pspec.material.thickness_mm} mm`,
    pspec.material.notes ? `- Notes: ${pspec.material.notes}` : null,
    ``,
    `## Components`,
    `### Speakers (x2, sealed)`,
    `- External (W×H×D): ${pspec.components.speakers.external_mm.width_mm} × ${pspec.components.speakers.external_mm.height_mm} × ${pspec.components.speakers.external_mm.depth_mm} mm`,
    `- Weight (each): ${pspec.components.speakers.weight_kg} kg`,
    `- Clearance (all sides): ${pspec.components.speakers.clearance_mm.left_mm} mm`,
    `- Isolation: ${pspec.components.speakers.isolation.strategy}`,
    ``,
    `### Turntable`,
    `- External (W×H×D): ${pspec.components.turntable.external_mm.width_mm} × ${pspec.components.turntable.external_mm.height_mm} × ${pspec.components.turntable.external_mm.depth_mm} mm`,
    `- Isolation: ${pspec.components.turntable.isolation ? "Yes" : "No"}`,
    ``,
    `### Amplifier`,
    `- External (W×H×D): ${pspec.components.amplifier.external_mm.width_mm} × ${pspec.components.amplifier.external_mm.height_mm} × ${pspec.components.amplifier.external_mm.depth_mm} mm`,
    `- Ventilation direction: ${pspec.components.amplifier.ventilation_direction}`,
    `- Clearance (all sides): ${pspec.components.amplifier.clearance_mm.left_mm} mm`,
    ``,
    `### Drawers`,
    `- Count: ${pspec.components.drawers.count}`,
    `- LP capacity target: ${pspec.components.drawers.lp_capacity_target}`,
    ``,
    `## Access`,
    `- Rear service hatch: ${pspec.access.rear_service_hatch ? "Yes" : "No"}`,
    ``,
    `## Output profile`,
    `- ${pspec.output_profile}`,
    ``,
    `---`,
    `**Reminder:** PSPEC encodes intent and constraints; no manufacturable dimensions are inferred from CRG geometry.`
  ]
    .filter((l): l is string => Boolean(l))
    .join("\n");
}

