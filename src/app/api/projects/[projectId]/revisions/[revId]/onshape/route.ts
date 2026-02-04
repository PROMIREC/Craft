import { NextResponse } from "next/server";
import path from "node:path";
import { assertValidProjectId, exists, readJson } from "@/storage/fsStorage";
import { readRunMeta } from "@/pipeline/runMeta";
import { readPspecRevision, readPspecSummaryRevision } from "@/spec/pspecStorage";
import {
  mapPspecToOnshapeVariables,
  onshapeCadDirForRevision,
  writeOnshapeMappingArtifacts,
  type OnshapeVariableProvenance
} from "@/cad/onshapeMapping";
import { readOnshapeRunRecord } from "@/cad/onshapeOps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRevisionId(revId: string): number {
  const m = /^rev-(\d{4})$/.exec(revId);
  if (m) return Number(m[1]);
  const n = Number(revId);
  if (Number.isInteger(n) && n >= 1) return n;
  throw new Error("Invalid revision id.");
}

function formatRevisionId(revision: number): string {
  return `rev-${String(revision).padStart(4, "0")}`;
}

export async function GET(_req: Request, ctx: { params: { projectId: string; revId: string } }) {
  try {
    const projectId = ctx.params.projectId;
    assertValidProjectId(projectId);

    const revision = parseRevisionId(ctx.params.revId);
    const revId = formatRevisionId(revision);

    const pspec = await readPspecRevision(projectId, revision);
    if (!pspec) {
      return NextResponse.json({ ok: false, error: `Missing PSPEC for revision ${revId}.` }, { status: 404 });
    }

    const summary = (await readPspecSummaryRevision(projectId, revision)) ?? "";

    // Ensure mapping artifacts exist for this revision (supports older PSPEC revisions created before this feature).
    const cadDir = onshapeCadDirForRevision(projectId, revision);
    const variablesPath = path.join(cadDir, "onshape.variables.json");
    const provenancePath = path.join(cadDir, "onshape.provenance.json");

    if (!(await exists(variablesPath)) || !(await exists(provenancePath))) {
      const mapping = mapPspecToOnshapeVariables(pspec, pspec.output_profile);
      if (!mapping.ok) {
        return NextResponse.json({ ok: false, error: "Onshape mapping failed.", errors: mapping.errors }, { status: 400 });
      }
      await writeOnshapeMappingArtifacts({
        projectId,
        revision,
        variables: mapping.variables,
        provenance: mapping.provenance
      });
    }

    const variables = await readJson<Record<string, number>>(variablesPath);
    const provenance = await readJson<OnshapeVariableProvenance[]>(provenancePath);

    const meta = await readRunMeta(projectId);
    const entry = meta.pspec.revisions.find((r) => r.revision === revision);
    const approval = entry?.approval?.state ?? "unknown";
    const run = await readOnshapeRunRecord(projectId, revision);
    const canGenerate = approval === "approved" && Object.keys(variables).length > 0;

    return NextResponse.json({
      ok: true,
      project_id: projectId,
      revision,
      rev_id: revId,
      approval,
      can_generate: canGenerate,
      output_profile: pspec.output_profile,
      pspec_summary_md: summary,
      variables,
      provenance,
      run
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}
