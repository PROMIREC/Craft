import { ensureProjectLayout } from "@/storage/fsStorage";
import { newProjectId } from "@/pipeline/crypto";
import { initRunMeta } from "@/pipeline/runMeta";

export async function createProject(args?: { projectName?: string | null }): Promise<{ projectId: string }> {
  const projectId = newProjectId();
  await ensureProjectLayout(projectId);
  await initRunMeta(projectId, new Date().toISOString(), args?.projectName ?? null);
  return { projectId };
}
