import crypto from "node:crypto";

export function sha256Hex(bytes: Uint8Array): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function newProjectId(): string {
  // Must satisfy schemas/pspec.schema.json $defs.projectId
  return `prj_${crypto.randomUUID()}`;
}

