import path from "node:path";
import { atomicWriteFile, ensureProjectLayout, exists, pspecRevisionDir, projectRoot, readJson } from "@/storage/fsStorage";
import { stableStringify } from "@/pipeline/stableJson";
import type { PspecV0_1 } from "@/spec/pspecTypes";

export function pspecLatestPath(projectId: string): string {
  return path.join(projectRoot(projectId), "pspec", "pspec.json");
}

export function pspecLatestSummaryPath(projectId: string): string {
  return path.join(projectRoot(projectId), "pspec", "pspec.summary.md");
}

export async function writePspecRevision(
  projectId: string,
  revision: number,
  pspec: PspecV0_1,
  summaryMd: string
): Promise<void> {
  await ensureProjectLayout(projectId);
  const dir = pspecRevisionDir(projectId, revision);
  await atomicWriteFile(path.join(dir, "pspec.json"), stableStringify(pspec));
  await atomicWriteFile(path.join(dir, "pspec.summary.md"), summaryMd.endsWith("\n") ? summaryMd : summaryMd + "\n");
  await atomicWriteFile(pspecLatestPath(projectId), stableStringify(pspec));
  await atomicWriteFile(pspecLatestSummaryPath(projectId), summaryMd.endsWith("\n") ? summaryMd : summaryMd + "\n");
}

export async function readLatestPspec(projectId: string): Promise<PspecV0_1 | null> {
  const p = pspecLatestPath(projectId);
  if (!(await exists(p))) return null;
  return readJson<PspecV0_1>(p);
}

export async function readLatestPspecSummary(projectId: string): Promise<string | null> {
  const p = pspecLatestSummaryPath(projectId);
  if (!(await exists(p))) return null;
  const fs = await import("node:fs/promises");
  return fs.readFile(p, "utf8");
}

export function pspecRevisionPath(projectId: string, revision: number): string {
  return path.join(pspecRevisionDir(projectId, revision), "pspec.json");
}

export function pspecSummaryRevisionPath(projectId: string, revision: number): string {
  return path.join(pspecRevisionDir(projectId, revision), "pspec.summary.md");
}

export async function readPspecRevision(projectId: string, revision: number): Promise<PspecV0_1 | null> {
  const p = pspecRevisionPath(projectId, revision);
  if (!(await exists(p))) return null;
  return readJson<PspecV0_1>(p);
}

export async function readPspecSummaryRevision(projectId: string, revision: number): Promise<string | null> {
  const p = pspecSummaryRevisionPath(projectId, revision);
  if (!(await exists(p))) return null;
  const fs = await import("node:fs/promises");
  return fs.readFile(p, "utf8");
}
