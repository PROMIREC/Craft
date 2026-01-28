"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function NewProjectPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_name: name })
      });
      const json = (await res.json()) as { projectId?: string; error?: string };
      if (!res.ok || !json.projectId) throw new Error(json.error ?? "Failed to create project");
      router.replace(`/projects/${json.projectId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h1 className="h1">New Project</h1>
      <p className="p">Creates a unique machine project ID, and you can set a human-friendly name.</p>
      {error ? (
        <div className="alert alertErr" style={{ marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}
      <div className="panel" style={{ padding: 14, marginBottom: 12 }}>
        <label className="label">Project name (optional)</label>
        <input
          className="input"
          value={name}
          placeholder="e.g. Living room record console"
          onChange={(e) => setName(e.currentTarget.value)}
          disabled={busy}
        />
        <div className="mono" style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
          The underlying project_id remains a stable machine identifier for artifact paths.
        </div>
      </div>
      <button className="btn btnPrimary" onClick={create} disabled={busy}>
        {busy ? "Creating…" : "Create Project"}
      </button>
    </div>
  );
}
