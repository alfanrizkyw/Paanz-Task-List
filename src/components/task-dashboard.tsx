"use client";

import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Circle,
  CircleAlert,
  Clock3,
  Cloud,
  CloudCheck,
  CloudOff,
  Eye,
  EyeOff,
  LayoutList,
  ListChecks,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { TaskCard } from "@/components/task-card";
import { TaskDetailDialog } from "@/components/task-detail-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  emptyTaskState,
  isSyncPayload,
  mergeTaskStates,
  parseTaskState,
  statusMap,
} from "@/lib/task-state";
import type { Course, SpadaConnection, SyncPayload, Task, TaskAttachment, TaskState, TaskStatus, TaskStatusEntry } from "@/lib/types";
import { cn, formatDeadline, formatSyncTime, getDeadlineState } from "@/lib/utils";

interface DashboardUser {
  nim: string;
  name: string;
}

interface TaskDashboardProps {
  initialTasks: Task[];
  initialCourses: Course[];
  user: DashboardUser | null;
  connection: SpadaConnection;
}

type StatusFilter = "all" | TaskStatus;
type CloudStatus = "loading" | "saving" | "saved" | "offline" | "error";

interface AccountRequest {
  nim: string;
  generation: number;
  controller: AbortController;
}

interface PendingCloudSave {
  state: TaskState;
  nim: string;
  generation: number;
}

const filterItems: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "todo", label: "Belum" },
  { value: "doing", label: "Dikerjakan" },
  { value: "done", label: "Selesai" },
  { value: "submitted", label: "Dikumpul" },
];

const validStatuses = new Set<TaskStatus>(["todo", "doing", "done", "submitted"]);
const previewDeadlineLine = {
  danger: "bg-danger",
  warning: "bg-warning",
  accent: "bg-accent",
  success: "bg-success",
};

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v12.5H7.5A2.5 2.5 0 0 1 5 17V4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M8 8.5h6M8 12h6M8 15.5h3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="m15.5 16 1.6 1.6 3.2-3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-[15px] font-medium leading-5 text-ink">
        <span className="sm:hidden">Paanz</span>
        <span className="hidden sm:inline">Paanz Task List</span>
      </span>
    </div>
  );
}

