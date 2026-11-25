"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, CalendarDays, CheckCircle2, Download, FileText, LoaderCircle, Send, UploadCloud, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { Course, Task, TaskAttachment, TaskStatus } from "@/lib/types";
import { cn, formatDeadline, getDeadlineState, statusLabels } from "@/lib/utils";

interface TaskDetailDialogProps {
  task: Task | null;
  course?: Course;
  connected: boolean;
  accountNim?: string;
  onClose: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onSubmitted: (taskId: string, submittedAt: string, attachments: { instructorFiles: TaskAttachment[]; submissionFiles: TaskAttachment[] } | undefined, nim: string) => void;
}

function AttachmentList({
  files,
  taskUrl,
  emptyText,
  downloadingUrl,
  onDownload,
}: {
  files: TaskAttachment[];
  taskUrl?: string;
  emptyText: string;
  downloadingUrl: string | null;
  onDownload: (file: TaskAttachment) => void;
}) {
  if (!files.length) return <p className="rounded-xl bg-surface-subtle px-4 py-3 text-xs leading-5 text-muted-ink">{emptyText}</p>;

  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li key={file.url}>
          <button
            type="button"
            className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-line bg-surface-subtle px-3 py-2 text-left transition-colors hover:bg-surface-raised disabled:opacity-60"
            disabled={!taskUrl || downloadingUrl === file.url}
            onClick={() => onDownload(file)}
            aria-label={`Unduh ${file.name}`}
          >
            <FileText size={18} className="shrink-0 text-secondary-ink" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{file.name}</span>
              {file.size ? <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-muted-ink">{file.size}</span> : null}
            </span>
            {downloadingUrl === file.url ? <LoaderCircle size={17} className="shrink-0 animate-spin text-muted-ink" /> : <Download size={17} className="shrink-0 text-muted-ink" />}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function TaskDetailDialog({
  task,
  course,
  connected,
  accountNim,
  onClose,
  onStatusChange,
  onSubmitted,
}: TaskDetailDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);
  const canSubmit = Boolean(connected && task?.sourceUrl && task.submittable !== false && (file || text.trim()) && task.status !== "submitted");
  const fileLabel = useMemo(() => (file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "Pilih berkas tugas"), [file]);
  const deadline = getDeadlineState(task?.dueAt, task?.status, task?.submittedAt);

  async function handleDownload(attachment: TaskAttachment) {
    if (!task?.sourceUrl) return;
    setDownloadingUrl(attachment.url);
    try {
      const params = new URLSearchParams({ taskUrl: task.sourceUrl, fileUrl: attachment.url });
      const response = await fetch(`/api/spada/file?${params}`);
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(result?.message ?? "Berkas gagal diunduh.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.name;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Berkas gagal diunduh.");
    } finally {
      setDownloadingUrl(null);
    }
  }

  async function handleSubmit() {
    if (!task || !canSubmit || !accountNim) return;
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
      const result = (await response.json()) as {
        ok: boolean;
        submittedAt?: string;
        instructorFiles?: TaskAttachment[];
        submissionFiles?: TaskAttachment[];
        message?: string;
      };
      if (!response.ok || !result.ok || !result.submittedAt) {
        throw new Error(result.message ?? "Pengumpulan gagal.");
      }
      onSubmitted(task.id, result.submittedAt, {
        instructorFiles: result.instructorFiles ?? task.instructorFiles ?? [],
        submissionFiles: result.submissionFiles ?? task.submissionFiles ?? [],
      }, accountNim);
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[24px] p-0">
          <div className="scrollbar-quiet min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 pr-16 sm:p-7 sm:pr-16">
            {task ? (
              <>
                <Dialog.Close className="icon-button absolute right-3 top-3 z-10 bg-surface-raised" aria-label="Tutup detail tugas">
                  <X size={18} />
                </Dialog.Close>
                <div className="pr-2">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-secondary-ink">
                    <span className="font-mono font-medium text-accent">{course?.code ?? "SPADA"}</span>
                    <span className="text-muted-ink">{task.kind}</span>
                  </div>
                  <Dialog.Title className="text-xl font-medium leading-8 text-ink sm:text-2xl">{task.title}</Dialog.Title>
                  <Dialog.Description className="mt-2 text-sm leading-6 text-secondary-ink">
                    {course?.name ?? "Mata kuliah"} · {statusLabels[task.status]}
                  </Dialog.Description>
                </div>
              </div>

              {task.status === "submitted" ? (
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-success/15 bg-success-soft p-4">
                  <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-success" />
                  <div>
                    <div className="text-sm font-medium text-ink">Sudah dikumpulkan ke SPADA</div>
                    <p className="mt-1 text-xs leading-5 text-secondary-ink">
                      {task.submittedAt ? `Terkonfirmasi ${formatDeadline(task.submittedAt)}` : "Status pengumpulan terkonfirmasi dari Moodle"}
                    </p>
                  </div>
                </div>
              ) : null}

              <div className="my-6 h-px bg-line" />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-surface-subtle p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-ink"><CalendarDays size={15} /> Deadline</div>
                  {task.dueAt ? (
                    <time dateTime={task.dueAt} className="block font-mono text-sm font-medium tabular-nums text-ink">{formatDeadline(task.dueAt)}</time>
                  ) : (
                    <span className="font-mono text-sm font-medium text-ink">Tanpa deadline</span>
                  )}
                  <div className={cn(
                    "mt-2 text-xs font-medium",
                    deadline.tone === "danger" ? "text-danger" : deadline.tone === "warning" ? "text-warning" : deadline.tone === "success" ? "text-success" : "text-muted-ink",
                  )}>{deadline.label}</div>
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
                <section className="mt-6" aria-labelledby="task-description-title">
                  <h3 id="task-description-title" className="text-sm font-medium text-ink">Petunjuk tugas</h3>
                  <p className="mt-3 whitespace-pre-line text-sm leading-7 text-secondary-ink">{task.description}</p>
                </section>
              ) : null}

              <section className="mt-6" aria-labelledby="instructor-files-title">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id="instructor-files-title" className="text-sm font-medium text-ink">Berkas dari dosen</h3>
                  <span className="font-mono text-xs tabular-nums text-muted-ink">{task.instructorFiles?.length ?? 0}</span>
                </div>
                <AttachmentList
                  files={task.instructorFiles ?? []}
                  taskUrl={task.sourceUrl}
                  emptyText="Tidak ada berkas pendamping pada tugas ini"
                  downloadingUrl={downloadingUrl}
                  onDownload={(attachment) => void handleDownload(attachment)}
                />
              </section>

              {task.status === "submitted" ? (
                <section className="mt-6" aria-labelledby="submission-files-title">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 id="submission-files-title" className="text-sm font-medium text-ink">Berkas yang sudah diunggah</h3>
                    <span className="font-mono text-xs tabular-nums text-muted-ink">{task.submissionFiles?.length ?? 0}</span>
                  </div>
                  <AttachmentList
                    files={task.submissionFiles ?? []}
                    taskUrl={task.sourceUrl}
                    emptyText="Tidak ada berkas unggahan yang terdeteksi. Jawaban teks tetap tercatat di SPADA"
                    downloadingUrl={downloadingUrl}
                    onDownload={(attachment) => void handleDownload(attachment)}
                  />
                </section>
              ) : null}

              {task.status === "submitted" ? (
                task.sourceUrl ? (
                  <a href={task.sourceUrl} target="_blank" rel="noreferrer" className="primary-action mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent">
                    <ArrowUpRight size={17} /> {task.submittable === false ? "Buka kuis di SPADA" : "Buka pengumpulan di SPADA"}
                  </a>
                ) : null
              ) : (
                <section className="mt-6 rounded-2xl border border-line bg-surface-subtle/60 p-4 sm:p-5" aria-labelledby="submit-task-title">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 id="submit-task-title" className="text-sm font-medium text-ink">Kumpulkan ke SPADA</h3>
                    {task.sourceUrl ? (
                      <a href={task.sourceUrl} target="_blank" rel="noreferrer" className="icon-button -my-2 -mr-2" aria-label="Buka tugas di SPADA">
                        <ArrowUpRight size={18} />
                      </a>
                    ) : null}
                  </div>

                  {task.submittable === false ? (
                    <>
                      <div className="flex items-start gap-2 rounded-xl bg-surface-subtle p-3 text-xs leading-5 text-secondary-ink">
                        <FileText size={16} className="mt-0.5 shrink-0" />
                        Kuis dikerjakan langsung di SPADA. Pengumpulan berkas hanya tersedia untuk tugas.
                      </div>
                      {task.sourceUrl ? (
                        <a href={task.sourceUrl} target="_blank" rel="noreferrer" className="primary-action mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent">
                          <ArrowUpRight size={17} /> Buka kuis di SPADA
                        </a>
                      ) : null}
                    </>
                  ) : (
                    <>
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

                      {!connected ? (
                        <div className="mt-4 flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-xs leading-5 text-warning">
                          <FileText size={16} className="mt-0.5 shrink-0" />
                          Mode contoh. Masuk dengan SIAKAD untuk mengirim tugas asli.
                        </div>
                      ) : null}

                      <button
                        type="button"
                        className="primary-action mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent disabled:opacity-45"
                        disabled={!canSubmit || submitting}
                        onClick={handleSubmit}
                      >
                        {submitting ? <LoaderCircle size={17} className="animate-spin" /> : <Send size={17} />}
                        {submitting ? "Mengirim ke SPADA" : "Kirim tugas ke SPADA"}
                      </button>
                    </>
                  )}
                </section>
              )}
              </>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
