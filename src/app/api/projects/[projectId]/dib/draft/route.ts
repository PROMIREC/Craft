import { NextResponse } from "next/server";
import { assertValidProjectId } from "@/storage/fsStorage";
import { readDibDraft, writeDibDraft } from "@/dib/dibStorage";

export const runtime = "nodejs";

function initialDraft(projectId: string): Record<string, unknown> {
  return {
    dib_version: "0.1.0",
    project_id: projectId
  };
}

export async function GET(_req: Request, ctx: { params: { projectId: string } }) {
  try {
    const projectId = ctx.params.projectId;
    assertValidProjectId(projectId);
    const draft = (await readDibDraft(projectId)) ?? initialDraft(projectId);
    return NextResponse.json({ draft });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  try {
    const projectId = ctx.params.projectId;
    assertValidProjectId(projectId);
    const json = (await req.json()) as { draft?: unknown };
    if (!json || typeof json !== "object" || !json.draft || typeof json.draft !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid draft payload." }, { status: 400 });
    }
    await writeDibDraft(projectId, json.draft as Record<string, unknown>);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}
