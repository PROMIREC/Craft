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
  const rawList = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as any).variables)
      ? ((value as any).variables as unknown[])
      : [];

  const out: OnshapeVariable[] = [];
  for (const entry of rawList) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : "";
    if (!name) continue;
    const type = typeof rec.type === "string" ? rec.type : undefined;
    const description = typeof rec.description === "string" ? rec.description : undefined;
    out.push({ name, type, description });
  }
  return out;
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
  const payload = { newName };

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
  const { path, data } = await requestJsonFallback<unknown>(client, "GET", [
    `/api/v10/variables/d/${did}/w/${wid}/e/${eid}/variables`,
    `/api/v9/variables/d/${did}/w/${wid}/e/${eid}/variables`,
    `/api/variables/d/${did}/w/${wid}/e/${eid}/variables`
  ]);
  const variables = parseVariables(data);
  if (!variables.length) throw new Error("Template exposes no editable variables via Onshape API.");
  return { path, variables };
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

  const pathCandidates = [listed.path, `/api/v10/variables/d/${args.did}/w/${args.wid}/e/${args.eid}/variables`, `/api/v9/variables/d/${args.did}/w/${args.wid}/e/${args.eid}/variables`, `/api/variables/d/${args.did}/w/${args.wid}/e/${args.eid}/variables`].filter(
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
    const applied = await applyVariables({
      did: cloned.did,
      wid: cloned.wid,
      eid: cloned.eid,
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
