import type { SyncPayload, TaskState, TaskStatus, TaskStatusEntry } from "@/lib/types";

const statuses = new Set<TaskStatus>(["todo", "doing", "done", "submitted"]);

export function emptyTaskState(): TaskState {
  return { statuses: {}, updatedAt: new Date(0).toISOString() };
}

export function mergeTaskStates(current: TaskState, incoming: TaskState): TaskState {
  const merged: TaskState = {
    statuses: { ...current.statuses },
    cache: current.cache,
    updatedAt: Date.parse(incoming.updatedAt) > Date.parse(current.updatedAt) ? incoming.updatedAt : current.updatedAt,
  };

  for (const [taskId, entry] of Object.entries(incoming.statuses)) {
    const existing = merged.statuses[taskId];
    if (!existing || (existing.status !== "submitted" && (
      entry.status === "submitted" || Date.parse(entry.updatedAt) > Date.parse(existing.updatedAt)
    ))) {
      merged.statuses[taskId] = entry;
    }
  }

  if (incoming.cache && (!merged.cache || Date.parse(incoming.cache.syncedAt) > Date.parse(merged.cache.syncedAt))) {
    merged.cache = incoming.cache;
  }

  return merged;
}

export function statusMap(state: TaskState): Record<string, TaskStatus> {
  return Object.fromEntries(Object.entries(state.statuses).map(([taskId, entry]) => [taskId, entry.status]));
}

export function isTaskStatusEntry(value: unknown): value is TaskStatusEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<TaskStatusEntry>;
  return typeof entry.status === "string"
    && statuses.has(entry.status as TaskStatus)
    && typeof entry.updatedAt === "string"
    && !Number.isNaN(Date.parse(entry.updatedAt));
}

export function isSyncPayload(value: unknown): value is SyncPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<SyncPayload>;
  return Array.isArray(payload.courses)
    && payload.courses.length <= 100
    && payload.courses.every((course) => course && typeof course.id === "string" && typeof course.name === "string")
    && Array.isArray(payload.tasks)
    && payload.tasks.length <= 500
    && payload.tasks.every((task) => task && typeof task.id === "string" && typeof task.courseId === "string" && typeof task.title === "string")
    && typeof payload.syncedAt === "string"
    && !Number.isNaN(Date.parse(payload.syncedAt));
}

export function parseTaskState(value: unknown): TaskState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TaskState>;
  if (!candidate.statuses || typeof candidate.statuses !== "object" || Array.isArray(candidate.statuses)) return null;
  if (typeof candidate.updatedAt !== "string" || Number.isNaN(Date.parse(candidate.updatedAt))) return null;
  if (candidate.cache !== undefined && !isSyncPayload(candidate.cache)) return null;

  const entries = Object.entries(candidate.statuses);
  if (entries.length > 1000 || entries.some(([taskId, entry]) => taskId.length > 500 || !isTaskStatusEntry(entry))) return null;
  return {
    statuses: Object.fromEntries(entries) as Record<string, TaskStatusEntry>,
    ...(candidate.cache ? { cache: candidate.cache } : {}),
    updatedAt: candidate.updatedAt,
  };
}
