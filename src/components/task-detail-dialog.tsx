"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, CalendarDays, CheckCircle2, FileText, Send, UploadCloud, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Course, Task, TaskStatus } from "@/lib/types";
import { formatDeadline, statusLabels } from "@/lib/utils";

interface TaskDetailDialogProps {
  task: Task | null;
  course?: Course;
  connected: boolean;
  onClose: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onSubmitted: (taskId: string, submittedAt: string) => void;
}

export function TaskDetailDialog({
  task,
  course,
  connected,
  onClose,
  onStatusChange,
  onSubmitted,
}: TaskDetailDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = Boolean(connected && task?.sourceUrl && task.submittable !== false && (file || text.trim()) && task.status !== "submitted");
  const fileLabel = useMemo(() => (file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "Pilih berkas tugas"), [file]);

  async function handleSubmit() {
    if (!task || !canSubmit) return;
    if (file && file.size > 4 * 1024 * 1024) {
      toast.error("Ukuran berkas maksimal 4 MB");
      return;
    }

    setSubmitting(true);
    try {
      const body = new FormData();
      body.set("taskUrl", task.sourceUrl!);
      body.set("text", text.trim());
      if (file) body.set("file", file);
      const response = await fetch("/api/spada/submit", { method: "POST", body });
      const result = (await response.json()) as { ok: boolean; submittedAt?: string; message?: string };
      if (!response.ok || !result.ok || !result.submittedAt) {
        throw new Error(result.message ?? "Pengumpulan gagal.");
      }
      onSubmitted(task.id, result.submittedAt);
      toast.success("Tugas berhasil dikumpulkan ke SPADA");
      setFile(null);
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pengumpulan tugas gagal.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={Boolean(task)} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-32px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-6 shadow-2xl sm:p-8">
          {task ? (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-secondary-ink">
                    <span className="font-mono font-medium text-accent">{course?.code ?? "SPADA"}</span>
                    <span className="text-muted-ink">{task.kind}</span>
                  </div>
                  <Dialog.Title className="text-xl font-semibold leading-8 text-ink sm:text-2xl">{task.title}</Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-6 text-secondary-ink">
                    {course?.name ?? "Mata kuliah"} · {statusLabels[task.status]}
                  </Dialog.Description>
                </div>
                <Dialog.Close className="icon-button -mr-2 -mt-2 shrink-0" aria-label="Tutup detail tugas">
                  <X size={18} />
                </Dialog.Close>
              </div>

              <div className="my-6 h-px bg-line" />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-surface-subtle p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-ink"><CalendarDays size={15} /> Deadline</div>
                  {task.dueAt ? (
                    <time dateTime={task.dueAt} className="font-mono text-sm font-medium tabular-nums text-ink">{formatDeadline(task.dueAt)}</time>
                  ) : (
                    <span className="font-mono text-sm font-medium text-ink">Tanpa deadline</span>
                  )}
                </div>
                <label className="rounded-2xl bg-surface-subtle p-4">
                  <span className="mb-2 block text-xs text-muted-ink">Status pengerjaan</span>
                  <select
                    className="min-h-11 w-full bg-transparent text-sm font-medium text-ink outline-none"
                    value={task.status}
                    disabled={task.status === "submitted"}
                    onChange={(event) => onStatusChange(task.id, event.target.value as TaskStatus)}
                  >
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value} disabled={value === "submitted"}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>

              {task.description ? (
                <p className="mt-6 text-sm leading-7 text-secondary-ink">{task.description}</p>
              ) : null}

              <div className="mt-6 rounded-2xl border border-line bg-surface-subtle/60 p-4 sm:p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink">Kumpulkan ke SPADA</h3>
                  {task.sourceUrl ? (
                    <a href={task.sourceUrl} target="_blank" rel="noreferrer" className="icon-button -my-2 -mr-2" aria-label="Buka tugas di SPADA">
                      <ArrowUpRight size={18} />
                    </a>
                  ) : null}
                </div>

                <label className="group flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line-strong bg-surface px-4 text-center transition-colors hover:border-accent hover:bg-accent-soft/50">
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.rar,.png,.jpg,.jpeg"
                    onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  />
                  <UploadCloud size={24} className="mb-2 text-secondary-ink transition-colors group-hover:text-accent" />
                  <span className="text-sm font-medium text-ink">{fileLabel}</span>
                  <span className="mt-1 text-xs text-muted-ink">Maksimal 4 MB</span>
                </label>

                <label className="mt-4 block">
                  <span className="mb-2 block text-xs font-medium text-secondary-ink">Jawaban teks (opsional)</span>
                  <textarea
                    className="control min-h-24 w-full resize-y p-3 text-sm leading-6"
                    placeholder="Tulis jawaban atau catatan pengumpulan"
                    maxLength={50_000}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                  />
                </label>

                {task.submittable === false ? (
                  <div className="mt-4 flex items-start gap-2 rounded-xl bg-surface-subtle p-3 text-xs leading-5 text-secondary-ink">
                    <FileText size={16} className="mt-0.5 shrink-0" />
                    Kuis dikerjakan langsung di SPADA. Pengumpulan berkas hanya tersedia untuk tugas.
                  </div>
                ) : !connected ? (
                  <div className="mt-4 flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-xs leading-5 text-warning">
                    <FileText size={16} className="mt-0.5 shrink-0" />
                    Mode contoh. Masuk dengan SIAKAD untuk mengirim tugas asli.
                  </div>
                ) : null}

                {task.submittable === false && task.sourceUrl ? (
                  <a
                    href={task.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent transition-[background-color,transform] hover:brightness-95 active:scale-[0.99]"
                  >
                    <ArrowUpRight size={17} /> Buka kuis di SPADA
                  </a>
                ) : (
                  <button
                    type="button"
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent transition-[background-color,transform] hover:brightness-95 active:scale-[0.99] disabled:opacity-45"
                    disabled={!canSubmit || submitting}
                    onClick={handleSubmit}
                  >
                    {submitting ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : task.status === "submitted" ? <CheckCircle2 size={17} /> : <Send size={17} />}
                    {submitting ? "Mengirim ke SPADA" : task.status === "submitted" ? "Sudah dikumpulkan" : "Kirim tugas ke SPADA"}
                  </button>
                )}
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
