"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";

type ProvenanceEntry = {
  var: string;
  value: number;
  unit: "mm" | "count" | "flag" | "enum";
  source: "DIB" | "DEFAULT" | "DERIVED";
  pspecPath: string;
  notes?: string;
};

type OkResponse = {
  ok: true;
  project_id: string;
  revision: number;
  rev_id: string;
  approval: string;
  output_profile: string;
  pspec_summary_md: string;
  variables: Record<string, number>;
  provenance: ProvenanceEntry[];
};

type ErrResponse = {
  ok?: false;
  error: string;
  errors?: { code: string; var: string; pspecPath?: string; message: string }[];
};

async function readJsonResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!contentType.includes("application/json")) {
    const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(
      `Expected JSON but got ${contentType || "unknown"} (HTTP ${res.status}). ${snippet ? `Body: ${snippet}` : ""}`.trim()
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
    throw new Error(`Server returned invalid JSON (HTTP ${res.status}). ${snippet ? `Body: ${snippet}` : ""}`.trim());
  }
}

export function OnshapePreview({ projectId, revId }: { projectId: string; revId: string }) {
  const [data, setData] = useState<OkResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mappingErrors, setMappingErrors] = useState<ErrResponse["errors"]>([]);

  const rows = useMemo(() => {
    const p = data?.provenance ?? [];
    return [...p].sort((a, b) => a.var.localeCompare(b.var));
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      setMappingErrors([]);
      try {
        const res = await fetch(`/api/projects/${projectId}/revisions/${revId}/onshape`);
        const json = await readJsonResponse<OkResponse | ErrResponse>(res);
        if (!res.ok || !json.ok) {
          const err = json as ErrResponse;
          if (!cancelled) {
            setMappingErrors(err.errors ?? []);
            throw new Error(err.error ?? "Failed to load Onshape preview");
          }
          return;
        }
        if (!cancelled) setData(json as OkResponse);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, revId]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 className="h1" style={{ marginBottom: 4 }}>
            Onshape Preview
          </h1>
          <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>
            Project <span className="kbd">{projectId}</span> • Revision <span className="kbd">{revId}</span>
          </div>
        </div>
        <div className="row">
          <a className="btn" href={`/projects/${projectId}/artifacts`}>
            Back to Artifacts
          </a>
          <a className="btn" href={`/projects/${projectId}`}>
            Back to Project
          </a>
        </div>
      </div>

      <div className="hr" />

      {error ? (
        <div className="alert alertErr" style={{ marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {mappingErrors?.length ? (
        <div className="alert alertErr" style={{ marginBottom: 12 }}>
          <strong>Mapping errors:</strong>
          <ul style={{ margin: "8px 0 0 18px", color: "var(--text)" }}>
            {mappingErrors.map((e, idx) => (
              <li key={`${e.var}-${idx}`}>
                <span className="mono">{e.var}</span>
                {e.pspecPath ? (
                  <>
                    {" "}
                    (<span className="mono">{e.pspecPath}</span>)
                  </>
                ) : null}
                : {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data ? (
        <div className="panel" style={{ padding: 14, marginBottom: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>
              Approval: <span className="kbd">{data.approval}</span> • Output profile:{" "}
              <span className="kbd">{data.output_profile}</span>
            </div>
            <div className="row">
              <a className="btn" href={`/api/projects/${projectId}/download?kind=pspec_json&rev=${data.revision}`}>
                Download PSPEC
              </a>
              <a className="btn" href={`/api/projects/${projectId}/download?kind=pspec_summary_md&rev=${data.revision}`}>
                Download Summary
              </a>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))" }}>
        <div className="panel" style={{ padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>PSPEC summary</div>
          {data?.pspec_summary_md ? (
            <div className="mono" style={{ lineHeight: 1.35 }}>
              <ReactMarkdown>{data.pspec_summary_md}</ReactMarkdown>
            </div>
          ) : (
            <div className="alert">No summary available for this revision.</div>
          )}
        </div>

        <div className="panel" style={{ padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Onshape variable mapping</div>
          {rows.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                      Variable
                    </th>
                    <th style={{ textAlign: "right", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                      Value
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                      Unit
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                      Source
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                      PSPEC path
                    </th>
                    <th style={{ textAlign: "left", padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.var}>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                        <span className="mono">{r.var}</span>
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                        <span className="mono">{String(r.value)}</span>
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                        <span className="kbd">{r.unit}</span>
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                        <span className="kbd">{r.source}</span>
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                        <span className="mono" style={{ color: "var(--muted)" }}>
                          {r.pspecPath}
                        </span>
                      </td>
                      <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)" }}>
                        {r.notes ? (
                          <span style={{ color: "var(--muted)" }}>{r.notes}</span>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="alert">No mapping available.</div>
          )}
        </div>
      </div>
    </div>
  );
}

