"use client";

import { dibQuestionSetV0_1, type DibQuestion } from "@/dib/questionSet.v0_1";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DibDraft = Record<string, unknown>;

type DraftResponse = {
  draft: DibDraft;
};

type ConfirmResponse = {
  ok?: boolean;
  error?: string;
  errors?: { path: string; message: string }[];
  revision?: number;
};

function getByPointer(obj: any, pointer: string): any {
  if (!pointer.startsWith("/")) return undefined;
  const parts = pointer.split("/").slice(1).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as any)[p];
  }
  return cur;
}

function setByPointer(obj: any, pointer: string, value: any): any {
  if (!pointer.startsWith("/")) return obj;
  const parts = pointer.split("/").slice(1).map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  const root = { ...(obj ?? {}) };
  let cur: any = root;
  for (let i = 0; i < parts.length; i++) {
    const key = parts[i]!;
    if (i === parts.length - 1) {
      cur[key] = value;
    } else {
      const next = cur[key];
      cur[key] = typeof next === "object" && next != null && !Array.isArray(next) ? { ...next } : {};
      cur = cur[key];
    }
  }
  return root;
}

function questionApplies(question: DibQuestion, draft: DibDraft): boolean {
  if (!question.depends_on) return true;
  const v = getByPointer(draft, question.depends_on.path);
  if ("equals" in question.depends_on) return v === (question.depends_on as any).equals;
  if ("gte" in question.depends_on) return typeof v === "number" && v >= (question.depends_on as any).gte;
  return true;
}

function formatAnswer(question: DibQuestion, value: unknown): string {
  if (value == null) return "";
  switch (question.kind) {
    case "boolean":
    case "confirm":
      return value ? "Yes" : "No";
    default:
      return String(value);
  }
}

