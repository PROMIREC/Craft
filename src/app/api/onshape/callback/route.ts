import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import {
  consumePendingOauthState,
  readOnshapeOauthConfig,
  writeOnshapeTokenRecord
} from "@/onshape/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TokenExchangeResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

function redirectToSettings(req: Request, params: { onshape: "connected" | "error"; message?: string }) {
  const url = new URL("/settings", req.url);
  url.searchParams.set("onshape", params.onshape);
  if (params.message) url.searchParams.set("message", params.message.slice(0, 300));
  return NextResponse.redirect(url, 302);
}

function parseTokenExchangeResponse(value: unknown): TokenExchangeResponse {
  if (!value || typeof value !== "object") {
    throw new Error("Onshape returned an invalid token response.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.access_token !== "string" || !record.access_token) {
    throw new Error("Onshape token response is missing access_token.");
  }
  if (typeof record.refresh_token !== "string" || !record.refresh_token) {
    throw new Error("Onshape token response is missing refresh_token.");
  }
  const expiresIn = Number(record.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error("Onshape token response has an invalid expires_in value.");
  }
  return {
    access_token: record.access_token,
    refresh_token: record.refresh_token,
    expires_in: expiresIn
  };
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: `HTTP ${res.status}`, error_description: text.slice(0, 300) };
  }
}

function oauthErrorFromResponse(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const err = body as Record<string, unknown>;
    const code = typeof err.error === "string" ? err.error : null;
    const desc = typeof err.error_description === "string" ? err.error_description : null;
    if (code && desc) return `Token exchange failed (${status}): ${code} - ${desc}`;
    if (code) return `Token exchange failed (${status}): ${code}`;
  }
  return `Token exchange failed with HTTP ${status}.`;
}

function stateErrorMessage(reason: "missing" | "invalid" | "expired" | "mismatch"): string {
  switch (reason) {
    case "missing":
      return "OAuth state missing. Start sign-in again.";
    case "invalid":
      return "Stored OAuth state is invalid. Start sign-in again.";
    case "expired":
      return "OAuth state expired. Start sign-in again.";
    case "mismatch":
      return "OAuth state mismatch. Possible CSRF attempt. Start sign-in again.";
  }
}

export async function GET(req: Request) {
  const query = new URL(req.url).searchParams;

  const oauthError = query.get("error");
  if (oauthError) {
    const desc = query.get("error_description");
    return redirectToSettings(req, {
      onshape: "error",
      message: desc ? `Onshape authorization failed: ${desc}` : `Onshape authorization failed: ${oauthError}`
    });
  }

  const code = query.get("code");
  const state = query.get("state");
  if (!state) {
    return redirectToSettings(req, { onshape: "error", message: "Missing OAuth state in callback." });
  }
  if (!code) {
    return redirectToSettings(req, { onshape: "error", message: "Missing authorization code in callback." });
  }

  try {
    const stateResult = await consumePendingOauthState(state);
    if (!stateResult.ok) {
      return redirectToSettings(req, { onshape: "error", message: stateErrorMessage(stateResult.reason) });
    }

    const config = readOnshapeOauthConfig();
    const tokenUrl = new URL("/oauth/token", `${config.oauthBase}/`);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri
    });
    const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64");

    const tokenRes = await fetch(tokenUrl.toString(), {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: body.toString(),
      cache: "no-store"
    });

    const tokenJson = await readJsonSafe(tokenRes);
    if (!tokenRes.ok) {
      return redirectToSettings(req, {
        onshape: "error",
        message: oauthErrorFromResponse(tokenRes.status, tokenJson)
      });
    }

    const token = parseTokenExchangeResponse(tokenJson);
    await writeOnshapeTokenRecord({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresInSeconds: token.expires_in
    });

    return redirectToSettings(req, { onshape: "connected" });
  } catch (e) {
    return redirectToSettings(req, {
      onshape: "error",
      message: e instanceof Error ? e.message : "Onshape callback failed."
    });
  }
}
