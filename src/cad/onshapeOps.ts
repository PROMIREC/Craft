import path from "node:path";
import { OnshapeApiError, OnshapeClient } from "@/cad/onshapeClient";
import { onshapeCadDirForRevision, type OnshapeVariableProvenance } from "@/cad/onshapeMapping";
import { stableStringify } from "@/pipeline/stableJson";
import { readOnshapeOauthConfig } from "@/onshape/oauth";
import { atomicWriteFile, assertValidProjectId, exists, readJson } from "@/storage/fsStorage";

export type OnshapeTemplateRef = {
  did: string;
  wid: string;
  eid: string;
};

export type OnshapeRunError = {
  step: "config" | "load_variables" | "clone_template" | "apply_variables" | "regenerate";
  message: string;
};

export type OnshapeRunRecord = {
  status: "SUCCESS" | "FAILED";
  timestamp: string;
  template: OnshapeTemplateRef;
  created: {
    did: string | null;
    wid: string | null;
    eid: string | null;
  };
  onshapeUrl: string | null;
  variablesApplied: {
    count: number;
  };
  errors: OnshapeRunError[];
};

export type OnshapeExportError = {
  step:
    | "config"
    | "validate_run"
    | "resolve_elements"
    | "partstudio_step"
    | "drawing_pdf"
    | "download"
    | "write_file";
  message: string;
};

export type OnshapeExportRecord = {
  status: "SUCCESS" | "FAILED";
  timestamp: string;
  source: {
    did: string | null;
    wid: string | null;
    eid: string | null;
    onshapeUrl: string | null;
  };
  exports: {
    partstudio_step: {
      elementId: string | null;
      elementName: string | null;
      translationId: string | null;
      resultElementId: string | null;
      fileName: string | null;
      bytes: number;
    } | null;
    drawing_pdf: {
      elementId: string | null;
      elementName: string | null;
      translationId: string | null;
      resultElementId: string | null;
      fileName: string | null;
      bytes: number;
    } | null;
  };
  errors: OnshapeExportError[];
};

type VariableUnit = "mm" | "count" | "flag" | "enum";

type OnshapeElement = {
  id: string;
  name: string;
  elementType: string;
};

type OnshapeVariable = {
  name: string;
  type?: string;
  description?: string;
};

type ApplyVariablesResult = {
  count: number;
};

type ReadVariablesResult = {
  variablesMap: Record<string, number>;
  unitsByVar: Record<string, VariableUnit | undefined>;
};

