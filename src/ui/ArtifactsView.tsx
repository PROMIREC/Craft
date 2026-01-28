"use client";

import { useEffect, useState } from "react";

type RunMeta = {
  project_id: string;
  crg: null | { original_filename: string };
  dib: { latest_revision: number; revisions?: { revision: number }[] };
  pspec: {
    latest_revision: number;
    revisions?: { revision: number }[];
    approval: { state: string; revision: number | null };
  };
};

export function ArtifactsView({ projectId }: { projectId: string }) {
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/meta/run`);
        const json = (await res.json()) as { run?: RunMeta; error?: string };
        if (!res.ok || !json.run) throw new Error(json.error ?? "Failed to load run.json");
        if (!cancelled) setMeta(json.run);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const dibRevs = meta?.dib.revisions?.map((r) => r.revision) ?? (meta?.dib.latest_revision ? [meta.dib.latest_revision] : []);
  const pspecRevs =
    meta?.pspec.revisions?.map((r) => r.revision) ?? (meta?.pspec.latest_revision ? [meta.pspec.latest_revision] : []);

  return (
    <div>
      <h1 className="h1">Artifacts</h1>
      <p className="p">
        Download the latest and versioned artifacts. All artifacts live under <span className="kbd">artifacts/{projectId}</span>.
      </p>

      {error ? (
        <div className="alert alertErr" style={{ marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      <div className="panel" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Latest</div>
        <div className="row">
          <a className="btn" href={`/api/projects/${projectId}/download?kind=crg`}>
            CRG
          </a>
          <a className="btn" href={`/api/projects/${projectId}/download?kind=dib_json`}>
            dib.json
          </a>
          <a className="btn" href={`/api/projects/${projectId}/download?kind=pspec_json`}>
            pspec.json
          </a>
          <a className="btn" href={`/api/projects/${projectId}/download?kind=pspec_summary_md`}>
            pspec.summary.md
          </a>
          <a className="btn" href={`/api/projects/${projectId}/download?kind=run_json`}>
            meta/run.json
          </a>
        </div>
        <div style={{ height: 8 }} />
        <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>
          PSPEC approval: {meta?.pspec.approval.state ?? "—"}
        </div>
      </div>

      <div className="grid">
        <div className="panel">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>DIB revisions</div>
          {dibRevs.length ? (
            <div className="row">
              {dibRevs.map((r) => (
                <a key={r} className="btn" href={`/api/projects/${projectId}/download?kind=dib_json&rev=${r}`}>
                  rev-{String(r).padStart(4, "0")}
                </a>
              ))}
            </div>
          ) : (
            <div className="alert">No DIB revisions yet.</div>
          )}
        </div>

        <div className="panel">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>PSPEC revisions</div>
          {pspecRevs.length ? (
            <div className="row">
              {pspecRevs.map((r) => (
                <a key={r} className="btn" href={`/api/projects/${projectId}/download?kind=pspec_json&rev=${r}`}>
                  pspec rev-{String(r).padStart(4, "0")}
                </a>
              ))}
              {pspecRevs.map((r) => (
                <a
                  key={`md-${r}`}
                  className="btn"
                  href={`/api/projects/${projectId}/download?kind=pspec_summary_md&rev=${r}`}
                >
                  summary rev-{String(r).padStart(4, "0")}
                </a>
              ))}
            </div>
          ) : (
            <div className="alert">No PSPEC revisions yet.</div>
          )}
        </div>
      </div>

      <div style={{ height: 12 }} />
      <a className="btn" href={`/projects/${projectId}`}>
        Back to Project
      </a>
    </div>
  );
}

