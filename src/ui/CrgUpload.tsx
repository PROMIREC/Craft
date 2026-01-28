"use client";

import { useEffect, useState } from "react";

type RunMeta = {
  project_id: string;
  crg: null | { original_filename: string; bytes: number; uploaded_at: string };
};

export function CrgUpload({ projectId }: { projectId: string }) {
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`/api/projects/${projectId}/meta/run`);
    const json = (await res.json()) as { run?: RunMeta };
    if (res.ok && json.run) setMeta(json.run);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/projects/${projectId}/crg`, { method: "POST", body: form });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Upload failed");
      setOk("Uploaded.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h1 className="h1">CRG Upload</h1>
      <p className="p">
        Accepted formats: <span className="kbd">GLB</span>, <span className="kbd">GLTF</span>,{" "}
        <span className="kbd">FBX</span>, <span className="kbd">OBJ</span>. Stored as a non-authoritative
        reference only.
      </p>

      <div className="alert alertWarn" style={{ marginBottom: 12 }}>
        <strong>Scale warning:</strong> CRG scale is non-authoritative. The system never infers manufacturable
        dimensions from mesh geometry.
      </div>

      {meta?.crg ? (
        <div className="alert" style={{ marginBottom: 12 }}>
          <strong>Current CRG:</strong> {meta.crg.original_filename} ({meta.crg.bytes.toLocaleString()} bytes)
        </div>
      ) : (
        <div className="alert" style={{ marginBottom: 12 }}>
          <strong>No CRG uploaded yet.</strong>
        </div>
      )}

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

      <div className="panel" style={{ padding: 14 }}>
        <label className="label">Choose a CRG file</label>
        <input
          className="input"
          type="file"
          accept=".glb,.gltf,.fbx,.obj"
          disabled={busy}
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) void upload(f);
          }}
        />
        <div style={{ height: 10 }} />
        <a className="btn" href={`/projects/${projectId}`}>
          Back to Project
        </a>
      </div>
    </div>
  );
}