function initials(name: string, nim: string) {
  return (name.trim() || nim)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function readLocalTaskState(nim: string): TaskState {
  let state = emptyTaskState();
  try {
    const stored = localStorage.getItem(`paanz-state:${nim}`);
    if (stored) state = parseTaskState(JSON.parse(stored)) ?? state;

    const statusRaw = localStorage.getItem(`paanz-status:${nim}`);
    const cacheRaw = localStorage.getItem(`paanz-cache:${nim}`);
    if (statusRaw || cacheRaw) {
      const cache = cacheRaw ? JSON.parse(cacheRaw) as unknown : undefined;
      const legacyStatuses = statusRaw ? JSON.parse(statusRaw) as Record<string, unknown> : {};
      const timestamp = isSyncPayload(cache) ? cache.syncedAt : new Date().toISOString();
      const statuses = Object.fromEntries(
        Object.entries(legacyStatuses)
          .filter((entry): entry is [string, TaskStatus] => typeof entry[1] === "string" && validStatuses.has(entry[1] as TaskStatus))
          .map(([taskId, status]) => [taskId, { status, updatedAt: timestamp }]),
      );
      state = mergeTaskStates(state, {
        statuses,
        ...(isSyncPayload(cache) ? { cache } : {}),
        updatedAt: timestamp,
      });
    }
  } catch {
    return state;
  }
  return state;
}

function SiakadLoginDialog({
  open,
  onOpenChange,
  onSuccess,
  previewTasks,
  previewCourses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (user: DashboardUser) => void;
  previewTasks: Task[];
  previewCourses: Course[];
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nim: formData.get("nim"), password: formData.get("password") }),
      });
      const result = (await response.json()) as { ok: boolean; user?: DashboardUser; message?: string };
      if (!response.ok || !result.ok || !result.user) throw new Error(result.message ?? "Login SIAKAD gagal.");
      onSuccess(result.user);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login SIAKAD gagal.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => {
      onOpenChange(nextOpen);
      if (!nextOpen) {
        setError("");
        setShowPassword(false);
      }
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-md" />
        <Dialog.Content className="login-surface fixed left-1/2 top-1/2 z-50 grid max-h-[calc(100dvh-32px)] w-[calc(100%-32px)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[28px] lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-h-0 overflow-y-auto p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-2xl font-medium tracking-tight text-ink">Masuk SIAKAD</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-secondary-ink">
                  Tugas Polinema, dalam satu tempat
                </Dialog.Description>
              </div>
              <Dialog.Close className="icon-button -mr-2 -mt-2" aria-label="Tutup login"><X size={18} /></Dialog.Close>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-secondary-ink">NIM</span>
                <input className="control h-12 w-full px-4 text-sm" name="nim" type="text" inputMode="numeric" autoComplete="username" pattern="[0-9]{6,20}" minLength={6} maxLength={20} required autoFocus placeholder="NIM" />
              </label>
              <label className="block">
                <span className="mb-2 block text-xs font-medium text-secondary-ink">Password</span>
                <span className="relative block">
                  <input className="control h-12 w-full px-4 pr-12 text-sm" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Password" />
                  <button
                    type="button"
                    className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-xl text-muted-ink transition-colors hover:bg-surface-subtle hover:text-ink"
                    aria-label={showPassword ? "Sembunyikan password" : "Lihat password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((current) => !current)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </span>
              </label>
              {error ? (
                <div role="alert" className="flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft px-3 py-2.5 text-xs leading-5 text-danger">
                  <CircleAlert size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}
              <button type="submit" disabled={submitting} className="login-submit inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium disabled:opacity-60">
                {submitting ? <LoaderCircle size={16} className="animate-spin" /> : <LogIn size={16} />}
                {submitting ? "Menghubungkan ke SIAKAD" : "Masuk dan muat tugas"}
              </button>
              <p className="text-center text-[11px] leading-5 text-muted-ink">Password dipakai hanya untuk login SIAKAD</p>
            </form>
          </div>

          <aside className="login-preview hidden min-h-0 overflow-y-auto border-l border-line p-6 lg:flex lg:flex-col" aria-label="Pratinjau tugas">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <ListChecks size={17} className="text-accent" />
                Tugas terdekat
              </div>
              <p className="mt-2 text-xs leading-5 text-secondary-ink">Deadline dan status dari SPADA</p>
            </div>
            <div className="mt-6 space-y-3">
              {previewTasks.slice(0, 3).map((task) => {
                const course = previewCourses.find((item) => item.id === task.courseId);
                const deadline = getDeadlineState(task.dueAt, task.status, task.submittedAt);
                return (
                  <div key={task.id} className="login-preview-card relative overflow-hidden rounded-2xl p-4 pl-5">
                    <span className={cn("deadline-line", previewDeadlineLine[deadline.tone])} />
                    <div className="flex items-center justify-between gap-3 text-[11px] text-muted-ink">
                      <span className="font-mono">{course?.code ?? "SPADA"}</span>
                      <ArrowUpRight size={14} />
                    </div>
                    <h3 className="mt-2 text-sm font-medium leading-5 text-ink">{task.title}</h3>
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-secondary-ink">
                      <Clock3 size={13} />
                      <span className="font-mono tabular-nums">{task.dueAt ? formatDeadline(task.dueAt) : "Tanpa deadline"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-auto pt-8">
              <p className="text-xs leading-5 text-secondary-ink">Garis warna menandai tenggat setiap tugas</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-ink">Tugas tanpa deadline tetap ditampilkan</p>
            </div>
          </aside>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function TaskDashboard({
  initialTasks,
  initialCourses,
  user,
  connection,
}: TaskDashboardProps) {
  const [taskState, setTaskState] = useState<TaskState>(() => user ? {
    statuses: {},
    ...(initialTasks.length || initialCourses.length ? {
      cache: { courses: initialCourses, tasks: initialTasks, syncedAt: connection.lastSyncedAt ?? new Date(0).toISOString() },
    } : {}),
    updatedAt: connection.lastSyncedAt ?? new Date(0).toISOString(),
  } : emptyTaskState());
  const [account, setAccount] = useState(user);
  const [connected, setConnected] = useState(connection.connected);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncPartial, setSyncPartial] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncErrorCode, setSyncErrorCode] = useState<string | undefined>();
  const [stateReady, setStateReady] = useState(!user);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(user ? "loading" : "offline");
  const router = useRouter();
  const taskStateRef = useRef(taskState);
  const accountGenerationRef = useRef(0);
  const activeNimRef = useRef(user?.nim ?? null);
  const requestControllersRef = useRef(new Set<AbortController>());
  const syncInFlight = useRef<AccountRequest | null>(null);
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudSaveInFlight = useRef<AccountRequest | null>(null);
  const pendingCloudSave = useRef<PendingCloudSave | null>(null);

  const tasks = useMemo(() => taskState.cache?.tasks ?? (connected ? [] : initialTasks), [taskState.cache, connected, initialTasks]);
  const courses = useMemo(() => taskState.cache?.courses ?? (connected ? [] : initialCourses), [taskState.cache, connected, initialCourses]);
  const lastSyncedAt = taskState.cache?.syncedAt ?? connection.lastSyncedAt;
  const localStatuses = useMemo(() => statusMap(taskState), [taskState]);

  const applyTaskState = useCallback((next: TaskState) => {
    taskStateRef.current = next;
    setTaskState(next);
  }, []);

  const invalidateAccountRequests = useCallback(() => {
    accountGenerationRef.current += 1;
    for (const controller of requestControllersRef.current) controller.abort();
    requestControllersRef.current.clear();
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    cloudSaveTimer.current = null;
    cloudSaveInFlight.current = null;
    pendingCloudSave.current = null;
    syncInFlight.current = null;
    setSyncing(false);
  }, []);

  const saveCloudState = useCallback(async function persist(state: TaskState, nim = account?.nim, generation = accountGenerationRef.current) {
    if (!nim || activeNimRef.current !== nim || accountGenerationRef.current !== generation) return;
    if (cloudSaveInFlight.current) {
      pendingCloudSave.current = { state, nim, generation };
      return;
    }

    const controller = new AbortController();
    const operation: AccountRequest = { nim, generation, controller };
    cloudSaveInFlight.current = operation;
    requestControllersRef.current.add(controller);
    setCloudStatus("saving");
    const isCurrent = () => cloudSaveInFlight.current === operation
      && activeNimRef.current === nim
      && accountGenerationRef.current === generation;
    try {
      const response = await fetch("/api/task-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
        signal: controller.signal,
      });
      const result = (await response.json()) as { ok: boolean; configured?: boolean; state?: unknown; message?: string };
      if (!isCurrent()) return;
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Data belum tersimpan.");
      const remote = parseTaskState(result.state);
      if (remote) applyTaskState(mergeTaskStates(taskStateRef.current, remote));
      setCloudStatus(result.configured === false ? "offline" : "saved");
    } catch {
      if (isCurrent()) setCloudStatus("error");
    } finally {
      requestControllersRef.current.delete(controller);
      if (cloudSaveInFlight.current === operation) {
        cloudSaveInFlight.current = null;
        const pending = pendingCloudSave.current;
        pendingCloudSave.current = null;
        if (pending) void persist(pending.state, pending.nim, pending.generation);
      }
    }
  }, [account?.nim, applyTaskState]);

  const queueCloudSave = useCallback(() => {
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    const nim = activeNimRef.current;
    const generation = accountGenerationRef.current;
    cloudSaveTimer.current = setTimeout(() => {
      cloudSaveTimer.current = null;
      if (nim && activeNimRef.current === nim && accountGenerationRef.current === generation) {
        void saveCloudState(taskStateRef.current, nim, generation);
      }
    }, 250);
  }, [saveCloudState]);

  const commitTaskState = useCallback((next: TaskState) => {
    applyTaskState(next);
    const nim = activeNimRef.current;
    if (!nim) return;
    try {
      localStorage.setItem(`paanz-state:${nim}`, JSON.stringify(next));
    } catch {
      return;
    }
    queueCloudSave();
  }, [applyTaskState, queueCloudSave]);

  useEffect(() => {
    const nim = account?.nim;
    if (!nim) return;

    let cancelled = false;
    let localApplied = false;
    let migrationChecked = false;
    const controller = new AbortController();
    const requestControllers = requestControllersRef.current;
    requestControllers.add(controller);
    const local = readLocalTaskState(nim);

    function currentState() {
      const current = localApplied ? taskStateRef.current : local;
      localApplied = true;
      return current;
    }

    async function refreshCloudState() {
      try {
        const response = await fetch("/api/task-state", { cache: "no-store", signal: controller.signal });
        const result = (await response.json()) as { ok: boolean; configured?: boolean; state?: unknown };
        if (!response.ok || !result.ok) throw new Error("Cloud state unavailable");
        if (cancelled) return;
        if (result.configured === false) {
          if (!localApplied) {
            applyTaskState(local);
            localApplied = true;
          }
          setCloudStatus("offline");
          return;
        }
        const current = currentState();
        const remote = parseTaskState(result.state) ?? emptyTaskState();
        const merged = mergeTaskStates(current, remote);
        applyTaskState(merged);
        setCloudStatus("saved");
        if (!migrationChecked) {
          migrationChecked = true;
          if (Date.parse(local.updatedAt) > Date.parse(remote.updatedAt)) void saveCloudState(merged);
        }
      } catch {
        if (!cancelled) {
          if (!localApplied) applyTaskState(local);
          setCloudStatus("error");
        }
      }
    }

    void refreshCloudState().finally(() => {
      if (!cancelled) setStateReady(true);
    });
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refreshCloudState();
    }, 30_000);
    const onFocus = () => void refreshCloudState();
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      controller.abort();
      requestControllers.delete(controller);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [account?.nim, applyTaskState, saveCloudState]);

  useEffect(() => () => {
    accountGenerationRef.current += 1;
    for (const controller of requestControllersRef.current) controller.abort();
    requestControllersRef.current.clear();
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    cloudSaveInFlight.current = null;
    pendingCloudSave.current = null;
    syncInFlight.current = null;
  }, []);

  const tasksWithStatus = useMemo(
    () => tasks.map((task) => ({ ...task, status: task.status === "submitted" ? "submitted" : localStatuses[task.id] ?? task.status })),
    [tasks, localStatuses],
  );

  const handleSync = useCallback(async (silent = false) => {
    const nim = account?.nim;
    const generation = accountGenerationRef.current;
    if (!nim || activeNimRef.current !== nim) {
      if (!silent) toast.error("Masuk dengan SIAKAD terlebih dahulu.");
      return;
    }
    if (syncInFlight.current) return;
    const controller = new AbortController();
    const operation: AccountRequest = { nim, generation, controller };
    syncInFlight.current = operation;
    requestControllersRef.current.add(controller);
    setSyncing(true);
    setSyncPartial(false);
    setSyncError("");
    setSyncErrorCode(undefined);
    const isCurrent = () => syncInFlight.current === operation
      && activeNimRef.current === nim
      && accountGenerationRef.current === generation;
    let failureCode: string | undefined;
    try {
      const response = await fetch("/api/spada/sync", { method: "POST", signal: controller.signal });
      const result = (await response.json()) as SyncPayload & { ok: boolean; code?: string; message?: string };
      if (!isCurrent()) return;
      if (!response.ok || !result.ok) {
        failureCode = result.code;
        throw new Error(result.message ?? "Sinkronisasi gagal.");
      }
      commitTaskState(mergeTaskStates(taskStateRef.current, {
        statuses: {},
        cache: result,
        updatedAt: result.syncedAt,
      }));
      setSyncPartial(Boolean(result.partial));
      if (!silent) toast.success(`${result.tasks.length} tugas diperbarui dari SPADA`);
    } catch (error) {
      if (!isCurrent()) return;
      const message = error instanceof Error ? error.message : "Sinkronisasi SPADA gagal.";
      setSyncError(message);
      setSyncErrorCode(failureCode);
      if (!silent) toast.error(message);
    } finally {
      requestControllersRef.current.delete(controller);
      if (syncInFlight.current === operation) {
        syncInFlight.current = null;
        setSyncing(false);
      }
    }
  }, [account?.nim, commitTaskState]);

  useEffect(() => {
    if (!stateReady || !connected || !account?.nim) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void handleSync(true);
    };
    refresh();
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [stateReady, connected, account, handleSync]);

  function handleLogin(nextUser: DashboardUser) {
    invalidateAccountRequests();
    activeNimRef.current = nextUser.nim;
    setStateReady(false);
    setCloudStatus("loading");
    setAccount(nextUser);
    setConnected(true);
    setLoginOpen(false);
    applyTaskState(emptyTaskState());
    setSyncError("");
    setSyncErrorCode(undefined);
    setSelectedTaskId(null);
    toast.success("Akun SIAKAD terhubung");
  }

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout gagal.");
      invalidateAccountRequests();
      activeNimRef.current = null;
      setStateReady(true);
      setAccount(null);
      setConnected(false);
      applyTaskState(emptyTaskState());
      setCloudStatus("offline");
      setSyncError("");
      setSyncErrorCode(undefined);
      setSelectedTaskId(null);
      setStatusFilter("all");
      setCourseFilter("all");
      setQuery("");
      router.refresh();
    } catch {
      toast.error("Gagal keluar. Coba lagi.");
    }
  }

  function handleStatusChange(taskId: string, status: TaskStatus) {
    if (status === "submitted") return;
    const updatedAt = new Date().toISOString();
    const entry: TaskStatusEntry = { status, updatedAt };
    commitTaskState({
      ...taskStateRef.current,
      statuses: { ...taskStateRef.current.statuses, [taskId]: entry },
      updatedAt,
    });
  }

  function handleSubmitted(taskId: string, submittedAt: string, attachments: { instructorFiles: TaskAttachment[]; submissionFiles: TaskAttachment[] } | undefined, nim: string) {
    if (activeNimRef.current !== nim) return;
    const updatedAt = new Date().toISOString();
    commitTaskState({
      ...taskStateRef.current,
      statuses: { ...taskStateRef.current.statuses, [taskId]: { status: "submitted", updatedAt } },
      cache: taskStateRef.current.cache ? {
        ...taskStateRef.current.cache,
        tasks: taskStateRef.current.cache.tasks.map((task) => task.id === taskId ? { ...task, status: "submitted", submittedAt, ...attachments } : task),
      } : undefined,
      updatedAt,
    });
  }

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tasksWithStatus
      .filter((task) => statusFilter === "all" || task.status === statusFilter)
      .filter((task) => courseFilter === "all" || task.courseId === courseFilter)
      .filter((task) => {
        const course = courses.find((item) => item.id === task.courseId);
        return !normalizedQuery || `${task.title} ${course?.name ?? ""} ${course?.code ?? ""}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => {
        const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });
  }, [tasksWithStatus, statusFilter, courseFilter, query, courses]);

  const groupedTasks = useMemo(() => {
    const groups = new Map<string, { course?: Course; tasks: Task[] }>();
    for (const task of filteredTasks) {
      const course = courses.find((item) => item.id === task.courseId);
      const key = course?.id ?? task.courseId;
      const group = groups.get(key) ?? { course, tasks: [] };
      group.tasks.push(task);
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [filteredTasks, courses]);

  const counts = useMemo(() => {
    const total = tasksWithStatus.length;
    const done = tasksWithStatus.filter((task) => task.status === "done" || task.status === "submitted").length;
    const submitted = tasksWithStatus.filter((task) => task.status === "submitted").length;
    const overduePending = tasksWithStatus.filter((task) => task.status !== "submitted" && getDeadlineState(task.dueAt, task.status).isLate).length;
    const lateSubmitted = tasksWithStatus.filter((task) => task.status === "submitted" && getDeadlineState(task.dueAt, task.status, task.submittedAt).isLate).length;
    const dueSoon = tasksWithStatus.filter((task) => {
      if (!task.dueAt || task.status === "submitted") return false;
      const deadline = getDeadlineState(task.dueAt, task.status);
      return deadline.hours >= 0 && deadline.hours <= 72;
    }).length;
    return { total, done, submitted, dueSoon, overduePending, lateSubmitted, progress: total ? Math.round((done / total) * 100) : 0 };
  }, [tasksWithStatus]);

  const selectedTask = tasksWithStatus.find((task) => task.id === selectedTaskId) ?? null;
  const selectedCourse = courses.find((course) => course.id === selectedTask?.courseId);
  const cloudLabel = cloudStatus === "saving" ? "Menyimpan" : cloudStatus === "saved" ? "Tersimpan" : cloudStatus === "error" ? "Belum tersimpan" : cloudStatus === "loading" ? "Memuat" : "Perangkat";
  const CloudIcon = cloudStatus === "saved" ? CloudCheck : cloudStatus === "offline" ? CloudOff : cloudStatus === "error" ? CloudOff : Cloud;

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-[68px] max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Brand />
          <label className="relative ml-auto hidden w-full max-w-sm md:block">
            <span className="sr-only">Cari tugas</span>
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-ink" />
            <input className="control w-full pl-10 pr-4 text-sm" placeholder="Cari tugas" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {account ? (
              <span className={cn("hidden items-center gap-1.5 text-xs text-muted-ink sm:inline-flex", cloudStatus === "error" && "text-danger")} title={cloudLabel}>
                <CloudIcon size={15} /> {cloudLabel}
              </span>
            ) : null}
            <ThemeToggle />
            {account ? (
              <div className="flex items-center gap-1">
                <div className="hidden size-10 items-center justify-center rounded-full bg-accent-soft text-xs font-medium text-accent sm:flex" aria-label={account.name}>
                  {initials(account.name, account.nim)}
                </div>
                <button className="icon-button" type="button" aria-label="Keluar dari akun" onClick={() => void handleLogout()}><LogOut size={18} /></button>
              </div>
            ) : (
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 text-sm font-medium text-ink shadow-[inset_0_1px_0_var(--glass-rim)] transition-colors hover:bg-surface-subtle sm:px-4" onClick={() => setLoginOpen(true)}>
                <LogIn size={16} /> <span className="hidden sm:inline">Masuk SIAKAD</span><span className="sm:hidden">Masuk</span>
              </button>
            )}
          </div>
        </div>
        <div className="border-t border-line px-4 py-3 md:hidden">
          <label className="relative block">
            <span className="sr-only">Cari tugas</span>
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-ink" />
            <input className="control w-full pl-10 pr-4 text-sm" placeholder="Cari tugas" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6 sm:pt-8">
        <section className="task-enter flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-medium tracking-tight text-ink sm:text-3xl">Tugas saya</h1>
              {!connected ? <span className="text-[11px] text-muted-ink">Pratinjau</span> : null}
            </div>
            <p className="mt-2 text-sm text-secondary-ink">{counts.total} tugas · {courses.length} mata kuliah</p>
          </div>
          <div className="flex flex-col items-start gap-1 text-xs text-muted-ink sm:items-end">
            <div className="flex items-center gap-2" role="status" aria-live="polite">
              {syncing ? <LoaderCircle size={15} className="animate-spin" /> : <Cloud size={15} />}
              {syncing ? "Memperbarui otomatis" : lastSyncedAt ? `Diperbarui ${formatSyncTime(lastSyncedAt)}` : "Menunggu pembaruan"}
            </div>
            {syncPartial ? <span>Sebagian data belum dapat dimuat</span> : null}
          </div>
        </section>

        {syncError ? (
          <section role="alert" className="glass-soft task-enter mt-6 flex flex-col gap-4 rounded-2xl border-danger/20 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-medium text-ink">Tugas belum berhasil dimuat</h2>
              <p className="mt-1 text-xs leading-5 text-secondary-ink">{syncError}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              {syncErrorCode === "AUTH_REQUIRED" || syncErrorCode === "SESSION_EXPIRED" ? (
                <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-medium text-on-accent" onClick={() => setLoginOpen(true)}>
                  <LogIn size={16} /> Masuk kembali
                </button>
              ) : null}
              <button type="button" className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors",
                syncErrorCode === "AUTH_REQUIRED" || syncErrorCode === "SESSION_EXPIRED"
                  ? "border border-line bg-surface-raised text-ink hover:bg-surface-subtle"
                  : "bg-accent text-on-accent",
              )} onClick={() => void handleSync()}>
                <RefreshCw size={16} /> Coba lagi
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-12" aria-label="Ringkasan tugas">
          <div className="glass task-enter flex items-center gap-5 rounded-[24px] p-5 md:col-span-6 sm:p-6">
            <div className="relative size-16 shrink-0">
              <svg viewBox="0 0 48 48" className="size-16 -rotate-90" aria-hidden="true">
                <circle cx="24" cy="24" r="20" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle cx="24" cy="24" r="20" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${counts.progress} ${100 - counts.progress}`} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-medium tabular-nums text-ink">{counts.progress}%</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-ink">Progres tugas</div>
              <div className="mt-1 text-3xl font-medium tabular-nums text-ink">{counts.done}<span className="text-lg font-normal text-muted-ink"> / {counts.total}</span></div>
              <div className="mt-1 text-xs text-secondary-ink">selesai dan sudah dikumpulkan</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 md:col-span-6">
            <div className="quiet-stat task-enter rounded-[20px] p-5">
              <div className="text-xs text-muted-ink">Tenggat dekat</div>
              <div className="mt-3 text-3xl font-medium tabular-nums text-ink">{counts.dueSoon}</div>
              <div className="mt-2 text-xs text-secondary-ink">dalam 3 hari</div>
            </div>
            <div className="quiet-stat task-enter rounded-[20px] p-5">
              <div className="text-xs text-muted-ink">Belum terkumpul</div>
              <div className={cn("mt-3 text-3xl font-medium tabular-nums", counts.overduePending ? "text-danger" : "text-ink")}>{counts.overduePending}</div>
              <div className="mt-2 text-xs text-secondary-ink">sudah lewat tenggat</div>
            </div>
            <div className="quiet-stat task-enter rounded-[20px] p-5">
              <div className="text-xs text-muted-ink">Dikumpulkan</div>
              <div className="mt-3 text-3xl font-medium tabular-nums text-ink">{counts.submitted}</div>
              <div className="mt-2 text-xs text-secondary-ink">terkonfirmasi SPADA</div>
            </div>
            <div className="quiet-stat task-enter rounded-[20px] p-5">
              <div className="text-xs text-muted-ink">Terlambat terkumpul</div>
              <div className="mt-3 text-3xl font-medium tabular-nums text-success">{counts.lateSubmitted}</div>
              <div className="mt-2 text-xs text-secondary-ink">tetap sudah diterima</div>
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="segmented-control grid grid-cols-5 gap-1 rounded-2xl p-1 sm:inline-flex" role="group" aria-label="Filter status tugas">
              {filterItems.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={statusFilter === item.value}
                  className="segmented-item inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl px-2 text-[11px] font-medium sm:shrink-0 sm:px-3 sm:text-xs"
                  onClick={() => setStatusFilter(item.value)}
                >
                  {item.value === "all" ? <LayoutList size={15} className="hidden sm:block" /> : item.value === "todo" ? <Circle size={15} className="hidden sm:block" /> : item.value === "doing" ? <LoaderCircle size={15} className="hidden sm:block" /> : <CheckCircle2 size={15} className="hidden sm:block" />}
                  {item.label}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="course-filter">Filter mata kuliah</label>
            <select id="course-filter" className="control min-w-0 max-w-full px-3 text-xs sm:max-w-64" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
              <option value="all">Semua mata kuliah</option>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          </div>

          <div className="space-y-8">
            {groupedTasks.map((group) => {
              const sectionId = `course-section-${group.course?.id ?? "lain"}`;
              return (
                <section key={sectionId} className="space-y-3" aria-labelledby={sectionId}>
                  <div className="flex items-center gap-3 px-1">
                    <BookOpen size={17} className="shrink-0 text-muted-ink" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <h2 id={sectionId} className="text-sm font-medium text-ink">{group.course?.name ?? "Mata kuliah lain"}</h2>
                        {group.course?.code ? <span className="font-mono text-[11px] text-muted-ink">{group.course.code}</span> : null}
                      </div>
                    </div>
                    <span className="font-mono text-xs tabular-nums text-muted-ink" aria-label={`${group.tasks.length} tugas`}>{group.tasks.length}</span>
                  </div>
                  {group.tasks.map((task, index) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      course={group.course}
                      index={index}
                      onOpen={(item) => setSelectedTaskId(item.id)}
                      onStatusChange={handleStatusChange}
                    />
                  ))}
                </section>
              );
            })}
          </div>

          {!filteredTasks.length ? (
            <div className="glass-soft rounded-2xl px-6 py-12 text-center">
              <Search size={24} className="mx-auto mb-3 text-muted-ink" />
              <h2 className="text-sm font-medium text-ink">Tugas tidak ditemukan</h2>
              <p className="mt-2 text-xs leading-5 text-secondary-ink">Ubah kata kunci atau filter</p>
              <button type="button" className="mt-4 min-h-11 rounded-xl px-4 text-xs font-medium text-accent" onClick={() => { setQuery(""); setStatusFilter("all"); setCourseFilter("all"); }}>Reset filter</button>
            </div>
          ) : null}
        </section>
      </main>

      <SiakadLoginDialog
        open={loginOpen}
        onOpenChange={setLoginOpen}
        onSuccess={handleLogin}
        previewTasks={initialTasks}
        previewCourses={initialCourses}
      />
      <TaskDetailDialog
        key={selectedTask?.id ?? "no-task"}
        task={selectedTask}
        course={selectedCourse}
        connected={connected}
        accountNim={account?.nim}
        onClose={() => setSelectedTaskId(null)}
        onStatusChange={handleStatusChange}
        onSubmitted={handleSubmitted}
      />
    </div>
  );
}
