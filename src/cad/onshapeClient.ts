import { Buffer } from "node:buffer";
import {
  readOnshapeOauthConfig,
  readOnshapeTokenRecord,
  writeOnshapeTokenRecord,
  type OnshapeOauthConfig
} from "@/onshape/oauth";

const ACCESS_TOKEN_REFRESH_SKEW_MS = 30_000;

export type OnshapeHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type OnshapeRequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | null | undefined>;
  retryOnUnauthorized?: boolean;
};

export class OnshapeApiError extends Error {
  readonly status: number;
  readonly method: OnshapeHttpMethod;
  readonly path: string;

  constructor(args: { status: number; method: OnshapeHttpMethod; path: string; message: string }) {
    super(args.message);
    this.name = "OnshapeApiError";
    this.status = args.status;
    this.method = args.method;
    this.path = args.path;
  }
}

function sanitizeMessage(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 400);
}

async function readJsonOrText(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { error: sanitizeMessage(text) };
    }
  }
  return { error: sanitizeMessage(text) };
}

function errorMessageFromBody(body: unknown): string | null {
  if (typeof body === "string") return sanitizeMessage(body);
  if (!body || typeof body !== "object") return null;
  const rec = body as Record<string, unknown>;
  for (const key of ["message", "error_description", "error", "detail", "details"] as const) {
    const v = rec[key];
    if (typeof v === "string" && v.trim()) return sanitizeMessage(v);
  }
  return null;
}

function buildApiUrl(config: OnshapeOauthConfig, path: string, query?: OnshapeRequestOptions["query"]): string {
  if (!path.startsWith("/")) throw new Error(`Onshape request path must start with "/": ${path}`);
  const url = new URL(path, `${config.apiBase}/`);
  if (query) {
    for (const [key, raw] of Object.entries(query)) {
      if (raw === undefined || raw === null) continue;
      url.searchParams.set(key, String(raw));
    }
  }
  return url.toString();
}

function parseTokenResponse(value: unknown, fallbackRefreshToken: string): {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} {
  if (!value || typeof value !== "object") throw new Error("Onshape returned an invalid token payload.");
  const rec = value as Record<string, unknown>;
  const accessToken = typeof rec.access_token === "string" ? rec.access_token : "";
  const expiresIn = Number(rec.expires_in);
  const refreshToken =
    typeof rec.refresh_token === "string" && rec.refresh_token ? rec.refresh_token : fallbackRefreshToken;
  if (!accessToken) throw new Error("Onshape token payload is missing access_token.");
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) throw new Error("Onshape token payload has invalid expires_in.");
  return { accessToken, refreshToken, expiresIn };
}

export class OnshapeClient {
  private readonly config: OnshapeOauthConfig;

  constructor(config?: OnshapeOauthConfig) {
    this.config = config ?? readOnshapeOauthConfig();
  }

  async ensureAccessToken(forceRefresh = false): Promise<string> {
    const token = await readOnshapeTokenRecord();
    if (!token) throw new Error("Not connected to Onshape. Connect OAuth first.");

    const expiresAtMs = Date.parse(token.expires_at);
    const mustRefresh =
      forceRefresh || !Number.isFinite(expiresAtMs) || Date.now() + ACCESS_TOKEN_REFRESH_SKEW_MS >= expiresAtMs;

    if (!mustRefresh) return token.access_token;
    return this.refreshAccessToken(token.refresh_token);
  }

  async request(method: OnshapeHttpMethod, path: string, opts: OnshapeRequestOptions = {}): Promise<Response> {
    const url = buildApiUrl(this.config, path, opts.query);

    const doFetch = async (accessToken: string): Promise<Response> => {
      const headers: Record<string, string> = {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...opts.headers
      };

      let body: BodyInit | undefined;
      if (opts.body !== undefined) {
        if (typeof opts.body === "string" || opts.body instanceof URLSearchParams || opts.body instanceof FormData) {
          body = opts.body as BodyInit;
        } else {
          headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
          body = JSON.stringify(opts.body);
        }
      }

      return fetch(url, {
        method,
        headers,
        body,
        cache: "no-store"
      });
    };

    let accessToken = await this.ensureAccessToken(false);
    let res = await doFetch(accessToken);

    if (res.status === 401 && opts.retryOnUnauthorized !== false) {
      accessToken = await this.ensureAccessToken(true);
      res = await doFetch(accessToken);
    }

    if (!res.ok) {
      const body = await readJsonOrText(res);
      const bodyMessage = errorMessageFromBody(body);
      throw new OnshapeApiError({
        status: res.status,
        method,
        path,
        message: bodyMessage ?? `Onshape request failed (${res.status}) for ${method} ${path}.`
      });
    }

    return res;
  }

  async requestJson<T>(method: OnshapeHttpMethod, path: string, opts: OnshapeRequestOptions = {}): Promise<T> {
    const res = await this.request(method, path, opts);
    const text = await res.text();
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Onshape returned non-JSON for ${method} ${path}.`);
    }
  }

  private async refreshAccessToken(refreshToken: string): Promise<string> {
    if (!refreshToken) throw new Error("Missing refresh token. Reconnect Onshape OAuth.");

    const tokenUrl = new URL("/oauth/token", `${this.config.oauthBase}/`);
    const basicAuth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`, "utf8").toString("base64");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    });

    const res = await fetch(tokenUrl.toString(), {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: body.toString(),
      cache: "no-store"
    });

    const payload = await readJsonOrText(res);
    if (!res.ok) {
      const message = errorMessageFromBody(payload) ?? `HTTP ${res.status}`;
      throw new Error(`Failed to refresh Onshape token: ${message}`);
    }

    const parsed = parseTokenResponse(payload, refreshToken);
    await writeOnshapeTokenRecord({
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresInSeconds: parsed.expiresIn
    });

    return parsed.accessToken;
  }
}
