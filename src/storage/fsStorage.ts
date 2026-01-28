import fs from "node:fs/promises";
import path from "node:path";

export const ARTIFACTS_ROOT = path.join(process.cwd(), "artifacts");

const PROJECT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/;

export function assertValidProjectId(projectId: string): void {
  if (!PROJECT_ID_RE.test(projectId)) {
    throw new Error("Invalid project_id");
  }
}

export function sanitizeFileName(fileName: string): string {
  const base = path.basename(fileName);
  return base.replaceAll("\u0000", "").trim();
}

export function projectRoot(projectId: string): string {
  assertValidProjectId(projectId);
  return path.join(ARTIFACTS_ROOT, projectId);
}

export function safeJoin(root: string, ...parts: string[]): string {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(root, ...parts);
  if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
    throw new Error("Unsafe path");
  }
  return resolvedPath;
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function atomicWriteFile(filePath: string, data: Uint8Array | string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, filePath);
}

export async function readFileUtf8(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await readFileUtf8(filePath);
  return JSON.parse(raw) as T;
}

export async function listProjectIds(): Promise<string[]> {
  await ensureDir(ARTIFACTS_ROOT);
  const entries = await fs.readdir(ARTIFACTS_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory() && PROJECT_ID_RE.test(e.name))
    .map((e) => e.name)
    .sort();
}

export async function ensureProjectLayout(projectId: string): Promise<void> {
  const root = projectRoot(projectId);
  await ensureDir(root);
  await ensureDir(path.join(root, "crg"));
  await ensureDir(path.join(root, "dib"));
  await ensureDir(path.join(root, "pspec"));
  await ensureDir(path.join(root, "meta"));
}

export async function deleteProjectArtifacts(projectId: string): Promise<void> {
  const root = projectRoot(projectId);
  await fs.rm(root, { recursive: true, force: true });
}

export function dibRevisionDir(projectId: string, revision: number): string {
  return safeJoin(projectRoot(projectId), "dib", `rev-${String(revision).padStart(4, "0")}`);
}

export function pspecRevisionDir(projectId: string, revision: number): string {
  return safeJoin(projectRoot(projectId), "pspec", `rev-${String(revision).padStart(4, "0")}`);
}
