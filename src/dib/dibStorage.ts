import path from "node:path";
import {
  atomicWriteFile,
  dibRevisionDir,
  ensureProjectLayout,
  exists,
  projectRoot,
  readJson
} from "@/storage/fsStorage";
import { stableStringify } from "@/pipeline/stableJson";

export type DibV0_1 = {
  dib_version: "0.1.0";
  project_id: string;
  revision: number;
  created_at: string;
  confirmed_at: string;

  assumptions: {
    archetype_confirmed: boolean;
    sealed_speakers_confirmed: boolean;
  };

  overall: { width_mm: number; height_mm: number; depth_mm: number };
  constraints: { back_clearance_mm: number };
  access: { rear_service_hatch: boolean };
  material: { type: string; thickness_mm: number; notes?: string };

  speakers: {
    external_mm: { width_mm: number; height_mm: number; depth_mm: number };
    weight_kg: number;
    required_clearance_mm: number;
    isolation: { strategy: string; notes?: string };
  };

  turntable: {
    external_mm: { width_mm: number; height_mm: number; depth_mm: number };
    isolation: boolean;
  };

  amplifier: {
    external_mm: { width_mm: number; height_mm: number; depth_mm: number };
    ventilation_direction: string;
    required_clearance_mm: number;
  };

  drawers: { count: number; lp_capacity_target: number };
  output_profile: string;

  confirmed: true;
};

export type DibDraft = Record<string, unknown>;

export function dibDraftPath(projectId: string): string {
  return path.join(projectRoot(projectId), "dib", "draft.json");
}

export function dibLatestPath(projectId: string): string {
  return path.join(projectRoot(projectId), "dib", "dib.json");
}

export async function readDibDraft(projectId: string): Promise<DibDraft | null> {
  await ensureProjectLayout(projectId);
  const p = dibDraftPath(projectId);
  if (!(await exists(p))) return null;
  return readJson<DibDraft>(p);
}

export async function writeDibDraft(projectId: string, draft: DibDraft): Promise<void> {
  await ensureProjectLayout(projectId);
  await atomicWriteFile(dibDraftPath(projectId), stableStringify(draft));
}

export async function writeDibRevision(projectId: string, revision: number, dib: DibV0_1): Promise<void> {
  await ensureProjectLayout(projectId);
  const dir = dibRevisionDir(projectId, revision);
  await atomicWriteFile(path.join(dir, "dib.json"), stableStringify(dib));
  await atomicWriteFile(dibLatestPath(projectId), stableStringify(dib));
}

export async function readLatestDib(projectId: string): Promise<DibV0_1 | null> {
  const p = dibLatestPath(projectId);
  if (!(await exists(p))) return null;
  return readJson<DibV0_1>(p);
}

