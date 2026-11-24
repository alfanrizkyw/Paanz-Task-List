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

export function getDeadlineState(value?: string): { tone: "danger" | "warning" | "accent"; label: string; hours: number } {
  if (!value) return { tone: "accent", label: "Tanpa deadline", hours: Number.POSITIVE_INFINITY };
  const hours = (new Date(value).getTime() - Date.now()) / 3_600_000;
  if (hours < 0) return { tone: "danger", label: "Terlambat", hours };
  if (hours <= 24) return { tone: "warning", label: "Hari ini", hours };
  if (hours <= 72) return { tone: "warning", label: "≤ 3 hari", hours };
  return { tone: "accent", label: "Akan datang", hours };
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
