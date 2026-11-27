import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard } from "@/components/common/GlassCard";
import { GlowButton } from "@/components/common/GlowButton";
import { LoadingSkeleton } from "@/components/common/States";
import {
  useAssignBankQuestions,
  useBankQuestions,
  useCreateBankQuestion,
  useDeleteBankQuestion,
  useImportQuestions,
  useInstructorExams,
  useUpdateBankQuestion,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import { CheckSquare, Pencil, Plus, Trash2, Upload, X } from "lucide-react";

export const Route = createFileRoute("/bank")({
  head: () => ({ meta: [{ title: "Question Bank · Nigran 360" }] }),
  component: BankPage,
});

type QType = "mcq" | "multiple_select" | "written";
type Option = { option_id?: string; option_text: string; is_correct: boolean };
type Draft = {
  question_id?: string;
  question_text: string;
  question_type: QType;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  marks: number;
  marking_scheme: string;
  options: Option[];
};

const TYPE_LABEL: Record<QType, string> = {
  mcq: "Single-answer MCQ",
  multiple_select: "Multiple-select",
  written: "Written response",
};

const emptyDraft = (): Draft => ({
  question_text: "",
  question_type: "mcq",
  category: "",
  difficulty: "medium",
  marks: 1,
  marking_scheme: "all_or_nothing",
  options: [
    { option_text: "", is_correct: true },
    { option_text: "", is_correct: false },
    { option_text: "", is_correct: false },
    { option_text: "", is_correct: false },
  ],
});

const inputCls =
  "w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary";

const CSV_SAMPLE = `question_text,question_type,options,correct,marks,difficulty,category,marking_scheme
What is 2 + 2?,mcq,3|4|5,B,1,easy,Arithmetic,
Select the prime numbers,multiple_select,2|4|5|9,A|C,2,medium,Number theory,partial
Explain recursion with an example,written,,,5,hard,Programming,`;

function BankPage() {
  const [filters, setFilters] = useState({ question_type: "", difficulty: "", category: "", search: "" });
  const activeFilters = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) as Record<string, string>,
    [filters],
  );
  const bank = useBankQuestions(activeFilters);
  const exams = useInstructorExams();
  const createQ = useCreateBankQuestion();
  const updateQ = useUpdateBankQuestion();
  const deleteQ = useDeleteBankQuestion();
  const importQ = useImportQuestions();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [targetExam, setTargetExam] = useState("");
  const assign = useAssignBankQuestions(targetExam);
  const [assignMsg, setAssignMsg] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState("");

  const questions: any[] = bank.data?.questions ?? [];
  const categories: string[] = bank.data?.categories ?? [];
  const draftExams = (exams.data ?? []).filter((e) => (e.status ?? "draft") === "draft");

  function setType(t: QType) {
    if (!draft) return;
    let options = draft.options.length ? draft.options : emptyDraft().options;
    if (t === "mcq") {
      const first = Math.max(0, options.findIndex((o) => o.is_correct));
      options = options.map((o, i) => ({ ...o, is_correct: i === first }));
    }
    setDraft({ ...draft, question_type: t, options: t === "written" ? [] : options });
  }

  function setOption(index: number, patch: Partial<Option>) {
    if (!draft) return;
    const options = draft.options.map((o, i) => {
      if (i === index) return { ...o, ...patch };
      if (patch.is_correct && draft.question_type === "mcq") return { ...o, is_correct: false };
      return o;
    });
    setDraft({ ...draft, options });
  }

  async function save() {
    if (!draft) return;
    setFormError("");
    const payload = {
      ...draft,
      options: draft.question_type === "written" ? [] : draft.options.filter((o) => o.option_text.trim()),
      marking_scheme: draft.question_type === "multiple_select" ? draft.marking_scheme : "",
    };
    try {
      if (draft.question_id) await updateQ.mutateAsync({ id: draft.question_id, data: payload });
      else await createQ.mutateAsync(payload);
      setDraft(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save the question.");
    }
  }

  async function assignSelected() {
    setAssignMsg("");
    if (!targetExam || !selected.length) return;
    try {
      const res = await assign.mutateAsync(selected);
      setAssignMsg(`Copied ${res.added} question(s) into the exam. Later bank edits will not change that exam.`);
      setSelected([]);
    } catch (err) {
      setAssignMsg(err instanceof Error ? err.message : "Assignment failed.");
    }
  }

  async function runImport(commit: boolean) {
    setImportError("");
    try {
      const res = await importQ.mutateAsync({ content: importText, fileFormat: importFormat, commit });
      setImportResult(res);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed.");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setImportFormat(file.name.toLowerCase().endsWith(".json") ? "json" : "csv");
    setImportText(await file.text());
    setImportResult(null);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Question Bank</h1>
            <p className="text-sm text-muted-foreground">Reusable questions for your institution. Assigning copies a question into an exam.</p>
          </div>
          <div className="flex gap-2">
            <GlowButton size="sm" variant="ghost" onClick={() => { setShowImport((v) => !v); setImportResult(null); }}>
              <Upload aria-hidden /> Bulk import
            </GlowButton>
            <GlowButton size="sm" onClick={() => { setDraft(emptyDraft()); setFormError(""); }}>
              <Plus aria-hidden /> New question
            </GlowButton>
          </div>
        </div>

        {showImport && (
          <GlassCard className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold text-foreground">Import questions (CSV or JSON)</h2>
              <input type="file" accept=".csv,.json" onChange={(e) => onFile(e.target.files?.[0])} className="text-xs" aria-label="Choose import file" />
              <select value={importFormat} onChange={(e) => setImportFormat(e.target.value as "csv" | "json")} className={cn(inputCls, "w-auto")} aria-label="Import format">
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
              <button type="button" className="text-xs text-primary underline" onClick={() => { setImportFormat("csv"); setImportText(CSV_SAMPLE); }}>
                Insert sample CSV
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Columns: question_text, question_type (mcq | multiple_select | written), options separated by "|", correct as letters (A|C),
              marks, difficulty, category, marking_scheme (all_or_nothing | partial). Nothing is saved unless every row is valid.
            </p>
            <textarea value={importText} onChange={(e) => { setImportText(e.target.value); setImportResult(null); }} rows={6} className={cn(inputCls, "font-mono text-xs")} aria-label="Import content" />
            <div className="flex gap-2">
              <GlowButton size="sm" variant="outline" disabled={!importText.trim() || importQ.isPending} onClick={() => runImport(false)}>Validate</GlowButton>
              <GlowButton size="sm" disabled={!importResult || importResult.summary.invalid > 0 || importResult.summary.committed || importQ.isPending} onClick={() => runImport(true)}>
                Import {importResult?.summary.valid ?? 0} question(s)
              </GlowButton>
            </div>
            {importError && <p role="alert" className="text-sm text-destructive">{importError}</p>}
            {importResult && (
              <div className="space-y-2 text-sm">
                <p className={importResult.summary.invalid ? "text-amber-300" : "text-emerald-300"}>
                  {importResult.summary.rows} rows · {importResult.summary.valid} valid · {importResult.summary.invalid} with errors
                  {importResult.summary.committed && " · imported"}
                </p>
                <ul className="max-h-48 space-y-1 overflow-auto text-xs">
                  {importResult.rows.filter((r: any) => r.errors.length).map((r: any) => (
                    <li key={r.row} className="text-destructive">Row {r.row} ({r.question_text || "blank"}): {r.errors.join(" ")}</li>
                  ))}
                </ul>
              </div>
            )}
          </GlassCard>
        )}

        <GlassCard className="grid gap-2 p-4 sm:grid-cols-4">
          <input className={inputCls} placeholder="Search text…" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} aria-label="Search questions" />
          <select className={inputCls} value={filters.question_type} onChange={(e) => setFilters({ ...filters, question_type: e.target.value })} aria-label="Filter by type">
            <option value="">All types</option>
            {(Object.keys(TYPE_LABEL) as QType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          <select className={inputCls} value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })} aria-label="Filter by difficulty">
            <option value="">All difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <select className={inputCls} value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} aria-label="Filter by category">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </GlassCard>

        {selected.length > 0 && (
          <GlassCard className="flex flex-wrap items-center gap-3 p-4">
            <CheckSquare className="h-4 w-4 text-primary" aria-hidden />
            <span className="text-sm text-foreground">{selected.length} selected</span>
            <select className={cn(inputCls, "w-auto")} value={targetExam} onChange={(e) => setTargetExam(e.target.value)} aria-label="Target exam">
              <option value="">Choose a draft exam…</option>
              {draftExams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
            <GlowButton size="sm" disabled={!targetExam || assign.isPending} onClick={assignSelected}>Add to exam</GlowButton>
            <button className="text-xs text-muted-foreground underline" onClick={() => setSelected([])}>Clear</button>
            {!draftExams.length && <span className="text-xs text-muted-foreground">Only draft exams can receive questions.</span>}
          </GlassCard>
        )}
        {assignMsg && <p role="status" className="text-sm text-muted-foreground">{assignMsg}</p>}

        {bank.isLoading && <LoadingSkeleton />}
        {bank.isError && <p role="alert" className="text-sm text-destructive">{(bank.error as Error).message}</p>}
        {!bank.isLoading && questions.length === 0 && (
          <GlassCard className="p-8 text-center text-muted-foreground">No questions match. Create one or import a file.</GlassCard>
        )}
        <div className="space-y-2">
          {questions.map((q) => (
            <GlassCard key={q.question_id} className="flex items-start gap-3 p-4">
              <input
                type="checkbox"
                className="mt-1"
                checked={selected.includes(q.question_id)}
                onChange={(e) => setSelected(e.target.checked ? [...selected, q.question_id] : selected.filter((id) => id !== q.question_id))}
                aria-label={`Select question ${q.question_text}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">{q.question_text}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">{TYPE_LABEL[q.question_type as QType] ?? q.question_type}</span>
                  <span>{q.marks} mark{q.marks === 1 ? "" : "s"}</span>
                  <span className="capitalize">{q.difficulty}</span>
                  {q.category && <span>{q.category}</span>}
                  {q.question_type === "multiple_select" && <span>Marking: {q.marking_scheme === "partial" ? "partial credit" : "all or nothing"}</span>}
                </div>
                {q.options?.length > 0 && (
                  <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
                    {q.options.map((o: any, i: number) => (
                      <li key={o.option_id} className={o.is_correct ? "text-emerald-300" : "text-muted-foreground"}>
                        {String.fromCharCode(65 + i)}. {o.option_text} {o.is_correct && "✓"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  aria-label="Edit question"
                  onClick={() => { setFormError(""); setDraft({ ...emptyDraft(), ...q, options: q.options.map((o: any) => ({ option_id: o.option_id, option_text: o.option_text, is_correct: o.is_correct })), marking_scheme: q.marking_scheme || "all_or_nothing" }); }}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  className="rounded p-1.5 text-muted-foreground hover:bg-white/5 hover:text-destructive"
                  aria-label="Archive question"
                  onClick={() => { if (window.confirm("Archive this question? Exams that already use it keep their copy.")) deleteQ.mutate(q.question_id); }}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="bank-dialog-title">
          <GlassCard strong className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-auto p-6">
            <div className="flex items-center justify-between">
              <h2 id="bank-dialog-title" className="text-lg font-semibold text-foreground">{draft.question_id ? "Edit question" : "New question"}</h2>
              <button onClick={() => setDraft(null)} aria-label="Close"><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Question type">
              {(Object.keys(TYPE_LABEL) as QType[]).map((t) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={draft.question_type === t}
                  onClick={() => setType(t)}
                  className={cn("rounded-lg border px-3 py-1.5 text-sm", draft.question_type === t ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}
                >
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
            <label className="block text-xs text-muted-foreground">
              Question text
              <textarea className={cn(inputCls, "mt-1")} rows={3} value={draft.question_text} onChange={(e) => setDraft({ ...draft, question_text: e.target.value })} />
            </label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-xs text-muted-foreground">Marks
                <input type="number" min={1} max={100} className={cn(inputCls, "mt-1")} value={draft.marks} onChange={(e) => setDraft({ ...draft, marks: Number(e.target.value) })} />
              </label>
              <label className="text-xs text-muted-foreground">Difficulty
                <select className={cn(inputCls, "mt-1")} value={draft.difficulty} onChange={(e) => setDraft({ ...draft, difficulty: e.target.value as Draft["difficulty"] })}>
                  <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
              </label>
              <label className="text-xs text-muted-foreground">Category / topic
                <input className={cn(inputCls, "mt-1")} list="bank-categories" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
                <datalist id="bank-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              </label>
            </div>
            {draft.question_type === "multiple_select" && (
              <label className="block text-xs text-muted-foreground">Marking scheme
                <select className={cn(inputCls, "mt-1")} value={draft.marking_scheme} onChange={(e) => setDraft({ ...draft, marking_scheme: e.target.value })}>
                  <option value="all_or_nothing">All or nothing — full marks only for the exact correct set</option>
                  <option value="partial">Partial — marks × (correct picked − wrong picked) ÷ total correct, floored, never below 0</option>
                </select>
              </label>
            )}
            {draft.question_type === "written" ? (
              <p className="text-xs text-muted-foreground">Written responses are graded manually by an examiner (0 to {draft.marks} marks).</p>
            ) : (
              <fieldset className="space-y-2">
                <legend className="text-xs text-muted-foreground">
                  Options — mark {draft.question_type === "mcq" ? "exactly one" : "one or more"} correct
                </legend>
                {draft.options.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type={draft.question_type === "mcq" ? "radio" : "checkbox"}
                      name="correct-option"
                      checked={o.is_correct}
                      onChange={(e) => setOption(i, { is_correct: draft.question_type === "mcq" ? true : e.target.checked })}
                      aria-label={`Option ${String.fromCharCode(65 + i)} is correct`}
                    />
                    <input className={inputCls} placeholder={`Option ${String.fromCharCode(65 + i)}`} value={o.option_text} onChange={(e) => setOption(i, { option_text: e.target.value })} />
                    {draft.options.length > 2 && (
                      <button onClick={() => setDraft({ ...draft, options: draft.options.filter((_, j) => j !== i) })} aria-label="Remove option">
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                ))}
                {draft.options.length < 10 && (
                  <button className="text-xs text-primary underline" onClick={() => setDraft({ ...draft, options: [...draft.options, { option_text: "", is_correct: false }] })}>
                    Add option
                  </button>
                )}
              </fieldset>
            )}
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2">
              <GlowButton size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</GlowButton>
              <GlowButton size="sm" onClick={save} disabled={createQ.isPending || updateQ.isPending}>Save question</GlowButton>
            </div>
          </GlassCard>
        </div>
      )}
    </AppShell>
  );
}
