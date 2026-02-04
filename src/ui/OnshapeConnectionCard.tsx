"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type OnshapeStatusOk = {
  ok: true;
  connected: boolean;
  expires_at: string | null;
  expired: boolean;
};

type OnshapeStatusErr = {
  ok?: false;
  error: string;
};

type OnshapeStatusResponse = OnshapeStatusOk | OnshapeStatusErr;

export function OnshapeConnectionCard() {
  const params = useSearchParams();
  const [status, setStatus] = useState<OnshapeStatusOk | null>(null);
  const [error, setError] = useState<string | null>(null);

  const flowState = params.get("onshape");
  const flowMessage = params.get("message");

  const expiresAtLocal = useMemo(() => {
    if (!status?.expires_at) return null;
    const dt = new Date(status.expires_at);
    if (Number.isNaN(dt.getTime())) return status.expires_at;
    return dt.toLocaleString();
  }, [status?.expires_at]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const res = await fetch("/api/onshape/status", { method: "GET" });
        const json = (await res.json()) as OnshapeStatusResponse;
        if (!res.ok || !json.ok) {
          const message = "error" in json && typeof json.error === "string" ? json.error : "Failed to read Onshape status.";
          throw new Error(message);
        }
        if (!cancelled) setStatus(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to read Onshape status.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [flowState, flowMessage]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="h1" style={{ marginBottom: 4 }}>
            Settings
          </h1>
          <p className="p" style={{ marginBottom: 0 }}>
            Local-first OAuth wiring for Onshape. No CAD actions are triggered in this phase.
          </p>
        </div>
        <a className="btn" href="/">
          Back to Projects
        </a>
      </div>

      <div className="hr" />

      {flowState === "connected" ? (
        <div className="alert alertOk" style={{ marginBottom: 12 }}>
          <strong>Connected to Onshape.</strong> OAuth token exchange completed successfully.
        </div>
      ) : null}

      {flowState === "error" ? (
        <div className="alert alertErr" style={{ marginBottom: 12 }}>
          <strong>Onshape OAuth failed.</strong> {flowMessage ?? "Try connecting again."}
        </div>
      ) : null}

      {error ? (
        <div className="alert alertErr" style={{ marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      <div className="panel" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Onshape connection</div>

        {!status ? (
          <div className="alert">Checking connection status...</div>
        ) : status.connected ? (
          <div className={`alert ${status.expired ? "alertWarn" : "alertOk"}`} style={{ marginBottom: 12 }}>
            <strong>{status.expired ? "Connected (token expired)." : "Connected to Onshape."}</strong>{" "}
            {expiresAtLocal ? `Token expiry: ${expiresAtLocal}.` : ""}
          </div>
        ) : (
          <div className="alert alertWarn" style={{ marginBottom: 12 }}>
            <strong>Not connected.</strong> Start OAuth to connect your local Craft instance.
          </div>
        )}

        <div className="row">
          <a className="btn btnPrimary" href="/api/onshape/login">
            {status?.connected ? "Reconnect to Onshape" : "Connect to Onshape"}
          </a>
        </div>
      </div>
    </div>
  );
}
