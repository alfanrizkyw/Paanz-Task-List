"use client";

import { ArrowUpRight, Check, Circle, Clock3, LoaderCircle } from "lucide-react";
import type { Course, Task, TaskStatus } from "@/lib/types";
import { cn, formatDeadline, getDeadlineState, statusLabels, statusShortLabels } from "@/lib/utils";

interface TaskCardProps {
  task: Task;
  course?: Course;
  index: number;
  onOpen: (task: Task) => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
}

const deadlineLine = {
  danger: "bg-danger",
  warning: "bg-warning",
  accent: "bg-accent",
};

const statusStyle: Record<TaskStatus, string> = {
  todo: "bg-surface-subtle text-secondary-ink",
  doing: "bg-warning-soft text-warning",
  done: "bg-success-soft text-success",
  submitted: "bg-accent-soft text-accent",
};

export function TaskCard({ task, course, index, onOpen, onStatusChange }: TaskCardProps) {
  const deadline = getDeadlineState(task.dueAt);
  const nextStatus: TaskStatus = task.status === "todo" ? "doing" : task.status === "doing" ? "done" : "todo";

  return (
    <article
      className="glass-soft task-enter relative overflow-hidden rounded-2xl"
      style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
    >
      <span className={cn("deadline-line", deadlineLine[deadline.tone])} />
      <div className="flex items-stretch gap-4 p-4 pl-5 sm:p-5 sm:pl-6">
        <button
          type="button"
          className="min-w-0 flex-1 rounded-xl text-left"
          onClick={() => onOpen(task)}
          aria-label={`Buka detail ${task.title}`}
        >
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-medium tracking-wide text-muted-ink">{course?.code ?? "SPADA"}</span>
            <span className="size-1 rounded-full bg-line-strong" />
            <span className="text-secondary-ink">{course?.name ?? "Mata kuliah"}</span>
          </div>
          <h3 className="text-[15px] font-semibold leading-6 text-ink sm:text-base">{task.title}</h3>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-secondary-ink">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 size={14} />
              {task.dueAt ? (
                <time dateTime={task.dueAt} className="font-mono tabular-nums">{formatDeadline(task.dueAt)}</time>
              ) : (
                <span className="font-mono tabular-nums">Tanpa deadline</span>
              )}
            </span>
            <span className={cn("font-medium", deadline.tone === "danger" ? "text-danger" : deadline.tone === "warning" ? "text-warning" : "text-muted-ink")}>
              {deadline.label}
            </span>
          </div>
        </button>

        <div className="flex shrink-0 flex-col items-end justify-between gap-3">
          <span className={cn("inline-flex min-h-7 items-center rounded-lg px-2.5 text-xs font-medium", statusStyle[task.status])}>
            {statusShortLabels[task.status]}
          </span>
          {task.status !== "submitted" ? (
            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-xs font-medium text-secondary-ink transition-colors hover:bg-surface-subtle hover:text-ink"
              onClick={() => onStatusChange(task.id, nextStatus)}
              aria-label={`Ubah status ${task.title} menjadi ${statusLabels[nextStatus]}`}
            >
              {task.status === "doing" ? <LoaderCircle size={15} /> : task.status === "done" ? <Check size={15} /> : <Circle size={15} />}
              <span className="hidden sm:inline">Ubah status</span>
              <ArrowUpRight size={14} className="sm:hidden" />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
