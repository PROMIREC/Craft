import { NextResponse } from "next/server";
import { assertValidProjectId, deleteProjectArtifacts, exists, projectRoot } from "@/storage/fsStorage";
import { normalizeProjectName, readRunMeta, writeRunMeta } from "@/pipeline/runMeta";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: { projectId: string } }) {
  try {
    const projectId = ctx.params.projectId;
    assertValidProjectId(projectId);

    const body = (await req.json()) as { project_name?: unknown; name?: unknown } | null;
    const raw = body && typeof body === "object" ? ((body as any).project_name ?? (body as any).name) : undefined;
    if (raw !== null && typeof raw !== "string") {
      return NextResponse.json({ ok: false, error: "Expected { project_name: string|null }." }, { status: 400 });
    }
    const projectName = normalizeProjectName(raw === null ? null : raw);

    const meta = await readRunMeta(projectId);
    meta.project_name = projectName;
    meta.updated_at = new Date().toISOString();
    await writeRunMeta(projectId, meta);

    return NextResponse.json({ ok: true, project_name: meta.project_name });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: { projectId: string } }) {
  try {
    const projectId = ctx.params.projectId;
    assertValidProjectId(projectId);
    const root = projectRoot(projectId);
    if (!(await exists(root))) {
      return NextResponse.json({ ok: false, error: "Project not found." }, { status: 404 });
    }
    await deleteProjectArtifacts(projectId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}

