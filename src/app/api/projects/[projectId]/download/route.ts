import { NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import { assertValidProjectId, dibRevisionDir, pspecRevisionDir, projectRoot, safeJoin } from "@/storage/fsStorage";
import { onshapeCadDirForRevision } from "@/cad/onshapeMapping";
import { readOnshapeExportRecord } from "@/cad/onshapeOps";
import { readRunMeta } from "@/pipeline/runMeta";

export const runtime = "nodejs";

const KIND = [
  "crg",
  "dib_json",
  "pspec_json",
  "pspec_summary_md",
  "run_json",
  "onshape_partstudio_step",
  "onshape_drawing_pdf"
] as const;
type Kind = (typeof KIND)[number];

function asInt(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export async function GET(req: Request, ctx: { params: { projectId: string } }) {
  try {
    const projectId = ctx.params.projectId;
    assertValidProjectId(projectId);
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") as Kind | null;
    if (!kind || !KIND.includes(kind)) {
      return NextResponse.json({ error: "Invalid kind." }, { status: 400 });
    }
    const rev = asInt(url.searchParams.get("rev"));

    let filePath: string;
    let downloadName: string;
    if (kind === "run_json") {
      filePath = safeJoin(projectRoot(projectId), "meta", "run.json");
      downloadName = "run.json";
    } else if (kind === "crg") {
      const meta = await readRunMeta(projectId);
      if (!meta.crg) return NextResponse.json({ error: "No CRG uploaded." }, { status: 404 });
      filePath = safeJoin(projectRoot(projectId), "crg", meta.crg.original_filename);
      downloadName = meta.crg.original_filename;
    } else if (kind === "dib_json") {
      if (rev) {
        filePath = path.join(dibRevisionDir(projectId, rev), "dib.json");
        downloadName = `dib.rev-${String(rev).padStart(4, "0")}.json`;
      } else {
        filePath = safeJoin(projectRoot(projectId), "dib", "dib.json");
        downloadName = "dib.json";
      }
    } else if (kind === "pspec_json") {
      if (rev) {
        filePath = path.join(pspecRevisionDir(projectId, rev), "pspec.json");
        downloadName = `pspec.rev-${String(rev).padStart(4, "0")}.json`;
      } else {
        filePath = safeJoin(projectRoot(projectId), "pspec", "pspec.json");
        downloadName = "pspec.json";
      }
    } else if (kind === "pspec_summary_md") {
      if (rev) {
        filePath = path.join(pspecRevisionDir(projectId, rev), "pspec.summary.md");
        downloadName = `pspec.summary.rev-${String(rev).padStart(4, "0")}.md`;
      } else {
        filePath = safeJoin(projectRoot(projectId), "pspec", "pspec.summary.md");
        downloadName = "pspec.summary.md";
      }
    } else if (kind === "onshape_partstudio_step" || kind === "onshape_drawing_pdf") {
      if (!rev) {
        return NextResponse.json({ error: "Revision is required for Onshape exports." }, { status: 400 });
      }
      const exportRecord = await readOnshapeExportRecord(projectId, rev);
      if (!exportRecord || exportRecord.status !== "SUCCESS") {
        return NextResponse.json({ error: "Onshape export not available." }, { status: 404 });
      }
      const exportEntry =
        kind === "onshape_partstudio_step" ? exportRecord.exports.partstudio_step : exportRecord.exports.drawing_pdf;
      if (!exportEntry?.fileName) {
        return NextResponse.json({ error: "Export file missing." }, { status: 404 });
      }
      const exportsDir = path.join(onshapeCadDirForRevision(projectId, rev), "exports");
      filePath = safeJoin(exportsDir, exportEntry.fileName);
      downloadName = exportEntry.fileName;
    } else {
      return NextResponse.json({ error: "Unhandled kind." }, { status: 400 });
    }

    const bytes = await fs.readFile(filePath);
    const contentType = downloadName.endsWith(".json")
      ? "application/json"
      : downloadName.endsWith(".md")
        ? "text/markdown"
        : downloadName.endsWith(".pdf")
          ? "application/pdf"
          : downloadName.endsWith(".step") || downloadName.endsWith(".stp")
            ? "application/step"
            : "application/octet-stream";
    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${downloadName}"`
      }
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
  }
}
