import { NextResponse } from "next/server";
import { generateOnshapeRunForRevision } from "@/cad/onshapeOps";
import { readRunMeta } from "@/pipeline/runMeta";
import { assertValidProjectId } from "@/storage/fsStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseRevisionId(revId: string): number {
  const m = /^rev-(\d{4})$/.exec(revId);
  if (m) return Number(m[1]);
  const n = Number(revId);
  if (Number.isInteger(n) && n >= 1) return n;
  throw new Error("Invalid revision id.");
}

export async function POST(req: Request, ctx: { params: { projectId: string; revId: string } }) {
  try {
    const projectId = ctx.params.projectId;
    assertValidProjectId(projectId);
    const revision = parseRevisionId(ctx.params.revId);

    const meta = await readRunMeta(projectId);
    const entry = meta.pspec.revisions.find((r) => r.revision === revision);
    if (!entry) {
      return NextResponse.json({ ok: false, error: "PSPEC revision not found." }, { status: 404 });
    }
    if (entry.approval.state !== "approved") {
      return NextResponse.json(
        { ok: false, error: "Approve this PSPEC revision before generating an Onshape model." },
        { status: 400 }
      );
    }

    let force = false;
    try {
      const body = (await req.json()) as { force?: unknown };
      force = body?.force === true;
    } catch {
      force = false;
    }

    const result = await generateOnshapeRunForRevision({ projectId, revision, force });
    if (result.run.status === "FAILED") {
      const primary = result.run.errors[0];
      return NextResponse.json(
        {
          ok: false,
          error: primary ? `[${primary.step}] ${primary.message}` : "Onshape generation failed.",
          run: result.run
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, reused: result.reused, run: result.run });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}
