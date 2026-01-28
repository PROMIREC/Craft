import path from "node:path";
import { sha256Hex } from "@/pipeline/crypto";
import { readRunMeta, writeRunMeta } from "@/pipeline/runMeta";
import { assertValidProjectId, atomicWriteFile, ensureProjectLayout, projectRoot, sanitizeFileName } from "@/storage/fsStorage";

export type CrgFormat = "glb" | "gltf" | "fbx" | "obj";

function formatFromFileName(fileName: string): CrgFormat {
  const ext = path.extname(fileName).toLowerCase().replace(".", "");
  if (ext === "glb" || ext === "gltf" || ext === "fbx" || ext === "obj") return ext;
  throw new Error("Unsupported file format. Use GLB, GLTF, FBX, or OBJ.");
}

export async function ingestCrg(args: {
  projectId: string;
  originalFileName: string;
  bytes: Uint8Array;
}): Promise<{ ok: true }> {
  assertValidProjectId(args.projectId);
  await ensureProjectLayout(args.projectId);

  const originalFileName = sanitizeFileName(args.originalFileName);
  if (!originalFileName) throw new Error("Invalid filename.");

  const format = formatFromFileName(originalFileName);
  if (args.bytes.byteLength < 1) throw new Error("Empty file.");

  const sha256 = sha256Hex(args.bytes);
  const filePath = path.join(projectRoot(args.projectId), "crg", originalFileName);
  await atomicWriteFile(filePath, args.bytes);

  const now = new Date().toISOString();
  const meta = await readRunMeta(args.projectId);
  meta.updated_at = now;
  meta.crg = {
    original_filename: originalFileName,
    format,
    bytes: args.bytes.byteLength,
    sha256,
    uploaded_at: now
  };
  await writeRunMeta(args.projectId, meta);

  return { ok: true };
}

