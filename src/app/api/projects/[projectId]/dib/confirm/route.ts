import { NextResponse } from "next/server";
import { assertValidProjectId } from "@/storage/fsStorage";
import { readDibDraft, writeDibRevision, type DibV0_1 } from "@/dib/dibStorage";
import { validateDibDraft } from "@/dib/validateDib";
import { readRunMeta, writeRunMeta } from "@/pipeline/runMeta";
import { stableStringify } from "@/pipeline/stableJson";
import { sha256Hex } from "@/pipeline/crypto";

export const runtime = "nodejs";

function toDibV0_1(projectId: string, revision: number, nowIso: string, draft: Record<string, unknown>): DibV0_1 {
  const created_at = nowIso;
  const confirmed_at = nowIso;

  return {
    dib_version: "0.1.0",
    project_id: projectId,
    revision,
    created_at,
    confirmed_at,
    assumptions: {
      archetype_confirmed: Boolean((draft as any)?.assumptions?.archetype_confirmed),
      sealed_speakers_confirmed: Boolean((draft as any)?.assumptions?.sealed_speakers_confirmed)
    },
    overall: {
      width_mm: Number((draft as any)?.overall?.width_mm),
      height_mm: Number((draft as any)?.overall?.height_mm),
      depth_mm: Number((draft as any)?.overall?.depth_mm)
    },
    constraints: {
      back_clearance_mm: Number((draft as any)?.constraints?.back_clearance_mm)
    },
    access: {
      rear_service_hatch: Boolean((draft as any)?.access?.rear_service_hatch)
    },
    material: {
      type: String((draft as any)?.material?.type),
      thickness_mm: Number((draft as any)?.material?.thickness_mm),
      ...(typeof (draft as any)?.material?.notes === "string" ? { notes: String((draft as any)?.material?.notes) } : {})
    },
    speakers: {
      external_mm: {
        width_mm: Number((draft as any)?.speakers?.external_mm?.width_mm),
        height_mm: Number((draft as any)?.speakers?.external_mm?.height_mm),
        depth_mm: Number((draft as any)?.speakers?.external_mm?.depth_mm)
      },
      weight_kg: Number((draft as any)?.speakers?.weight_kg),
      required_clearance_mm: Number((draft as any)?.speakers?.required_clearance_mm),
      isolation: {
        strategy: String((draft as any)?.speakers?.isolation?.strategy),
        ...(typeof (draft as any)?.speakers?.isolation?.notes === "string"
          ? { notes: String((draft as any)?.speakers?.isolation?.notes) }
          : {})
      }
    },
    turntable: {
      external_mm: {
        width_mm: Number((draft as any)?.turntable?.external_mm?.width_mm),
        height_mm: Number((draft as any)?.turntable?.external_mm?.height_mm),
        depth_mm: Number((draft as any)?.turntable?.external_mm?.depth_mm)
      },
      isolation: Boolean((draft as any)?.turntable?.isolation)
    },
    amplifier: {
      external_mm: {
        width_mm: Number((draft as any)?.amplifier?.external_mm?.width_mm),
        height_mm: Number((draft as any)?.amplifier?.external_mm?.height_mm),
        depth_mm: Number((draft as any)?.amplifier?.external_mm?.depth_mm)
      },
      ventilation_direction: String((draft as any)?.amplifier?.ventilation_direction),
      required_clearance_mm: Number((draft as any)?.amplifier?.required_clearance_mm)
    },
    drawers: {
      count: Number((draft as any)?.drawers?.count),
      lp_capacity_target: Number((draft as any)?.drawers?.lp_capacity_target ?? 0)
    },
    output_profile: String((draft as any)?.output_profile),
    confirmed: true
  };
}

export async function POST(_req: Request, ctx: { params: { projectId: string } }) {
  try {
    const projectId = ctx.params.projectId;
    assertValidProjectId(projectId);
    const draft = (await readDibDraft(projectId)) ?? {};
    const errors = validateDibDraft(draft);
    if (errors.length) {
      return NextResponse.json({ ok: false, error: "DIB is incomplete or invalid.", errors }, { status: 400 });
    }

    const now = new Date().toISOString();
    const meta = await readRunMeta(projectId);
    const revision = meta.dib.latest_revision + 1;
    const dib = toDibV0_1(projectId, revision, now, draft);
    const dibSha = sha256Hex(new TextEncoder().encode(stableStringify(dib)));

    await writeDibRevision(projectId, revision, dib);

    meta.updated_at = now;
    meta.dib.latest_revision = revision;
    meta.dib.revisions.push({ revision, sha256: dibSha, confirmed_at: now });

    // DIB changes invalidate "latest PSPEC approval status" relative to the next PSPEC.
    meta.pspec.approval = { state: "none", revision: null, decided_at: null };

    await writeRunMeta(projectId, meta);

    return NextResponse.json({ ok: true, revision });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}

