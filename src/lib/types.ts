export type TaskStatus = "todo" | "doing" | "done" | "submitted";

export type TaskKind = "Tugas" | "Kuis" | "Praktikum" | "Proyek";

export interface Course {
  id: string;
  code: string;
  name: string;
  lecturer?: string;
}

export interface TaskAttachment {
  name: string;
  url: string;
  size?: string;
}

export interface Task {
  id: string;
  courseId: string;
  title: string;
  kind: TaskKind;
  dueAt?: string;
  status: TaskStatus;
  sourceUrl?: string;
  description?: string;
  submittedAt?: string;
  submittable?: boolean;
  instructorFiles?: TaskAttachment[];
  submissionFiles?: TaskAttachment[];
}

export interface SpadaConnection {
  connected: boolean;
  nim?: string;
  connectedAt?: string;
  lastSyncedAt?: string;
}

export interface SyncPayload {
  courses: Course[];
  tasks: Task[];
  syncedAt: string;
  partial?: boolean;
}

export interface TaskStatusEntry {
  status: TaskStatus;
  updatedAt: string;
}

export interface TaskState {
  statuses: Record<string, TaskStatusEntry>;
  cache?: SyncPayload;
  updatedAt: string;
}
