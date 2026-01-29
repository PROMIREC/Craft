import { NextResponse } from "next/server";
import { assertValidProjectId } from "@/storage/fsStorage";
import { readLatestDib } from "@/dib/dibStorage";
import { readRunMeta, writeRunMeta } from "@/pipeline/runMeta";
import { sha256Hex } from "@/pipeline/crypto";
import { stableStringify } from "@/pipeline/stableJson";
import { generatePspecV0_1, pspecSummaryMarkdown } from "@/spec/generatePspec";
import { validatePspecAgainstSchema, validatePspecManufacturability } from "@/spec/pspecValidation";
import { writePspecRevision } from "@/spec/pspecStorage";
import { mapPspecToOnshapeVariables, writeOnshapeMappingArtifacts } from "@/cad/onshapeMapping";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: { projectId: string } }) {
  try {
    const projectId = ctx.params.projectId;
    assertValidProjectId(projectId);

    const meta = await readRunMeta(projectId);
    if (!meta.crg) return NextResponse.json({ ok: false, error: "Upload a CRG file first." }, { status: 400 });
    if (meta.dib.latest_revision < 1) {
      return NextResponse.json({ ok: false, error: "Confirm the DIB first." }, { status: 400 });
    }

    const dib = await readLatestDib(projectId);
    if (!dib) return NextResponse.json({ ok: false, error: "Missing dib.json." }, { status: 400 });
    const dibSha = sha256Hex(new TextEncoder().encode(stableStringify(dib)));

    const now = new Date().toISOString();
    const revision = meta.pspec.latest_revision + 1;
    const pspec = generatePspecV0_1({
      projectId,
      revision,
      createdAtIso: now,
      crg: meta.crg,
      dib,
      dibSha256: dibSha
    });

    const schemaErrors = await validatePspecAgainstSchema(pspec);
    if (schemaErrors.length) {
      return NextResponse.json(
        { ok: false, error: "PSPEC failed schema validation.", schemaErrors },
        { status: 400 }
      );
    }

    const manuf = validatePspecManufacturability(pspec);
    if (!manuf.ok) {
      return NextResponse.json(
        { ok: false, error: "PSPEC failed manufacturability validation.", errors: manuf.errors },
        { status: 400 }
      );
    }

    const mapping = mapPspecToOnshapeVariables(pspec, pspec.output_profile);
    if (!mapping.ok) {
      return NextResponse.json(
        { ok: false, error: "Onshape variables mapping failed.", errors: mapping.errors },
        { status: 400 }
      );
    }

    const summaryMd = pspecSummaryMarkdown(pspec);
    const pspecSha = sha256Hex(new TextEncoder().encode(stableStringify(pspec)));
    const summarySha = sha256Hex(new TextEncoder().encode(summaryMd));

    await writePspecRevision(projectId, revision, pspec, summaryMd);
    await writeOnshapeMappingArtifacts({ projectId, revision, variables: mapping.variables, provenance: mapping.provenance });

    meta.updated_at = now;
    meta.pspec.latest_revision = revision;
    meta.pspec.revisions.push({
      revision,
      sha256: pspecSha,
      summary_md_sha256: summarySha,
      created_at: now,
      dib_revision: dib.revision,
      dib_sha256: dibSha,
      crg_sha256: meta.crg.sha256,
      approval: { state: "pending", decided_at: null }
    });
    meta.pspec.approval = { state: "pending", revision, decided_at: null };
    await writeRunMeta(projectId, meta);

    return NextResponse.json({ ok: true, revision });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}
