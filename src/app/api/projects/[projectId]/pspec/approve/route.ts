import { NextResponse } from "next/server";
import { assertValidProjectId } from "@/storage/fsStorage";
import { readRunMeta, writeRunMeta } from "@/pipeline/runMeta";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: { projectId: string } }) {
  try {
    const projectId = ctx.params.projectId;
    assertValidProjectId(projectId);
    const meta = await readRunMeta(projectId);
    if (meta.pspec.latest_revision < 1) {
      return NextResponse.json({ ok: false, error: "No PSPEC to approve." }, { status: 400 });
    }
    const now = new Date().toISOString();
    meta.updated_at = now;
    const rev = meta.pspec.latest_revision;
    meta.pspec.approval = { state: "approved", revision: rev, decided_at: now };
    const entry = meta.pspec.revisions.find((r) => r.revision === rev);
    if (entry) entry.approval = { state: "approved", decided_at: now };
    await writeRunMeta(projectId, meta);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}
