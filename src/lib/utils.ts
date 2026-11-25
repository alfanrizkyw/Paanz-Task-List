import type { TaskStatus } from "@/lib/types";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function formatDeadline(value?: string) {
  if (!value) return "Tanpa deadline";
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function formatSyncTime(value?: string) {
  if (!value) return "Belum pernah";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export type DeadlineTone = "danger" | "warning" | "accent" | "success";

export function getDeadlineState(value?: string, status?: TaskStatus, submittedAt?: string): { tone: DeadlineTone; label: string; hours: number; isLate: boolean } {
  if (!value) return { tone: status === "submitted" ? "success" : "accent", label: status === "submitted" ? "Dikumpulkan" : "Tanpa deadline", hours: Number.POSITIVE_INFINITY, isLate: false };
  const dueTime = new Date(value).getTime();
  if (status === "submitted") {
    const submissionTime = submittedAt ? Date.parse(submittedAt) : Number.NaN;
    const isLate = Number.isFinite(submissionTime) && submissionTime > dueTime;
    const comparisonTime = Number.isFinite(submissionTime) ? submissionTime : Date.now();
    return { tone: "success", label: isLate ? "Terlambat · sudah dikumpulkan" : "Dikumpulkan", hours: (dueTime - comparisonTime) / 3_600_000, isLate };
  }
  const hours = (dueTime - Date.now()) / 3_600_000;
  if (hours < 0) return { tone: "danger", label: "Terlambat · belum dikumpulkan", hours, isLate: true };
  if (hours <= 24) return { tone: "warning", label: "Hari ini", hours, isLate: false };
  if (hours <= 72) return { tone: "warning", label: "≤ 3 hari", hours, isLate: false };
  return { tone: "accent", label: "Akan datang", hours, isLate: false };
}

export const statusLabels: Record<TaskStatus, string> = {
  todo: "Belum dikerjakan",
  doing: "Sedang dikerjakan",
  done: "Selesai",
  submitted: "Dikumpulkan",
};

export const statusShortLabels: Record<TaskStatus, string> = {
  todo: "Belum",
  doing: "Dikerjakan",
  done: "Selesai",
  submitted: "Dikumpulkan",
};
