import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { GlassCard } from "@/components/common/GlassCard";
import { GlowButton } from "@/components/common/GlowButton";
import { LoadingSkeleton } from "@/components/common/States";
import { useBankQuestions, useCreateBankQuestion, useUpdateBankQuestion, useDeleteBankQuestion, useImportQuestions } from "@/lib/queries";
import { Plus, Search, Trash2, Edit2, Upload, X, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/bank")({
  head: () => ({
    meta: [
      { title: "Question Bank · Nigran 360" },
      { name: "description", content: "Reusable question bank for Nigran 360 examinations." },
    ],
  }),
  component: BankPage,
});

const TYPES = ["mcq", "multi_select", "written"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

type QType = typeof TYPES[number];

const typeLabel: Record<string, string> = {
  mcq: "Single-answer MCQ",
  multi_select: "Multiple-select",
  written: "Written response",
};

function emptyQuestion() {
  return {
    question_text: "",
    question_type: "mcq" as QType,
    category: "",
    difficulty: "medium",
    marks: 1,
    marking_scheme: "",
    options: [
      { option_text: "", is_correct: false },
      { option_text: "", is_correct: false },
    ],
  };
}

function BankPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(emptyQuestion());
  const [importOpen, setImportOpen] = useState(false);
  const [importContent, setImportContent] = useState("");
  const [importFormat, setImportFormat] = useState("csv");
  const [importPreview, setImportPreview] = useState<any | null>(null);
  const [formError, setFormError] = useState("");

  const bankQ = useBankQuestions({ ...filters, search });
  const createQ = useCreateBankQuestion();
  const deleteQ = useDeleteBankQuestion();
  const importQ = useImportQuestions();

  const questions: any[] = bankQ.data?.questions ?? [];
  const categories: string[] = bankQ.data?.categories ?? [];

  function openCreate() {
    setEditing(null);
    setForm(emptyQuestion());
    setFormError("");
    document.getElementById("bank-form-dialog")?.removeAttribute("hidden");
  }

  function openEdit(q: any) {
    setEditing(q);
    setForm({
      question_text: q.question_text,
      question_type: q.question_type,
      category: q.category,
      difficulty: q.difficulty,
      marks: q.marks,
      marking_scheme: q.marking_scheme,
      options: q.options?.length
        ? q.options.map((o: any) => ({ option_id: o.option_id, option_text: o.option_text, is_correct: o.is_correct }))
        : [{ option_text: "", is_correct: false }, { option_text: "", is_correct: false }],
    });
    setFormError("");
    document.getElementById("bank-form-dialog")?.removeAttribute("hidden");
  }

  function closeForm() {
    document.getElementById("bank-form-dialog")?.setAttribute("hidden", "");
  }

  async function handleSave() {
    setFormError("");
    try {
      if (editing) {
        const updateQ = useUpdateBankQuestion(editing.question_id);
        await updateQ.mutateAsync(form);
      } else {
        await createQ.mutateAsync(form);
      }
      closeForm();
    } catch (err: any) {
      setFormError(err.message || "Could not save question.");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Archive this question? It will be hidden from the bank.")) return;
    await deleteQ.mutateAsync(id);
  }

  async function handleImportPreview() {
    try {
      const result = await importQ.mutateAsync({ content: importContent, fileFormat: importFormat, commit: false });
      setImportPreview(result);
    } catch (err: any) {
      setImportPreview({ error: err.message });
    }
  }

  async function handleImportCommit() {
    try {
      await importQ.mutateAsync({ content: importContent, fileFormat: importFormat, commit: true });
      setImportOpen(false);
      setImportContent("");
      setImportPreview(null);
    } catch (err: any) {
      setImportPreview({ ...importPreview, error: err.message });
    }
  }

  function setOption(index: number, field: string, value: any) {
    setForm((f) => {
      const opts = [...f.options];
      opts[index] = { ...opts[index], [field]: value };
      // Single-answer MCQ: only one correct
      if (field === "is_correct" && value && form.question_type === "mcq") {
        opts.forEach((o, i) => { if (i !== index) o.is_correct = false; });
      }
      return { ...f, options: opts };
    });
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Question Bank</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{questions.length} reusable questions</p>
          </div>
          <div className="flex gap-2">
            <GlowButton onClick={() => setImportOpen(true)} className="text-xs px-3 py-1.5 bg-zinc-700/50">
              <Upload className="h-3 w-3 mr-1" /> Import CSV/JSON
            </GlowButton>
            <GlowButton onClick={openCreate} className="text-xs px-3 py-1.5">
              <Plus className="h-3 w-3 mr-1" /> Add Question
            </GlowButton>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              className="pl-8 pr-3 py-1.5 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Search questions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none"
            value={filters.question_type ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, question_type: e.target.value }))}
          >
            <option value="">All types</option>
            {TYPES.map((t) => <option key={t} value={t}>{typeLabel[t]}</option>)}
          </select>
          <select
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none"
            value={filters.difficulty ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, difficulty: e.target.value }))}
          >
            <option value="">All difficulties</option>
            {DIFFICULTIES.map((d) => <option key={d} value={d} className="capitalize">{d}</option>)}
          </select>
          {categories.length > 0 && (
            <select
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none"
              value={filters.category ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            >
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>

        {/* Question list */}
        {bankQ.isLoading && <LoadingSkeleton />}
        {!bankQ.isLoading && questions.length === 0 && (
          <GlassCard className="p-8 text-center text-muted-foreground">
            No questions yet. Add one or import from CSV/JSON.
          </GlassCard>
        )}
        <div className="space-y-2">
          {questions.map((q: any) => (
            <GlassCard key={q.question_id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground line-clamp-2">{q.question_text}</p>
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    <span className="text-[11px] rounded-full px-2 py-0.5 bg-primary/20 text-primary font-medium">
                      {typeLabel[q.question_type] ?? q.question_type}
                    </span>
                    <span className={cn(
                      "text-[11px] rounded-full px-2 py-0.5 font-medium",
                      q.difficulty === "easy" ? "bg-green-500/20 text-green-300" :
                      q.difficulty === "hard" ? "bg-red-500/20 text-red-300" :
                      "bg-amber-500/20 text-amber-300"
                    )}>
                      {q.difficulty}
                    </span>
                    {q.category && (
                      <span className="text-[11px] rounded-full px-2 py-0.5 bg-zinc-500/20 text-zinc-400">{q.category}</span>
                    )}
                    <span className="text-[11px] text-muted-foreground">{q.marks} mark{q.marks !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(q)} className="p-1.5 rounded hover:bg-white/5 text-muted-foreground hover:text-foreground">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleDelete(q.question_id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Question form dialog */}
        <div id="bank-form-dialog" hidden className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <GlassCard className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{editing ? "Edit Question" : "New Question"}</h2>
              <button onClick={closeForm} className="p-1.5 rounded hover:bg-white/5 text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Question text *</label>
                <textarea
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  value={form.question_text}
                  onChange={(e) => setForm((f) => ({ ...f, question_text: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Type</label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    value={form.question_type}
                    onChange={(e) => setForm((f) => ({ ...f, question_type: e.target.value as QType }))}
                  >
                    {TYPES.map((t) => <option key={t} value={t}>{typeLabel[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Difficulty</label>
                  <select
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none"
                    value={form.difficulty}
                    onChange={(e) => setForm((f) => ({ ...f, difficulty: e.target.value }))}
                  >
                    {DIFFICULTIES.map((d) => <option key={d} value={d} className="capitalize">{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                  <input
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    list="category-list"
                    placeholder="e.g. Algebra"
                  />
                  <datalist id="category-list">
                    {categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Marks</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    value={form.marks}
                    onChange={(e) => setForm((f) => ({ ...f, marks: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              </div>

              {/* Options (mcq / multi_select) */}
              {form.question_type !== "written" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-2 block">
                    Options — tick the correct answer{form.question_type === "multi_select" ? "s" : ""}
                  </label>
                  <div className="space-y-2">
                    {form.options.map((opt: any, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOption(i, "is_correct", !opt.is_correct)}
                          className={cn(
                            "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                            opt.is_correct ? "bg-primary border-primary" : "border-border"
                          )}
                        >
                          {opt.is_correct && <Check className="h-3 w-3 text-primary-foreground" />}
                        </button>
                        <input
                          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                          placeholder={`Option ${i + 1}`}
                          value={opt.option_text}
                          onChange={(e) => setOption(i, "option_text", e.target.value)}
                        />
                        {form.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, options: f.options.filter((_: any, j: number) => j !== i) }))}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    {form.options.length < 10 && (
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, options: [...f.options, { option_text: "", is_correct: false }] }))}
                        className="text-xs text-primary hover:text-primary/80 flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> Add option
                      </button>
                    )}
                  </div>
                </div>
              )}

              {form.question_type === "written" && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Marking scheme / rubric</label>
                  <textarea
                    rows={2}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Describe what a full-mark answer looks like…"
                    value={form.marking_scheme}
                    onChange={(e) => setForm((f) => ({ ...f, marking_scheme: e.target.value }))}
                  />
                </div>
              )}

              {formError && <p className="text-sm text-destructive">{formError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <GlowButton onClick={closeForm} className="text-xs px-3 py-1.5 bg-zinc-700/50">Cancel</GlowButton>
                <GlowButton onClick={handleSave} disabled={createQ.isPending} className="text-xs px-3 py-1.5">
                  {createQ.isPending ? "Saving…" : "Save Question"}
                </GlowButton>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Import dialog */}
        {importOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <GlassCard className="w-full max-w-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-foreground">Import Questions</h2>
                <button onClick={() => { setImportOpen(false); setImportPreview(null); }} className="p-1.5 rounded hover:bg-white/5 text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <select
                  className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
                  value={importFormat}
                  onChange={(e) => setImportFormat(e.target.value)}
                >
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
              </div>
              <textarea
                rows={8}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={importFormat === "csv"
                  ? "question_text,question_type,category,difficulty,marks,option_1,correct_1,option_2,correct_2,..."
                  : '[{"question_text": "...", "question_type": "mcq", ...}]'}
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
              />
              {importPreview && (
                <div className={cn("rounded-md p-3 text-sm", importPreview.error ? "bg-destructive/10 text-destructive" : "bg-green-500/10 text-green-300")}>
                  {importPreview.error
                    ? importPreview.error
                    : `Preview: ${importPreview.valid ?? 0} valid, ${importPreview.skipped ?? 0} skipped`}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <GlowButton onClick={handleImportPreview} disabled={!importContent.trim()} className="text-xs px-3 py-1.5 bg-zinc-700/50">
                  Preview
                </GlowButton>
                <GlowButton
                  onClick={handleImportCommit}
                  disabled={!importPreview || !!importPreview.error || importQ.isPending}
                  className="text-xs px-3 py-1.5"
                >
                  {importQ.isPending ? "Importing…" : "Import"}
                </GlowButton>
              </div>
            </GlassCard>
          </div>
        )}
      </div>
    </AppShell>
  );
}
