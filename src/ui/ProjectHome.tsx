"use client";

import { useEffect, useState } from "react";

type ProjectRow = {
  project_id: string;
  project_name?: string | null;
  created_at?: string;
  updated_at?: string;
};

export function ProjectHome() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/projects", { method: "GET" });
        const json = (await res.json()) as { projects?: ProjectRow[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load projects");
        if (!cancelled) setProjects(json.projects ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      {error ? (
        <div className="alert alertErr" style={{ marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      <div className="row" style={{ marginBottom: 12 }}>
        <a className="btn btnPrimary" href="/projects/new">
          Create New Project
        </a>
      </div>

      {projects.length === 0 ? (
        <div className="alert">
          <strong>No projects yet.</strong> Create one to start the CRG → DIB → PSPEC pipeline.
        </div>
      ) : (
        <div className="grid">
          {projects.map((p) => (
            <a key={p.project_id} className="panel" href={`/projects/${p.project_id}`}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>
                {p.project_name ? p.project_name : "Untitled project"}
              </div>
              <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>
                <div>{p.project_id}</div>
                <div>{p.updated_at ? `Updated ${p.updated_at}` : "—"}</div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
