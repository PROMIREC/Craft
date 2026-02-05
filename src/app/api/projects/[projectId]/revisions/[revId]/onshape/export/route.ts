import { NextResponse } from "next/server";
import { generateOnshapeExportsForRevision } from "@/cad/onshapeOps";
import { readOnshapeRunRecord } from "@/cad/onshapeOps";
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

    const run = await readOnshapeRunRecord(projectId, revision);
    if (!run || run.status !== "SUCCESS") {
      return NextResponse.json(
        { ok: false, error: "Onshape generation must succeed before exports can run." },
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

    const result = await generateOnshapeExportsForRevision({ projectId, revision, force });
    if (result.export.status === "FAILED") {
      const primary = result.export.errors[0];
      return NextResponse.json(
        {
          ok: false,
          error: primary ? `[${primary.step}] ${primary.message}` : "Onshape export failed.",
          export: result.export
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, reused: result.reused, export: result.export });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}
