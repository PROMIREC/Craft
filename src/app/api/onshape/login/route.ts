import { NextResponse } from "next/server";
import {
  buildOnshapeAuthorizeUrl,
  createOauthState,
  readOnshapeOauthConfig,
  savePendingOauthState
} from "@/onshape/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToSettingsError(req: Request, message: string): NextResponse {
  const url = new URL("/settings", req.url);
  url.searchParams.set("onshape", "error");
  url.searchParams.set("message", message);
  return NextResponse.redirect(url, 302);
}

export async function GET(req: Request) {
  try {
    const config = readOnshapeOauthConfig();
    const state = createOauthState();
    await savePendingOauthState(state);

    const authorizeUrl = buildOnshapeAuthorizeUrl(config, state);
    return NextResponse.redirect(authorizeUrl, 302);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unable to start Onshape OAuth flow.";
    return redirectToSettingsError(req, message);
  }
}
