"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

type RunMeta = {
  pspec: { latest_revision: number; approval: { state: string; revision: number | null } };
  dib: { latest_revision: number };
};

export function PspecReview({ projectId }: { projectId: string }) {
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/projects/${projectId}/meta/run`);
    const json = (await res.json()) as { run?: RunMeta };
    if (res.ok && json.run) setMeta(json.run);
    const s = await fetch(`/api/projects/${projectId}/pspec/summary`, { method: "GET" });
    const sj = (await s.json()) as { summary?: string };
    if (s.ok) setSummary(sj.summary ?? "");
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function generate() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/pspec/generate`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to generate PSPEC");
      setOk("Generated PSPEC.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/pspec/approve`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to approve");
      setOk("Approved.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/pspec/reject`, { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to reject");
      setOk("Rejected.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const canGenerate = (meta?.dib.latest_revision ?? 0) > 0;
  const hasPspec = (meta?.pspec.latest_revision ?? 0) > 0;

  return (
    <div>
      <h1 className="h1">Review & Approval</h1>
      <p className="p">
        Generates <span className="kbd">pspec.json</span> from the authoritative DIB and validates against{" "}
        <span className="kbd">schemas/pspec.schema.json</span>.
      </p>

      {!canGenerate ? (
        <div className="alert alertWarn" style={{ marginBottom: 12 }}>
          <strong>DIB not confirmed yet.</strong> Complete the DIB interview first.
        </div>
      ) : null}

      {error ? (
        <div className="alert alertErr" style={{ marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}
      {ok ? (
        <div className="alert alertOk" style={{ marginBottom: 12 }}>
          <strong>OK:</strong> {ok}
        </div>
      ) : null}

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn btnPrimary" disabled={busy || !canGenerate} onClick={() => void generate()}>
          {hasPspec ? "Regenerate PSPEC" : "Generate PSPEC"}
        </button>
        <button className="btn btnOk" disabled={busy || !hasPspec} onClick={() => void approve()}>
          Approve
        </button>
        <button className="btn btnDanger" disabled={busy || !hasPspec} onClick={() => void reject()}>
          Reject
        </button>
        <a className="btn" href={`/projects/${projectId}/artifacts`}>
          View Artifacts
        </a>
      </div>

      <div className="panel" style={{ padding: 14 }}>
        {summary ? (
          <div className="mono" style={{ lineHeight: 1.35 }}>
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        ) : (
          <div className="alert">
            <strong>No PSPEC summary yet.</strong> Generate PSPEC to produce <span className="kbd">pspec.summary.md</span>.
          </div>
        )}
      </div>
    </div>
  );
}