type GenerateOnshapeRunResult = {
  run: OnshapeRunRecord;
  reused: boolean;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var ${name}.`);
  return value;
}

function formatRevisionId(revision: number): string {
  return `rev-${String(revision).padStart(4, "0")}`;
}

function sanitizeMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 400);
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) return sanitizeMessage(error.message);
  return "Unknown error.";
}

function normalizeName(name: string): string {
  return name.startsWith("#") ? name.slice(1) : name;
}

function normalizeElementType(value: string): string {
  return value.trim().toUpperCase();
}

function selectVariableStudioElement(elements: OnshapeElement[]): OnshapeElement | null {
  const vars = elements.filter((e) => {
    const t = normalizeElementType(e.elementType);
    return t.includes("VARIABLE") || t.includes("VARSTUDIO");
  });
  if (!vars.length) return null;
  vars.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return vars[0];
}

function extractString(value: unknown, pathParts: string[]): string | null {
  let cursor: unknown = value;
  for (const part of pathParts) {
    if (!cursor || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return typeof cursor === "string" && cursor.trim() ? cursor : null;
}

function pickString(value: unknown, dottedPaths: string[]): string | null {
  for (const dotted of dottedPaths) {
    const found = extractString(value, dotted.split("."));
    if (found) return found;
  }
  return null;
}

function parseDocumentIdFromUrl(rawUrl: string): { did: string | null; wid: string | null } {
  try {
    const url = new URL(rawUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    const didIdx = parts.indexOf("documents");
    const wIdx = parts.indexOf("w");
    const did = didIdx >= 0 ? parts[didIdx + 1] ?? null : null;
    const wid = wIdx >= 0 ? parts[wIdx + 1] ?? null : null;
    return { did, wid };
  } catch {
    return { did: null, wid: null };
  }
}

function parseElements(value: unknown): OnshapeElement[] {
  const rawList = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as any).elements)
      ? ((value as any).elements as unknown[])
      : [];

  const elements: OnshapeElement[] = [];
  for (const entry of rawList) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const id =
      (typeof rec.id === "string" && rec.id) ||
      (typeof rec.elementId === "string" && rec.elementId) ||
      (typeof rec.eid === "string" && rec.eid) ||
      "";
    const name = typeof rec.name === "string" ? rec.name : "";
    const elementType =
      (typeof rec.elementType === "string" && rec.elementType) ||
      (typeof rec.type === "string" && rec.type) ||
      "";
    if (!id || !name || !elementType) continue;
    elements.push({ id, name, elementType });
  }
  return elements;
}

function parseVariables(value: unknown): OnshapeVariable[] {
  function fromObject(obj: Record<string, unknown>): unknown[] {
    for (const key of ["variables", "items", "rows", "data"] as const) {
      const direct = obj[key];
      if (Array.isArray(direct)) return direct;
    }
    for (const key of ["variableTable", "table", "result", "payload", "data"] as const) {
      const nested = obj[key];
      if (!nested || typeof nested !== "object") continue;
      const nestedRec = nested as Record<string, unknown>;
      for (const subKey of ["variables", "items", "rows", "data"] as const) {
        const arr = nestedRec[subKey];
        if (Array.isArray(arr)) return arr;
      }
    }
    return [];
  }

  function parseName(entry: unknown): string | null {
    if (typeof entry === "string") return entry.trim() || null;
    if (Array.isArray(entry)) {
      const first = entry[0];
      if (typeof first === "string") return first.trim() || null;
      return null;
    }
    if (!entry || typeof entry !== "object") return null;
    const rec = entry as Record<string, unknown>;
    const direct =
      (typeof rec.name === "string" && rec.name) ||
      (typeof rec.variableName === "string" && rec.variableName) ||
      (typeof rec.varName === "string" && rec.varName) ||
      (typeof rec.variable === "string" && rec.variable) ||
      (typeof rec.var === "string" && rec.var) ||
      "";
    if (direct) return direct;
    const nestedVar = rec.variable;
    if (nestedVar && typeof nestedVar === "object") {
      const nv = nestedVar as Record<string, unknown>;
      const nested =
        (typeof nv.name === "string" && nv.name) ||
        (typeof nv.variableName === "string" && nv.variableName) ||
        (typeof nv.varName === "string" && nv.varName) ||
        "";
      if (nested) return nested;
    }
    return null;
  }

  function parseType(entry: unknown): string | undefined {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const rec = entry as Record<string, unknown>;
    return (
      (typeof rec.type === "string" && rec.type) ||
      (typeof rec.variableType === "string" && rec.variableType) ||
      (typeof rec.valueType === "string" && rec.valueType) ||
      undefined
    );
  }

  function parseDescription(entry: unknown): string | undefined {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return undefined;
    const rec = entry as Record<string, unknown>;
    return (
      (typeof rec.description === "string" && rec.description) ||
      (typeof rec.comment === "string" && rec.comment) ||
      undefined
    );
  }

  const rawList = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? fromObject(value as Record<string, unknown>)
      : [];

  const out: OnshapeVariable[] = [];
  for (const entry of rawList) {
    const name = parseName(entry);
    if (name) {
      out.push({ name, type: parseType(entry), description: parseDescription(entry) });
      continue;
    }
    // Some responses wrap the table rows; unwrap a level if present.
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const nested = fromObject(entry as Record<string, unknown>);
      for (const inner of nested) {
        const innerName = parseName(inner);
        if (!innerName) continue;
        out.push({ name: innerName, type: parseType(inner), description: parseDescription(inner) });
      }
    }
  }

  // Deduplicate by normalized name to make missing-variable checks stable.
  const dedup = new Map<string, OnshapeVariable>();
  for (const v of out) {
    const key = v.name;
    if (!dedup.has(key)) dedup.set(key, v);
  }
  return [...dedup.values()];
}

function buildOnshapeDocumentUrl(did: string, wid: string, eid: string): string {
  const cfg = readOnshapeOauthConfig();
  const apiBase = new URL(cfg.apiBase);
  return `${apiBase.origin}/documents/${did}/w/${wid}/e/${eid}`;
}

function inferUnit(varName: string, unitsByVar: Record<string, VariableUnit | undefined>): VariableUnit {
  const explicit = unitsByVar[varName];
  if (explicit) return explicit;
  if (varName === "ACCESS_REAR_SERVICE_HATCH") return "flag";
  if (varName.endsWith("_COUNT") || varName.endsWith("_TARGET")) return "count";
  if (varName.endsWith("_CODE")) return "enum";
  return "mm";
}

function formatExpression(value: number, unit: VariableUnit): string {
  if (unit === "mm") return `${value} mm`;
  return String(value);
}

function inferVariableType(unit: VariableUnit, existing?: string): string {
  if (existing && existing.trim()) return existing;
  return unit === "mm" ? "LENGTH" : "NUMBER";
}

async function requestJsonFallback<T>(
  client: OnshapeClient,
  method: "GET" | "POST",
  paths: string[],
  opts?: { body?: unknown; query?: Record<string, string | number | boolean | null | undefined> }
): Promise<{ path: string; data: T }> {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const data = await client.requestJson<T>(method, path, {
        body: opts?.body,
        query: opts?.query
      });
      return { path, data };
    } catch (e) {
      lastError = e;
      if (e instanceof OnshapeApiError && (e.status === 404 || e.status === 405)) continue;
      throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Onshape request failed.");
}

async function fetchElements(client: OnshapeClient, did: string, wid: string): Promise<OnshapeElement[]> {
  const { data } = await requestJsonFallback<unknown>(client, "GET", [
    `/api/v10/documents/d/${did}/w/${wid}/elements`,
    `/api/v9/documents/d/${did}/w/${wid}/elements`,
    `/api/documents/d/${did}/w/${wid}/elements`
  ]);
  const elements = parseElements(data);
  if (!elements.length) {
    throw new Error(`No elements returned for document ${did} workspace ${wid}.`);
  }
  return elements;
}

async function fetchDefaultWorkspaceId(client: OnshapeClient, did: string): Promise<string> {
  const { data } = await requestJsonFallback<unknown>(client, "GET", [
    `/api/v10/documents/${did}`,
    `/api/v9/documents/${did}`,
    `/api/documents/${did}`
  ]);
  const wid =
    pickString(data, [
      "defaultWorkspace.id",
      "defaultWorkspace.workspaceId",
      "defaultWorkspaceId",
      "workspace.id",
      "workspaceId"
    ]) ?? null;
  if (!wid) throw new Error("Unable to resolve workspace id for copied document.");
  return wid;
}

async function postCopyWorkspace(
  client: OnshapeClient,
  template: OnshapeTemplateRef,
  newName: string
): Promise<{ did: string; wid: string }> {
  // Onshape Free accounts can only create public documents. Copy-workspace defaults to private unless
  // explicitly set, which produces the "Free accounts only allow access to public documents" error.
  const payload = { newName, isPublic: true };

  const { data } = await requestJsonFallback<unknown>(client, "POST", [
    `/api/v10/documents/${template.did}/workspaces/${template.wid}/copy`,
    `/api/v9/documents/${template.did}/workspaces/${template.wid}/copy`,
    `/api/v10/documents/d/${template.did}/w/${template.wid}/copy`,
    `/api/v9/documents/d/${template.did}/w/${template.wid}/copy`
  ], {
    body: payload
  });

  let did =
    pickString(data, [
      "newDocumentId",
      "documentId",
      "newDocument.id",
      "id",
      "document.id"
    ]) ?? null;
  let wid =
    pickString(data, [
      "newWorkspaceId",
      "workspaceId",
      "newWorkspace.id",
      "defaultWorkspace.id"
    ]) ?? null;

  const urlFromResponse = pickString(data, ["url", "documentUrl", "newDocumentUrl", "href"]);
  if ((!did || !wid) && urlFromResponse) {
    const parsed = parseDocumentIdFromUrl(urlFromResponse);
    did = did ?? parsed.did;
    wid = wid ?? parsed.wid;
  }

  if (!did) throw new Error("Unable to parse copied document id from Onshape response.");
  if (!wid) {
    wid = await fetchDefaultWorkspaceId(client, did);
  }

  return { did, wid };
}

export function readOnshapeTemplateRef(): OnshapeTemplateRef {
  return {
    did: requireEnv("ONSHAPE_TEMPLATE_DID"),
    wid: requireEnv("ONSHAPE_TEMPLATE_WID"),
    eid: requireEnv("ONSHAPE_TEMPLATE_EID")
  };
}

function defaultRunTemplate(): OnshapeTemplateRef {
  return {
    did: process.env.ONSHAPE_TEMPLATE_DID?.trim() ?? "",
    wid: process.env.ONSHAPE_TEMPLATE_WID?.trim() ?? "",
    eid: process.env.ONSHAPE_TEMPLATE_EID?.trim() ?? ""
  };
}

function runRecordBase(template: OnshapeTemplateRef): OnshapeRunRecord {
  return {
    status: "FAILED",
    timestamp: new Date().toISOString(),
    template,
    created: { did: null, wid: null, eid: null },
    onshapeUrl: null,
    variablesApplied: { count: 0 },
    errors: []
  };
}

export function onshapeRunPath(projectId: string, revision: number): string {
  return path.join(onshapeCadDirForRevision(projectId, revision), "onshape.run.json");
}

function onshapeRunArchivePath(projectId: string, revision: number, timestampIso: string): string {
  const safeTs = timestampIso.replace(/[:.]/g, "-");
  return path.join(onshapeCadDirForRevision(projectId, revision), `onshape.run.${safeTs}.json`);
}

function parseOnshapeRunRecord(value: unknown): OnshapeRunRecord {
  if (!value || typeof value !== "object") throw new Error("Invalid onshape.run.json format.");
  const rec = value as Record<string, unknown>;
  const status = rec.status === "SUCCESS" || rec.status === "FAILED" ? rec.status : null;
  const timestamp = typeof rec.timestamp === "string" ? rec.timestamp : null;
  if (!status || !timestamp) throw new Error("Invalid onshape.run.json format.");
  return rec as OnshapeRunRecord;
}

export async function readOnshapeRunRecord(projectId: string, revision: number): Promise<OnshapeRunRecord | null> {
  const p = onshapeRunPath(projectId, revision);
  if (!(await exists(p))) return null;
  return parseOnshapeRunRecord(await readJson<unknown>(p));
}

export async function writeOnshapeRunRecord(projectId: string, revision: number, run: OnshapeRunRecord): Promise<void> {
  await atomicWriteFile(onshapeRunPath(projectId, revision), stableStringify(run));
}

async function archiveRunRecordIfPresent(projectId: string, revision: number): Promise<void> {
  const latestPath = onshapeRunPath(projectId, revision);
  if (!(await exists(latestPath))) return;
  const existing = await readJson<unknown>(latestPath);
  const record = parseOnshapeRunRecord(existing);
  await atomicWriteFile(onshapeRunArchivePath(projectId, revision, new Date().toISOString()), stableStringify(record));
}

async function readVariablesForRevision(projectId: string, revision: number): Promise<ReadVariablesResult> {
  const cadDir = onshapeCadDirForRevision(projectId, revision);
  const variablesPath = path.join(cadDir, "onshape.variables.json");
  const provenancePath = path.join(cadDir, "onshape.provenance.json");

  if (!(await exists(variablesPath))) {
    throw new Error(`Missing Onshape mapping file for revision ${formatRevisionId(revision)}.`);
  }

  const rawVariables = await readJson<unknown>(variablesPath);
  if (!rawVariables || typeof rawVariables !== "object" || Array.isArray(rawVariables)) {
    throw new Error("Invalid onshape.variables.json format.");
  }

  const variablesMap: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawVariables as Record<string, unknown>)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`Invalid variable name in onshape.variables.json: ${key}`);
    const num = Number(value);
    if (!Number.isFinite(num) || !Number.isInteger(num)) throw new Error(`Invalid variable value for ${key}.`);
    variablesMap[key] = num;
  }

  const unitsByVar: Record<string, VariableUnit | undefined> = {};
  if (await exists(provenancePath)) {
    const rawProv = await readJson<unknown>(provenancePath);
    if (Array.isArray(rawProv)) {
      for (const entry of rawProv as OnshapeVariableProvenance[]) {
        if (entry?.var && (entry.unit === "mm" || entry.unit === "count" || entry.unit === "flag" || entry.unit === "enum")) {
          unitsByVar[entry.var] = entry.unit;
        }
      }
    }
  }

  return { variablesMap, unitsByVar };
}

export async function cloneTemplateForRevision(args: {
  projectId: string;
  revId: string;
}): Promise<{ did: string; wid: string; eid: string; onshapeUrl: string }> {
  assertValidProjectId(args.projectId);
  if (!args.revId || typeof args.revId !== "string") throw new Error("Invalid revision id.");

  const client = new OnshapeClient();
  const template = readOnshapeTemplateRef();

  const templateElements = await fetchElements(client, template.did, template.wid);
  const templateElement = templateElements.find((e) => e.id === template.eid);
  if (!templateElement) {
    throw new Error("Configured template element was not found in template workspace.");
  }

  const documentName = `Craft ${args.projectId} ${args.revId}`;
  const copied = await postCopyWorkspace(client, template, documentName);

  const copiedElements = await fetchElements(client, copied.did, copied.wid);
  const sameNameAndType = copiedElements
    .filter(
      (e) =>
        e.name === templateElement.name &&
        normalizeElementType(e.elementType) === normalizeElementType(templateElement.elementType)
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const sameName = copiedElements.filter((e) => e.name === templateElement.name).sort((a, b) => a.id.localeCompare(b.id));
  const selected = sameNameAndType[0] ?? sameName[0] ?? null;

  if (!selected) {
    throw new Error("Unable to resolve target element in copied document.");
  }

  return {
    did: copied.did,
    wid: copied.wid,
    eid: selected.id,
    onshapeUrl: buildOnshapeDocumentUrl(copied.did, copied.wid, selected.id)
  };
}

async function readTemplateVariables(
  client: OnshapeClient,
  did: string,
  wid: string,
  eid: string
): Promise<{ path: string; variables: OnshapeVariable[] }> {
  const candidates = [
    `/api/v10/variables/d/${did}/w/${wid}/e/${eid}/variables`,
    `/api/v9/variables/d/${did}/w/${wid}/e/${eid}/variables`,
    `/api/v10/variables/d/${did}/w/${wid}/e/${eid}`,
    `/api/v9/variables/d/${did}/w/${wid}/e/${eid}`,
    `/api/variables/d/${did}/w/${wid}/e/${eid}/variables`,
    `/api/v10/partstudios/d/${did}/w/${wid}/e/${eid}/variables`,
    `/api/v9/partstudios/d/${did}/w/${wid}/e/${eid}/variables`,
    `/api/partstudios/d/${did}/w/${wid}/e/${eid}/variables`
  ];

  let lastDetails = "";
  for (const path of candidates) {
    try {
      const data = await client.requestJson<unknown>("GET", path);
      const variables = parseVariables(data);
      if (variables.length) return { path, variables };

      const shape = Array.isArray(data)
        ? `array(len=${data.length})`
        : data && typeof data === "object"
          ? `object(keys=${Object.keys(data as any).slice(0, 6).join(",") || "none"})`
          : typeof data;
      let first = "";
      if (Array.isArray(data) && data.length) {
        const v0 = data[0] as any;
        if (typeof v0 === "string") first = `first=string`;
        else if (Array.isArray(v0)) first = `first=array(len=${v0.length})`;
        else if (v0 && typeof v0 === "object") first = `firstKeys=${Object.keys(v0).slice(0, 6).join(",") || "none"}`;
        else first = `first=${typeof v0}`;
      }
      lastDetails = `GET ${path} -> ${shape}${first ? `; ${first}` : ""}`;
      continue;
    } catch (e) {
      if (e instanceof OnshapeApiError && (e.status === 404 || e.status === 405)) continue;
      throw e;
    }
  }

  throw new Error(
    `Template exposes no editable variables via Onshape API (tried ${candidates.length} endpoints; last: ${lastDetails || "none"}).`
  );
}

async function postVariablesPayload(
  client: OnshapeClient,
  pathCandidates: string[],
  payload: unknown[]
): Promise<void> {
  let lastError: unknown = null;
  for (const path of pathCandidates) {
    try {
      await client.requestJson<unknown>("POST", path, { body: payload });
      return;
    } catch (e) {
      lastError = e;
      if (e instanceof OnshapeApiError && e.status === 400) {
        try {
          await client.requestJson<unknown>("POST", path, { body: { variables: payload } });
          return;
        } catch (wrappedError) {
          lastError = wrappedError;
        }
      }
      if (e instanceof OnshapeApiError && (e.status === 404 || e.status === 405)) continue;
      throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to apply variables in Onshape.");
}

export async function applyVariables(args: {
  did: string;
  wid: string;
  eid: string;
  variablesMap: Record<string, number>;
  unitsByVar?: Record<string, VariableUnit | undefined>;
}): Promise<ApplyVariablesResult> {
  const client = new OnshapeClient();
  const listed = await readTemplateVariables(client, args.did, args.wid, args.eid);

  const templateByName = new Map<string, OnshapeVariable>();
  for (const variable of listed.variables) {
    templateByName.set(normalizeName(variable.name), variable);
  }

  const expectedNames = Object.keys(args.variablesMap).sort((a, b) => a.localeCompare(b));
  const missing = expectedNames.filter((name) => !templateByName.has(name));
  if (missing.length) {
    throw new Error(`Template is missing required variables: ${missing.slice(0, 10).join(", ")}.`);
  }

  const unitsByVar = args.unitsByVar ?? {};
  const payload = expectedNames.map((name) => {
    const templateVar = templateByName.get(name)!;
    const unit = inferUnit(name, unitsByVar);
    const value = args.variablesMap[name];
    return {
      name: templateVar.name,
      expression: formatExpression(value, unit),
      type: inferVariableType(unit, templateVar.type),
      ...(templateVar.description ? { description: templateVar.description } : {})
    };
  });

  const pathCandidates = [
    listed.path,
    `/api/v10/variables/d/${args.did}/w/${args.wid}/e/${args.eid}/variables`,
    `/api/v9/variables/d/${args.did}/w/${args.wid}/e/${args.eid}/variables`,
    `/api/v10/variables/d/${args.did}/w/${args.wid}/e/${args.eid}`,
    `/api/v9/variables/d/${args.did}/w/${args.wid}/e/${args.eid}`,
    `/api/variables/d/${args.did}/w/${args.wid}/e/${args.eid}/variables`,
    `/api/v10/partstudios/d/${args.did}/w/${args.wid}/e/${args.eid}/variables`,
    `/api/v9/partstudios/d/${args.did}/w/${args.wid}/e/${args.eid}/variables`,
    `/api/partstudios/d/${args.did}/w/${args.wid}/e/${args.eid}/variables`
  ].filter(
    (value, index, arr) => arr.indexOf(value) === index
  );
  await postVariablesPayload(client, pathCandidates, payload);

  return { count: payload.length };
}

function collectFeatureFailures(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const rec = payload as Record<string, unknown>;
  const states = rec.featureStates;
  if (!states || typeof states !== "object") return [];

  const failures: string[] = [];
  for (const [featureId, raw] of Object.entries(states as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const status = (raw as any).featureStatus;
    const message = (raw as any).message;
    if (typeof status !== "string") continue;
    if (status === "OK" || status === "SUPPRESSED") continue;
    const detail = typeof message === "string" && message.trim() ? `: ${sanitizeMessage(message)}` : "";
    failures.push(`${featureId}=${status}${detail}`);
  }
  return failures;
}

export async function regeneratePartStudio(args: { did: string; wid: string; eid: string }): Promise<void> {
  const client = new OnshapeClient();
  await requestJsonFallback<unknown>(client, "POST", [
    `/api/v10/partstudios/d/${args.did}/w/${args.wid}/e/${args.eid}/features/rollback`,
    `/api/v9/partstudios/d/${args.did}/w/${args.wid}/e/${args.eid}/features/rollback`,
    `/api/partstudios/d/${args.did}/w/${args.wid}/e/${args.eid}/features/rollback`
  ], {
    body: { rollbackIndex: -1 }
  });

  const { data } = await requestJsonFallback<unknown>(client, "GET", [
    `/api/v10/partstudios/d/${args.did}/w/${args.wid}/e/${args.eid}/features`,
    `/api/v9/partstudios/d/${args.did}/w/${args.wid}/e/${args.eid}/features`,
    `/api/partstudios/d/${args.did}/w/${args.wid}/e/${args.eid}/features`
  ], {
    query: { rollbackBarIndex: -1 }
  });

  const failures = collectFeatureFailures(data);
  if (failures.length) {
    throw new Error(`Onshape regeneration reported feature failures: ${failures.slice(0, 5).join("; ")}.`);
  }
}

export async function generateOnshapeRunForRevision(args: {
  projectId: string;
  revision: number;
  force?: boolean;
}): Promise<GenerateOnshapeRunResult> {
  assertValidProjectId(args.projectId);
  if (!Number.isInteger(args.revision) || args.revision < 1) throw new Error("Invalid revision id.");

  const force = args.force === true;
  const existingRun = await readOnshapeRunRecord(args.projectId, args.revision);
  if (existingRun?.status === "SUCCESS" && !force) {
    return { run: existingRun, reused: true };
  }
  if (force && existingRun) {
    await archiveRunRecordIfPresent(args.projectId, args.revision);
  }

  const run = runRecordBase(defaultRunTemplate());
  let step: OnshapeRunError["step"] = "config";
  let variables: ReadVariablesResult | null = null;

  try {
    const template = readOnshapeTemplateRef();
    run.template = template;

    step = "load_variables";
    variables = await readVariablesForRevision(args.projectId, args.revision);

    step = "clone_template";
    const cloned = await cloneTemplateForRevision({
      projectId: args.projectId,
      revId: formatRevisionId(args.revision)
    });
    run.created = { did: cloned.did, wid: cloned.wid, eid: cloned.eid };
    run.onshapeUrl = cloned.onshapeUrl;

    step = "apply_variables";
    const applyClient = new OnshapeClient();
    const createdElements = await fetchElements(applyClient, cloned.did, cloned.wid);
    const variableStudio = selectVariableStudioElement(createdElements);
    const variablesTargetEid = variableStudio?.id ?? cloned.eid;
    const applied = await applyVariables({
      did: cloned.did,
      wid: cloned.wid,
      eid: variablesTargetEid,
      variablesMap: variables.variablesMap,
      unitsByVar: variables.unitsByVar
    });
    run.variablesApplied.count = applied.count;

    step = "regenerate";
    await regeneratePartStudio({ did: cloned.did, wid: cloned.wid, eid: cloned.eid });

    run.status = "SUCCESS";
    run.errors = [];
    await writeOnshapeRunRecord(args.projectId, args.revision, run);
    return { run, reused: false };
  } catch (e) {
    run.status = "FAILED";
    run.errors = [{ step, message: errorToMessage(e) }];
    if (step === "load_variables" && variables) {
      run.variablesApplied.count = Object.keys(variables.variablesMap).length;
    }
    await writeOnshapeRunRecord(args.projectId, args.revision, run);
    return { run, reused: false };
  }
}

type GenerateOnshapeExportResult = {
  export: OnshapeExportRecord;
  reused: boolean;
};

type TranslationStatus = {
  requestState?: string;
  resultElementIds?: string[];
  failureReason?: string;
};

type DrawingFormat = {
  name: string;
  description?: string;
  type?: string;
};

function exportRecordBase(): OnshapeExportRecord {
  return {
    status: "FAILED",
    timestamp: new Date().toISOString(),
    source: { did: null, wid: null, eid: null, onshapeUrl: null },
    exports: {
      partstudio_step: {
        elementId: null,
        elementName: null,
        translationId: null,
        resultElementId: null,
        fileName: null,
        bytes: 0
      },
      drawing_pdf: {
        elementId: null,
        elementName: null,
        translationId: null,
        resultElementId: null,
        fileName: null,
        bytes: 0
      }
    },
    errors: []
  };
}

function sanitizeSlug(value: string): string {
  const ascii = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return ascii.slice(0, 60);
}

function exportDirForRevision(projectId: string, revision: number): string {
  return path.join(onshapeCadDirForRevision(projectId, revision), "exports");
}

export function onshapeExportPath(projectId: string, revision: number): string {
  return path.join(onshapeCadDirForRevision(projectId, revision), "onshape.export.json");
}

function onshapeExportArchivePath(projectId: string, revision: number, timestampIso: string): string {
  const safeTs = timestampIso.replace(/[:.]/g, "-");
  return path.join(onshapeCadDirForRevision(projectId, revision), `onshape.export.${safeTs}.json`);
}

function parseOnshapeExportRecord(value: unknown): OnshapeExportRecord {
  if (!value || typeof value !== "object") throw new Error("Invalid onshape.export.json format.");
  const rec = value as Record<string, unknown>;
  const status = rec.status === "SUCCESS" || rec.status === "FAILED" ? rec.status : null;
  const timestamp = typeof rec.timestamp === "string" ? rec.timestamp : null;
  if (!status || !timestamp) throw new Error("Invalid onshape.export.json format.");
  return rec as OnshapeExportRecord;
}

export async function readOnshapeExportRecord(projectId: string, revision: number): Promise<OnshapeExportRecord | null> {
  const p = onshapeExportPath(projectId, revision);
  if (!(await exists(p))) return null;
  return parseOnshapeExportRecord(await readJson<unknown>(p));
}

async function writeOnshapeExportRecord(projectId: string, revision: number, record: OnshapeExportRecord): Promise<void> {
  await atomicWriteFile(onshapeExportPath(projectId, revision), stableStringify(record));
}

async function archiveExportRecordIfPresent(projectId: string, revision: number): Promise<void> {
  const latestPath = onshapeExportPath(projectId, revision);
  if (!(await exists(latestPath))) return;
  const existing = await readJson<unknown>(latestPath);
  const record = parseOnshapeExportRecord(existing);
  await atomicWriteFile(onshapeExportArchivePath(projectId, revision, new Date().toISOString()), stableStringify(record));
}

async function fetchDrawingFormats(
  client: OnshapeClient,
  did: string,
  wid: string,
  eid: string
): Promise<DrawingFormat[]> {
  const { data } = await requestJsonFallback<unknown>(client, "GET", [
    `/api/v10/drawings/d/${did}/w/${wid}/e/${eid}/translationformats`,
    `/api/v9/drawings/d/${did}/w/${wid}/e/${eid}/translationformats`,
    `/api/v6/drawings/d/${did}/w/${wid}/e/${eid}/translationformats`
  ]);
  const rawList = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as any).formats)
      ? ((data as any).formats as unknown[])
      : data && typeof data === "object" && Array.isArray((data as any).items)
        ? ((data as any).items as unknown[])
        : [];
  const out: DrawingFormat[] = [];
  for (const entry of rawList) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : "";
    if (!name) continue;
    out.push({
      name,
      description: typeof rec.description === "string" ? rec.description : undefined,
      type: typeof rec.type === "string" ? rec.type : undefined
    });
  }
  return out;
}

function pickPdfFormat(formats: DrawingFormat[]): DrawingFormat | null {
  const pdf = formats.filter((f) => f.name.toUpperCase().includes("PDF"));
  if (!pdf.length) return null;
  pdf.sort((a, b) => a.name.localeCompare(b.name));
  return pdf[0];
}

function parseTranslationId(payload: unknown): string {
  if (!payload || typeof payload !== "object") throw new Error("Invalid Onshape translation response.");
  const rec = payload as Record<string, unknown>;
  const id =
    (typeof rec.id === "string" && rec.id) ||
    (typeof rec.translationId === "string" && rec.translationId) ||
    (typeof rec.requestId === "string" && rec.requestId) ||
    "";
  if (!id) throw new Error("Onshape translation response missing id.");
  return id;
}

function parseTranslationStatus(payload: unknown): TranslationStatus {
  if (!payload || typeof payload !== "object") return {};
  const rec = payload as Record<string, unknown>;
  const requestState = typeof rec.requestState === "string" ? rec.requestState : undefined;
  const failureReason = typeof rec.failureReason === "string" ? rec.failureReason : undefined;
  const resultElementIds = Array.isArray(rec.resultElementIds)
    ? rec.resultElementIds.filter((id) => typeof id === "string")
    : undefined;
  return { requestState, resultElementIds, failureReason };
}

async function pollTranslation(client: OnshapeClient, translationId: string): Promise<string> {
  const pollPaths = [
    `/api/v10/translations/${translationId}`,
    `/api/v9/translations/${translationId}`,
    `/api/v6/translations/${translationId}`,
    `/api/translations/${translationId}`
  ];

  const delays = [500, 1000, 1500, 2500, 4000, 6000, 8000];
  let lastState: TranslationStatus = {};

  for (const delay of delays) {
    const { data } = await requestJsonFallback<unknown>(client, "GET", pollPaths);
    const status = parseTranslationStatus(data);
    lastState = status;
    const state = (status.requestState ?? "").toUpperCase();
    if (state === "DONE") {
      const result = status.resultElementIds?.[0];
      if (!result) throw new Error("Translation finished without a result element id.");
      return result;
    }
    if (state === "FAILED" || state === "FAILURE") {
      throw new Error(status.failureReason ? `Translation failed: ${status.failureReason}` : "Translation failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const finalState = (lastState.requestState ?? "").toUpperCase();
  throw new Error(finalState ? `Translation timed out (state=${finalState}).` : "Translation timed out.");
}

async function requestBinary(
  client: OnshapeClient,
  paths: string[]
): Promise<Response> {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await client.request("GET", path, { headers: { Accept: "application/octet-stream" } });
    } catch (e) {
      lastError = e;
      if (e instanceof OnshapeApiError && (e.status === 404 || e.status === 405)) continue;
      throw e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Onshape download failed.");
}

function parseContentDispositionFileName(value: string | null): string | null {
  if (!value) return null;
  const match = /filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i.exec(value);
  const raw = match ? (match[1] ?? match[2]) : null;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

async function downloadBlobElement(
  client: OnshapeClient,
  did: string,
  wid: string,
  eid: string
): Promise<{ bytes: Uint8Array; fileNameFromHeader: string | null }> {
  const res = await requestBinary(client, [
    `/api/v10/blobelements/d/${did}/w/${wid}/e/${eid}`,
    `/api/v9/blobelements/d/${did}/w/${wid}/e/${eid}`,
    `/api/v6/blobelements/d/${did}/w/${wid}/e/${eid}`,
    `/api/blobelements/d/${did}/w/${wid}/e/${eid}`
  ]);
  const buffer = new Uint8Array(await res.arrayBuffer());
  const fileName = parseContentDispositionFileName(res.headers.get("content-disposition"));
  return { bytes: buffer, fileNameFromHeader: fileName };
}

async function exportPartStudioStep(args: {
  did: string;
  wid: string;
  eid: string;
}): Promise<{ translationId: string; resultElementId: string }> {
  const client = new OnshapeClient();
  const { data } = await requestJsonFallback<unknown>(client, "POST", [
    `/api/v10/partstudios/d/${args.did}/w/${args.wid}/e/${args.eid}/export/step`,
    `/api/v9/partstudios/d/${args.did}/w/${args.wid}/e/${args.eid}/export/step`,
    `/api/v6/partstudios/d/${args.did}/w/${args.wid}/e/${args.eid}/export/step`
  ], {
    body: { storeInDocument: true }
  });
  const translationId = parseTranslationId(data);
  const resultElementId = await pollTranslation(client, translationId);
  return { translationId, resultElementId };
}

async function exportDrawingPdf(args: {
  did: string;
  wid: string;
  eid: string;
}): Promise<{ translationId: string; resultElementId: string; formatName: string }> {
  const client = new OnshapeClient();
  const formats = await fetchDrawingFormats(client, args.did, args.wid, args.eid);
  const pdf = pickPdfFormat(formats);
  if (!pdf) throw new Error("No PDF translation format available for drawing.");

  const { data } = await requestJsonFallback<unknown>(client, "POST", [
    `/api/v10/drawings/d/${args.did}/w/${args.wid}/e/${args.eid}/translations`,
    `/api/v9/drawings/d/${args.did}/w/${args.wid}/e/${args.eid}/translations`,
    `/api/v6/drawings/d/${args.did}/w/${args.wid}/e/${args.eid}/translations`
  ], {
    body: { formatName: pdf.name, storeInDocument: true }
  });
  const translationId = parseTranslationId(data);
  const resultElementId = await pollTranslation(client, translationId);
  return { translationId, resultElementId, formatName: pdf.name };
}

function selectDrawingElement(elements: OnshapeElement[]): OnshapeElement | null {
  const drawings = elements.filter((e) => normalizeElementType(e.elementType).includes("DRAW"));
  if (!drawings.length) return null;
  drawings.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return drawings[0];
}

function resolveElementName(elements: OnshapeElement[], elementId: string): string | null {
  const match = elements.find((e) => e.id === elementId);
  return match ? match.name : null;
}

export async function generateOnshapeExportsForRevision(args: {
  projectId: string;
  revision: number;
  force?: boolean;
}): Promise<GenerateOnshapeExportResult> {
  assertValidProjectId(args.projectId);
  if (!Number.isInteger(args.revision) || args.revision < 1) throw new Error("Invalid revision id.");

  const force = args.force === true;
  const existing = await readOnshapeExportRecord(args.projectId, args.revision);
  if (existing?.status === "SUCCESS" && !force) {
    return { export: existing, reused: true };
  }
  if (force && existing) {
    await archiveExportRecordIfPresent(args.projectId, args.revision);
  }

  const record = exportRecordBase();
  let step: OnshapeExportError["step"] = "config";

  try {
    const run = await readOnshapeRunRecord(args.projectId, args.revision);
    if (!run || run.status !== "SUCCESS") {
      throw new Error("Onshape generation has not succeeded for this revision.");
    }
    record.source = {
      did: run.created.did,
      wid: run.created.wid,
      eid: run.created.eid,
      onshapeUrl: run.onshapeUrl
    };

    if (!run.created.did || !run.created.wid || !run.created.eid) {
      throw new Error("Onshape run record missing created document identifiers.");
    }

    step = "resolve_elements";
    const client = new OnshapeClient();
    const elements = await fetchElements(client, run.created.did, run.created.wid);
    const partStudioName = resolveElementName(elements, run.created.eid);
    if (!partStudioName) throw new Error("Part Studio element not found in created document.");

    const drawingElement = selectDrawingElement(elements);
    if (!drawingElement) throw new Error("No drawing element found in created document.");

    const exportsDir = exportDirForRevision(args.projectId, args.revision);

    step = "partstudio_step";
    record.exports.partstudio_step = {
      elementId: run.created.eid,
      elementName: partStudioName,
      translationId: null,
      resultElementId: null,
      fileName: null,
      bytes: 0
    };
    const partTranslation = await exportPartStudioStep({
      did: run.created.did,
      wid: run.created.wid,
      eid: run.created.eid
    });
    record.exports.partstudio_step.translationId = partTranslation.translationId;
    record.exports.partstudio_step.resultElementId = partTranslation.resultElementId;

    step = "download";
    {
      const download = await downloadBlobElement(client, run.created.did, run.created.wid, partTranslation.resultElementId);
      const slug = sanitizeSlug(partStudioName) || run.created.eid.slice(0, 8);
      const fileName = `partstudio-${slug}.step`;
      const filePath = path.join(exportsDir, fileName);
      await atomicWriteFile(filePath, download.bytes);
      record.exports.partstudio_step.fileName = fileName;
      record.exports.partstudio_step.bytes = download.bytes.length;
    }

    step = "drawing_pdf";
    record.exports.drawing_pdf = {
      elementId: drawingElement.id,
      elementName: drawingElement.name,
      translationId: null,
      resultElementId: null,
      fileName: null,
      bytes: 0
    };
    const drawingTranslation = await exportDrawingPdf({
      did: run.created.did,
      wid: run.created.wid,
      eid: drawingElement.id
    });
    record.exports.drawing_pdf.translationId = drawingTranslation.translationId;
    record.exports.drawing_pdf.resultElementId = drawingTranslation.resultElementId;

    step = "download";
    {
      const download = await downloadBlobElement(client, run.created.did, run.created.wid, drawingTranslation.resultElementId);
      const slug = sanitizeSlug(drawingElement.name) || drawingElement.id.slice(0, 8);
      const fileName = `drawing-${slug}.pdf`;
      const filePath = path.join(exportsDir, fileName);
      await atomicWriteFile(filePath, download.bytes);
      record.exports.drawing_pdf.fileName = fileName;
      record.exports.drawing_pdf.bytes = download.bytes.length;
    }

    record.status = "SUCCESS";
    record.errors = [];
    await writeOnshapeExportRecord(args.projectId, args.revision, record);
    return { export: record, reused: false };
  } catch (e) {
    record.status = "FAILED";
    record.errors = [{ step, message: errorToMessage(e) }];
    await writeOnshapeExportRecord(args.projectId, args.revision, record);
    return { export: record, reused: false };
  }
}
