import { NextResponse } from "next/server";
import { readRunMeta } from "@/pipeline/runMeta";
import { assertValidProjectId } from "@/storage/fsStorage";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: { projectId: string } }) {
  try {
    assertValidProjectId(ctx.params.projectId);
    const run = await readRunMeta(ctx.params.projectId);
    return NextResponse.json({ run });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}

