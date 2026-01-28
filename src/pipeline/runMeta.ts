import path from "node:path";
import { atomicWriteFile, ensureProjectLayout, projectRoot, readJson, exists } from "@/storage/fsStorage";
import { stableStringify } from "@/pipeline/stableJson";

export type RunMeta = {
  meta_version: "0.1.0";
  project_id: string;
  project_name: string | null;
  created_at: string;
  updated_at: string;
  schema_versions: { dib: "0.1.0"; pspec: "0.1.0" };
  crg: null | {
    original_filename: string;
    format: "glb" | "gltf" | "fbx" | "obj";
    bytes: number;
    sha256: string;
    uploaded_at: string;
  };
  dib: {
    latest_revision: number;
    revisions: { revision: number; sha256: string; confirmed_at: string }[];
  };
  pspec: {
    latest_revision: number;
    revisions: {
      revision: number;
      sha256: string;
      summary_md_sha256: string;
      created_at: string;
      dib_revision: number;
      dib_sha256: string;
      crg_sha256: string;
      approval: {
        state: "pending" | "approved" | "rejected";
        decided_at: string | null;
      };
    }[];
    approval: {
      state: "none" | "pending" | "approved" | "rejected";
      revision: number | null;
      decided_at: string | null;
    };
  };
};

export function runMetaPath(projectId: string): string {
  return path.join(projectRoot(projectId), "meta", "run.json");
}

export async function initRunMeta(projectId: string, nowIso: string, projectName?: string | null): Promise<RunMeta> {
  await ensureProjectLayout(projectId);
  const meta: RunMeta = {
    meta_version: "0.1.0",
    project_id: projectId,
    project_name: normalizeProjectName(projectName ?? null),
    created_at: nowIso,
    updated_at: nowIso,
    schema_versions: { dib: "0.1.0", pspec: "0.1.0" },
    crg: null,
    dib: { latest_revision: 0, revisions: [] },
    pspec: {
      latest_revision: 0,
      revisions: [],
      approval: { state: "none", revision: null, decided_at: null }
    }
  };
  await atomicWriteFile(runMetaPath(projectId), stableStringify(meta));
  return meta;
}

export async function readRunMeta(projectId: string): Promise<RunMeta> {
  const p = runMetaPath(projectId);
  if (!(await exists(p))) {
    const nowIso = new Date().toISOString();
    return initRunMeta(projectId, nowIso);
  }
  const meta = await readJson<RunMeta>(p);
  if ((meta as any).project_name === undefined) meta.project_name = null;
  meta.project_name = normalizeProjectName(meta.project_name ?? null);
  return meta;
}

export async function writeRunMeta(projectId: string, meta: RunMeta): Promise<void> {
  meta.project_name = normalizeProjectName(meta.project_name ?? null);
  await atomicWriteFile(runMetaPath(projectId), stableStringify(meta));
}

export function normalizeProjectName(name: string | null): string | null {
  if (name == null) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed.length > 120) return trimmed.slice(0, 120);
  return trimmed;
}
