import { NextResponse } from "next/server";
import { createProject } from "@/pipeline/createProject";
import { listProjectIds } from "@/storage/fsStorage";
import { readRunMeta } from "@/pipeline/runMeta";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ids = await listProjectIds();
    const projects = await Promise.all(
      ids.map(async (project_id) => {
        const run = await readRunMeta(project_id);
        return {
          project_id,
          project_name: run.project_name,
          created_at: run.created_at,
          updated_at: run.updated_at
        };
      })
    );
    return NextResponse.json({ projects });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    let projectName: string | null | undefined = undefined;
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = (await req.json()) as { project_name?: unknown; name?: unknown } | null;
      if (body && typeof body === "object") {
        const raw = (body as any).project_name ?? (body as any).name;
        if (typeof raw === "string") projectName = raw;
        if (raw === null) projectName = null;
      }
    }

    const { projectId } = await createProject({ projectName });
    return NextResponse.json({ projectId });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
