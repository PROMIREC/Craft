"use client";

import { useEffect, useMemo, useState } from "react";

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
  const [selectedDibRev, setSelectedDibRev] = useState<number | null>(null);
  const [selectedPspecRev, setSelectedPspecRev] = useState<number | null>(null);

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

  const dibRevs = useMemo(
    () =>
      (meta?.dib.revisions?.map((r) => r.revision) ?? (meta?.dib.latest_revision ? [meta.dib.latest_revision] : []))
        .slice()
        .sort((a, b) => b - a),
    [meta]
  );
  const pspecRevs = useMemo(
    () =>
      (meta?.pspec.revisions?.map((r) => r.revision) ?? (meta?.pspec.latest_revision ? [meta.pspec.latest_revision] : []))
        .slice()
        .sort((a, b) => b - a),
    [meta]
  );

  useEffect(() => {
    if (!dibRevs.length) {
      setSelectedDibRev(null);
      return;
    }
    setSelectedDibRev((prev) => (prev && dibRevs.includes(prev) ? prev : dibRevs[0]));
  }, [dibRevs]);

  useEffect(() => {
    if (!pspecRevs.length) {
      setSelectedPspecRev(null);
      return;
    }
    setSelectedPspecRev((prev) => (prev && pspecRevs.includes(prev) ? prev : pspecRevs[0]));
  }, [pspecRevs]);

  const revId = (r: number) => `rev-${String(r).padStart(4, "0")}`;

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
          {meta?.pspec.latest_revision ? (
            <a className="btn" href={`/projects/${projectId}/revisions/${revId(meta.pspec.latest_revision)}/onshape`}>
              Onshape preview
            </a>
          ) : null}
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
          {dibRevs.length && selectedDibRev ? (
            <div className="row">
              <select
                className="select"
                style={{ width: "auto", minWidth: 180 }}
                value={selectedDibRev}
                onChange={(e) => setSelectedDibRev(Number(e.target.value))}
              >
                {dibRevs.map((r) => (
                  <option key={r} value={r}>
                    rev-{String(r).padStart(4, "0")}
                  </option>
                ))}
              </select>
              <a className="btn" href={`/api/projects/${projectId}/download?kind=dib_json&rev=${selectedDibRev}`}>
                Download dib.json
              </a>
            </div>
          ) : (
            <div className="alert">No DIB revisions yet.</div>
          )}
        </div>

        <div className="panel">
          <div style={{ fontWeight: 700, marginBottom: 8 }}>PSPEC revisions</div>
          {pspecRevs.length && selectedPspecRev ? (
            <div className="row">
              <select
                className="select"
                style={{ width: "auto", minWidth: 180 }}
                value={selectedPspecRev}
                onChange={(e) => setSelectedPspecRev(Number(e.target.value))}
              >
                {pspecRevs.map((r) => (
                  <option key={r} value={r}>
                    rev-{String(r).padStart(4, "0")}
                  </option>
                ))}
              </select>
              <a className="btn" href={`/api/projects/${projectId}/download?kind=pspec_json&rev=${selectedPspecRev}`}>
                Download pspec.json
              </a>
              <a className="btn" href={`/api/projects/${projectId}/download?kind=pspec_summary_md&rev=${selectedPspecRev}`}>
                Download summary
              </a>
              <a className="btn" href={`/projects/${projectId}/revisions/${revId(selectedPspecRev)}/onshape`}>
                Open Onshape preview
              </a>
            </div>
          ) : (
            <div className="alert">No PSPEC revisions yet.</div>
          )}
        </div>
      </div>

      <div className="sectionTopGap">
        <a className="btn" href={`/projects/${projectId}`}>
          Back to Project
        </a>
      </div>
    </div>
  );
}
