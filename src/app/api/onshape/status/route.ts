import { NextResponse } from "next/server";
import { readOnshapeConnectionStatus } from "@/onshape/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await readOnshapeConnectionStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unable to read Onshape connection state." },
      { status: 500 }
    );
  }
}
