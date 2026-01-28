"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RunMeta = {
  project_id: string;
  project_name: string | null;
  created_at: string;
  updated_at: string;
  crg: null | { original_filename: string; bytes: number; uploaded_at: string };
  dib: { latest_revision: number };
  pspec: { latest_revision: number; approval: { state: string; revision: number | null } };
};

export function ProjectDashboard({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const steps = useMemo(
    () => [
      { label: "Upload CRG", href: `/projects/${projectId}/crg`, done: !!meta?.crg },
      { label: "Complete DIB", href: `/projects/${projectId}/dib`, done: (meta?.dib.latest_revision ?? 0) > 0 },
      { label: "Review PSPEC", href: `/projects/${projectId}/review`, done: (meta?.pspec.latest_revision ?? 0) > 0 },
      { label: "Artifacts", href: `/projects/${projectId}/artifacts`, done: true }
    ],
    [meta, projectId]
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setError(null);
      try {
        const res = await fetch(`/api/projects/${projectId}/meta/run`);
        const json = (await res.json()) as { run?: RunMeta; error?: string };
        if (!res.ok || !json.run) throw new Error(json.error ?? "Failed to load project status");
        if (!cancelled) {
          setMeta(json.run);
          setName(json.run.project_name ?? "");
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function saveName() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_name: name })
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; project_name?: string | null };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to save name");
      setMeta((m) => (m ? { ...m, project_name: json.project_name ?? null } : m));
      setName(json.project_name ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject() {
    const ok = window.confirm(
      `Delete project?\n\nName: ${meta?.project_name ?? "Untitled project"}\nID: ${projectId}\n\nThis removes artifacts/${projectId} from disk.`
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to delete project");
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 className="h1" style={{ marginBottom: 4 }}>
            {meta?.project_name ? meta.project_name : "Untitled project"}
          </h1>
          <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>
            {projectId}
          </div>
          <p className="p" style={{ margin: "8px 0 0" }}>
            Deterministic artifact lineage. CRG is non-authoritative; DIB is authoritative once confirmed.
          </p>
        </div>
        <a className="btn" href="/">
          Back to Projects
        </a>
      </div>

      <div className="hr" />

      {error ? (
        <div className="alert alertErr" style={{ marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      <div className="panel" style={{ padding: 14, marginBottom: 12 }}>
        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="label">Project name</label>
            <input
              className="input"
              value={name}
              placeholder="Untitled project"
              onChange={(e) => setName(e.currentTarget.value)}
              disabled={busy}
            />
          </div>
          <button className="btn btnPrimary" onClick={() => void saveName()} disabled={busy}>
            Save name
          </button>
          <button className="btn btnDanger" onClick={() => void deleteProject()} disabled={busy}>
            Delete project
          </button>
        </div>
        <div className="mono" style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
          Deleting removes <span className="kbd">artifacts/{projectId}</span> from disk.
        </div>
      </div>

      <div className="grid">
        {steps.map((s) => (
          <a key={s.label} className="panel" href={s.href}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 700 }}>{s.label}</div>
              <div className="mono" style={{ color: s.done ? "var(--ok)" : "var(--muted)", fontSize: 12 }}>
                {s.done ? "DONE" : "TODO"}
              </div>
            </div>
          </a>
        ))}
      </div>

      <div style={{ height: 12 }} />

      {meta?.pspec.latest_revision ? (
        <div className={`alert ${meta.pspec.approval.state === "approved" ? "alertOk" : "alertWarn"}`}>
          <strong>PSPEC status:</strong>{" "}
          {meta.pspec.approval.state} (latest revision {meta.pspec.latest_revision})
        </div>
      ) : (
        <div className="alert alertWarn">
          <strong>PSPEC not generated yet.</strong> Complete DIB then generate PSPEC for review.
        </div>
      )}
    </div>
  );
}
