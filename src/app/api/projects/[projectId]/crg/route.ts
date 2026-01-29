import { NextResponse } from "next/server";
import { deleteCrg, ingestCrg } from "@/intake/crgIntake";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: { projectId: string } }) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Missing file." }, { status: 400 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await ingestCrg({ projectId: ctx.params.projectId, originalFileName: file.name, bytes });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, ctx: { params: { projectId: string } }) {
  try {
    await deleteCrg({ projectId: ctx.params.projectId });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}