export function DibChat({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<DibDraft>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ path: string; message: string }[]>([]);

  const applicableQuestions = useMemo(
    () => dibQuestionSetV0_1.questions.filter((q) => questionApplies(q, draft)),
    [draft]
  );

  const firstUnansweredIndex = useMemo(() => {
    return applicableQuestions.findIndex((q) => getByPointer(draft, q.store_path) === undefined);
  }, [applicableQuestions, draft]);

  const currentIndex = firstUnansweredIndex === -1 ? applicableQuestions.length - 1 : firstUnansweredIndex;
  const currentQuestion = applicableQuestions[currentIndex];

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/projects/${projectId}/dib/draft`);
        const json = (await res.json()) as DraftResponse & { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Failed to load DIB draft");
        if (!cancelled) setDraft(json.draft ?? {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function persist(nextDraft: DibDraft) {
    const res = await fetch(`/api/projects/${projectId}/dib/draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: nextDraft })
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed to save draft");
  }

  async function answer(question: DibQuestion, value: unknown) {
    setBusy(true);
    setError(null);
    setValidationErrors([]);
    const nextDraft = setByPointer(draft, question.store_path, value);
    setDraft(nextDraft);
    try {
      await persist(nextDraft);
      if (question.id === "confirm_dib_authoritative" && value === true) {
        const res = await fetch(`/api/projects/${projectId}/dib/confirm`, { method: "POST" });
        const json = (await res.json()) as ConfirmResponse;
        if (!res.ok || !json.ok) {
          setValidationErrors(json.errors ?? []);
          throw new Error(json.error ?? "DIB validation failed");
        }
        router.replace(`/projects/${projectId}/review`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  function goTo(index: number) {
    const q = applicableQuestions[index];
    if (!q) return;
    setValidationErrors([]);
    setError(null);
    // If we "go back", clear current and later answers by removing values at their store paths.
    let nextDraft: DibDraft = { ...(draft ?? {}) };
    for (let i = index; i < applicableQuestions.length; i++) {
      const qi = applicableQuestions[i]!;
      if (getByPointer(nextDraft, qi.store_path) === undefined) continue;
      nextDraft = setByPointer(nextDraft, qi.store_path, undefined);
    }
    setDraft(nextDraft);
    void persist(nextDraft);
  }

  return (
    <div>
      <h1 className="h1">Design Intent Brief (DIB)</h1>
      <p className="p">
        One question at a time. You can go back and edit. The DIB becomes authoritative only after you confirm it.
      </p>

      {error ? (
        <div className="alert alertErr" style={{ marginBottom: 12 }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {validationErrors.length ? (
        <div className="alert alertErr" style={{ marginBottom: 12 }}>
          <strong>Fix these before confirming:</strong>
          <ul style={{ margin: "8px 0 0 18px", color: "var(--text)" }}>
            {validationErrors.map((e, idx) => (
              <li key={`${e.path}-${idx}`}>
                <span className="mono">{e.path}</span>: {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="panel" style={{ padding: 14, marginBottom: 12 }}>
        <div className="mono" style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>
          Question {Math.min(currentIndex + 1, applicableQuestions.length)} of {applicableQuestions.length}
        </div>

        {currentQuestion ? (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>{currentQuestion.prompt}</div>
            <QuestionInput
              question={currentQuestion}
              busy={busy}
              onAnswer={(v) => void answer(currentQuestion, v)}
            />
          </div>
        ) : (
          <div className="alert">
            <strong>No questions.</strong>
          </div>
        )}

        <div className="row" style={{ justifyContent: "space-between" }}>
          <a className="btn" href={`/projects/${projectId}`}>
            Back to Project
          </a>
          <a className="btn" href={`/projects/${projectId}/review`}>
            Review PSPEC
          </a>
        </div>
      </div>

      <div className="panel" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Answers (click to edit)</div>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          {applicableQuestions
            .map((q, idx) => {
              const v = getByPointer(draft, q.store_path);
              if (v === undefined) return null;
              return (
                <button
                  key={q.id}
                  className="panel"
                  style={{ textAlign: "left", cursor: busy ? "not-allowed" : "pointer" }}
                  onClick={() => {
                    if (!busy) goTo(idx);
                  }}
                  disabled={busy}
                >
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{q.prompt}</div>
                  <div className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>
                    {formatAnswer(q, v)}
                  </div>
                </button>
              );
            })
            .filter(Boolean)}
        </div>
      </div>
    </div>
  );
}

function QuestionInput({
  question,
  busy,
  onAnswer
}: {
  question: DibQuestion;
  busy: boolean;
  onAnswer: (value: unknown) => void;
}) {
  const [text, setText] = useState("");

  useEffect(() => {
    setText("");
  }, [question.id]);

  if (question.kind === "confirm" || question.kind === "boolean") {
    return (
      <div className="row">
        <button className="btn btnOk" disabled={busy} onClick={() => onAnswer(true)}>
          Yes
        </button>
        <button className="btn btnDanger" disabled={busy} onClick={() => onAnswer(false)}>
          No
        </button>
      </div>
    );
  }

  if (question.kind === "enum") {
    return (
      <div>
        <select
          className="select"
          disabled={busy}
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
        >
          <option value="" disabled>
            Select…
          </option>
          {question.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <div style={{ height: 10 }} />
        <div className="row">
          {question.default !== undefined ? (
            <button className="btn" disabled={busy} onClick={() => onAnswer(question.default)}>
              Use default ({String(question.default)})
            </button>
          ) : null}
          <button className="btn btnPrimary" disabled={busy || !text} onClick={() => onAnswer(text)}>
            Next
          </button>
        </div>
      </div>
    );
  }

  const isNumber = question.kind === "number_mm" || question.kind === "number" || question.kind === "integer";

  return (
    <div>
      <input
        className="input"
        disabled={busy}
        inputMode={isNumber ? "decimal" : "text"}
        placeholder={question.default !== undefined ? `Default: ${question.default}` : ""}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      <div style={{ height: 10 }} />
      <div className="row">
        {question.default !== undefined ? (
          <button className="btn" disabled={busy} onClick={() => onAnswer(question.default)}>
            Use default ({String(question.default)})
          </button>
        ) : null}
        <button
          className="btn btnPrimary"
          disabled={busy || (!text && question.default === undefined)}
          onClick={() => {
            if (!text && question.default !== undefined) return onAnswer(question.default);
            if (question.kind === "integer") return onAnswer(parseInt(text, 10));
            if (question.kind === "number_mm" || question.kind === "number") return onAnswer(parseFloat(text));
            return onAnswer(text);
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
