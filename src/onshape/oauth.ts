import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ARTIFACTS_ROOT, atomicWriteFile, exists, readJson } from "@/storage/fsStorage";

export const ONSHAPE_SCOPE = "OAuth2Read OAuth2Write" as const;

const AUTH_DIR = path.join(ARTIFACTS_ROOT, "_auth");
const STATE_PATH = path.join(AUTH_DIR, "onshape.state.json");
const TOKEN_PATH = path.join(AUTH_DIR, "onshape.json");
const STATE_TTL_MS = 10 * 60 * 1000;

type PendingStateRecord = {
  state: string;
  created_at: string;
};

export type OnshapeOauthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  oauthBase: string;
  apiBase: string;
};

export type OnshapeTokenRecord = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export type OnshapeConnectionStatus = {
  connected: boolean;
  expires_at: string | null;
  expired: boolean;
};

export type ConsumeStateResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "mismatch" };

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

function normalizeBaseUrl(name: string, value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid URL in ${name}.`);
  }
  return url.toString().replace(/\/$/, "");
}

function parsePendingState(value: unknown): PendingStateRecord {
  if (!value || typeof value !== "object") throw new Error("Invalid pending OAuth state.");
  const record = value as Record<string, unknown>;
  if (typeof record.state !== "string" || record.state.length < 20) {
    throw new Error("Invalid pending OAuth state.");
  }
  if (typeof record.created_at !== "string" || !Number.isFinite(Date.parse(record.created_at))) {
    throw new Error("Invalid pending OAuth state.");
  }
  return { state: record.state, created_at: record.created_at };
}

function parseTokenRecord(value: unknown): OnshapeTokenRecord {
  if (!value || typeof value !== "object") throw new Error("Invalid Onshape token file format.");
  const record = value as Record<string, unknown>;
  if (typeof record.access_token !== "string" || !record.access_token) {
    throw new Error("Invalid Onshape token file format.");
  }
  if (typeof record.refresh_token !== "string" || !record.refresh_token) {
    throw new Error("Invalid Onshape token file format.");
  }
  if (typeof record.expires_at !== "string" || !Number.isFinite(Date.parse(record.expires_at))) {
    throw new Error("Invalid Onshape token file format.");
  }
  return {
    access_token: record.access_token,
    refresh_token: record.refresh_token,
    expires_at: record.expires_at
  };
}

export function readOnshapeOauthConfig(): OnshapeOauthConfig {
  return {
    clientId: requireEnv("ONSHAPE_CLIENT_ID"),
    clientSecret: requireEnv("ONSHAPE_CLIENT_SECRET"),
    redirectUri: requireEnv("ONSHAPE_REDIRECT_URI"),
    oauthBase: normalizeBaseUrl("ONSHAPE_OAUTH_BASE", requireEnv("ONSHAPE_OAUTH_BASE")),
    apiBase: normalizeBaseUrl("ONSHAPE_API_BASE", requireEnv("ONSHAPE_API_BASE"))
  };
}

export function createOauthState(): string {
  return randomBytes(32).toString("hex");
}

export function buildOnshapeAuthorizeUrl(config: OnshapeOauthConfig, state: string): string {
  const url = new URL("/oauth/authorize", `${config.oauthBase}/`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", ONSHAPE_SCOPE);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function savePendingOauthState(state: string): Promise<void> {
  if (!state || state.length < 20) throw new Error("Invalid OAuth state.");
  const payload: PendingStateRecord = { state, created_at: new Date().toISOString() };
  await atomicWriteFile(STATE_PATH, JSON.stringify(payload, null, 2) + "\n");
}

export async function consumePendingOauthState(state: string): Promise<ConsumeStateResult> {
  if (!(await exists(STATE_PATH))) return { ok: false, reason: "missing" };

  let pending: PendingStateRecord;
  try {
    pending = parsePendingState(await readJson<unknown>(STATE_PATH));
  } catch {
    await fs.rm(STATE_PATH, { force: true });
    return { ok: false, reason: "invalid" };
  }

  const createdAtMs = Date.parse(pending.created_at);
  if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > STATE_TTL_MS) {
    await fs.rm(STATE_PATH, { force: true });
    return { ok: false, reason: "expired" };
  }

  if (pending.state !== state) {
    return { ok: false, reason: "mismatch" };
  }

  await fs.rm(STATE_PATH, { force: true });
  return { ok: true };
}

export async function writeOnshapeTokenRecord(args: {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}): Promise<OnshapeTokenRecord> {
  if (!args.accessToken) throw new Error("Missing access token.");
  if (!args.refreshToken) throw new Error("Missing refresh token.");
  if (!Number.isFinite(args.expiresInSeconds) || args.expiresInSeconds <= 0) {
    throw new Error("Invalid expires_in value.");
  }

  const expiresAtMs = Date.now() + Math.round(args.expiresInSeconds * 1000);
  const payload: OnshapeTokenRecord = {
    access_token: args.accessToken,
    refresh_token: args.refreshToken,
    expires_at: new Date(expiresAtMs).toISOString()
  };

  await atomicWriteFile(TOKEN_PATH, JSON.stringify(payload, null, 2) + "\n");
  return payload;
}

export async function readOnshapeTokenRecord(): Promise<OnshapeTokenRecord | null> {
  if (!(await exists(TOKEN_PATH))) return null;
  return parseTokenRecord(await readJson<unknown>(TOKEN_PATH));
}

export async function readOnshapeConnectionStatus(): Promise<OnshapeConnectionStatus> {
  const token = await readOnshapeTokenRecord();
  if (!token) return { connected: false, expires_at: null, expired: false };

  const expiresAtMs = Date.parse(token.expires_at);
  const expired = !Number.isFinite(expiresAtMs) || Date.now() >= expiresAtMs;
  return { connected: true, expires_at: token.expires_at, expired };
}
