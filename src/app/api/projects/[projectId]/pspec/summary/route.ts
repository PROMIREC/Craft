import { NextResponse } from "next/server";
import { assertValidProjectId } from "@/storage/fsStorage";
import { readLatestPspecSummary } from "@/spec/pspecStorage";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: { projectId: string } }) {
  try {
    const projectId = ctx.params.projectId;
    assertValidProjectId(projectId);
    const summary = (await readLatestPspecSummary(projectId)) ?? "";
    return NextResponse.json({ summary });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}

