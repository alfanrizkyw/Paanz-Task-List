"use client";

import {
  CheckCircle2,
  Circle,
  Cloud,
  CloudCheck,
  CloudOff,
  Eye,
  EyeOff,
  KeyRound,
  LayoutList,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  UserRound,
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
import type { Course, SpadaConnection, SyncPayload, Task, TaskState, TaskStatus, TaskStatusEntry } from "@/lib/types";
import { cn, formatSyncTime, getDeadlineState } from "@/lib/utils";

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

const filterItems: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Semua" },
  { value: "todo", label: "Belum" },
  { value: "doing", label: "Dikerjakan" },
  { value: "done", label: "Selesai" },
];

const validStatuses = new Set<TaskStatus>(["todo", "doing", "done", "submitted"]);

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="glass-soft flex size-10 items-center justify-center rounded-2xl text-accent">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v12.5H7.5A2.5 2.5 0 0 1 5 17V4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M8 8.5h6M8 12h6M8 15.5h3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="m15.5 16 1.6 1.6 3.2-3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold leading-5 text-ink">
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (user: DashboardUser) => void;
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
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 shadow-2xl sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold text-ink">Masuk SIAKAD</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-secondary-ink">
                Memuat mata kuliah dan tugas Anda
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button -mr-2 -mt-2" aria-label="Tutup login"><X size={18} /></Dialog.Close>
          </div>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-secondary-ink">NIM</span>
              <span className="relative block">
                <UserRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-ink" />
                <input className="control w-full pl-10" name="nim" type="text" inputMode="numeric" autoComplete="username" pattern="[0-9]{6,20}" minLength={6} maxLength={20} required autoFocus placeholder="NIM mahasiswa" />
              </span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-medium text-secondary-ink">Password</span>
              <span className="relative block">
                <KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-ink" />
                <input className="control w-full pl-10 pr-12" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required placeholder="Password SIAKAD" />
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
            {error ? <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs leading-5 text-danger">{error}</p> : null}
            <button type="submit" disabled={submitting} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent transition-colors hover:brightness-95 disabled:opacity-60">
              {submitting ? <LoaderCircle size={16} className="animate-spin" /> : <LogIn size={16} />}
              {submitting ? "Menghubungkan ke SIAKAD" : "Masuk dan muat tugas"}
            </button>
          </form>
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
  const [syncError, setSyncError] = useState("");
  const [syncErrorCode, setSyncErrorCode] = useState<string | undefined>();
  const [stateReady, setStateReady] = useState(!user);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(user ? "loading" : "offline");
  const router = useRouter();
  const taskStateRef = useRef(taskState);
  const syncInFlight = useRef(false);
  const autoSyncStarted = useRef(false);
  const cloudSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cloudSaveInFlight = useRef(false);
  const pendingCloudSave = useRef<TaskState | null>(null);

  const tasks = useMemo(() => taskState.cache?.tasks ?? (connected ? [] : initialTasks), [taskState.cache, connected, initialTasks]);
  const courses = useMemo(() => taskState.cache?.courses ?? (connected ? [] : initialCourses), [taskState.cache, connected, initialCourses]);
  const lastSyncedAt = taskState.cache?.syncedAt ?? connection.lastSyncedAt;
  const localStatuses = useMemo(() => statusMap(taskState), [taskState]);

  const applyTaskState = useCallback((next: TaskState) => {
    taskStateRef.current = next;
    setTaskState(next);
  }, []);

  const saveCloudState = useCallback(async function persist(state: TaskState) {
    const nim = account?.nim;
    if (!nim) return;
    if (cloudSaveInFlight.current) {
      pendingCloudSave.current = state;
      return;
    }

    cloudSaveInFlight.current = true;
    setCloudStatus("saving");
    try {
      const response = await fetch("/api/task-state", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      const result = (await response.json()) as { ok: boolean; configured?: boolean; state?: unknown; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Data belum tersimpan.");
      const remote = parseTaskState(result.state);
      if (remote) applyTaskState(mergeTaskStates(taskStateRef.current, remote));
      setCloudStatus(result.configured === false ? "offline" : "saved");
    } catch {
      setCloudStatus("error");
    } finally {
      cloudSaveInFlight.current = false;
      const pending = pendingCloudSave.current;
      pendingCloudSave.current = null;
      if (pending) void persist(pending);
    }
  }, [account?.nim, applyTaskState]);

  const queueCloudSave = useCallback(() => {
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
    cloudSaveTimer.current = setTimeout(() => {
      void saveCloudState(taskStateRef.current);
    }, 250);
  }, [saveCloudState]);

  const commitTaskState = useCallback((next: TaskState) => {
    applyTaskState(next);
    const nim = account?.nim;
    if (!nim) return;
    try {
      localStorage.setItem(`paanz-state:${nim}`, JSON.stringify(next));
    } catch {
      return;
    }
    queueCloudSave();
  }, [account?.nim, applyTaskState, queueCloudSave]);

  useEffect(() => {
    const nim = account?.nim;
    if (!nim) return;

    let cancelled = false;
    let localApplied = false;
    let migrationChecked = false;
    const local = readLocalTaskState(nim);

    function currentState() {
      const current = localApplied ? taskStateRef.current : local;
      localApplied = true;
      return current;
    }

    async function refreshCloudState() {
      try {
        const response = await fetch("/api/task-state", { cache: "no-store" });
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
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [account?.nim, applyTaskState, saveCloudState]);

  useEffect(() => () => {
    if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
  }, []);

  const tasksWithStatus = useMemo(
    () => tasks.map((task) => ({ ...task, status: task.status === "submitted" ? "submitted" : localStatuses[task.id] ?? task.status })),
    [tasks, localStatuses],
  );

  const handleSync = useCallback(async (silent = false) => {
    if (!account?.nim) {
      if (!silent) toast.error("Masuk dengan SIAKAD terlebih dahulu.");
      return;
    }
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    setSyncError("");
    setSyncErrorCode(undefined);
    let failureCode: string | undefined;
    try {
      const response = await fetch("/api/spada/sync", { method: "POST" });
      const result = (await response.json()) as SyncPayload & { ok: boolean; code?: string; message?: string };
      if (!response.ok || !result.ok) {
        failureCode = result.code;
        throw new Error(result.message ?? "Sinkronisasi gagal.");
      }
      commitTaskState(mergeTaskStates(taskStateRef.current, {
        statuses: {},
        cache: result,
        updatedAt: result.syncedAt,
      }));
      if (!silent) toast.success(`${result.tasks.length} tugas diperbarui dari SPADA`);
      if (result.partial) toast.warning("Sebagian data belum dapat dimuat. Coba sinkronkan kembali.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sinkronisasi SPADA gagal.";
      setSyncError(message);
      setSyncErrorCode(failureCode);
      toast.error(message);
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }
  }, [account?.nim, commitTaskState]);

  useEffect(() => {
    if (stateReady && connected && account?.nim && !autoSyncStarted.current) {
      autoSyncStarted.current = true;
      void handleSync(true);
    }
  }, [stateReady, connected, account, handleSync]);

  function handleLogin(nextUser: DashboardUser) {
    autoSyncStarted.current = false;
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
      if (cloudSaveTimer.current) clearTimeout(cloudSaveTimer.current);
      autoSyncStarted.current = false;
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

  function handleSubmitted(taskId: string, submittedAt: string) {
    const updatedAt = new Date().toISOString();
    commitTaskState({
      ...taskStateRef.current,
      statuses: { ...taskStateRef.current.statuses, [taskId]: { status: "submitted", updatedAt } },
      cache: taskStateRef.current.cache ? {
        ...taskStateRef.current.cache,
        tasks: taskStateRef.current.cache.tasks.map((task) => task.id === taskId ? { ...task, submittedAt } : task),
      } : undefined,
      updatedAt,
    });
  }

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return tasksWithStatus
      .filter((task) => statusFilter === "all" || task.status === statusFilter || (statusFilter === "done" && task.status === "submitted"))
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

  const counts = useMemo(() => {
    const total = tasksWithStatus.length;
    const done = tasksWithStatus.filter((task) => task.status === "done" || task.status === "submitted").length;
    const submitted = tasksWithStatus.filter((task) => task.status === "submitted").length;
    const dueSoon = tasksWithStatus.filter((task) => {
      if (!task.dueAt || task.status === "submitted" || task.status === "done") return false;
      const deadline = getDeadlineState(task.dueAt);
      return deadline.hours >= 0 && deadline.hours <= 72;
    }).length;
    return { total, done, submitted, dueSoon, progress: total ? Math.round((done / total) * 100) : 0 };
  }, [tasksWithStatus]);

  const selectedTask = tasksWithStatus.find((task) => task.id === selectedTaskId) ?? null;
  const selectedCourse = courses.find((course) => course.id === selectedTask?.courseId);
  const cloudLabel = cloudStatus === "saving" ? "Menyimpan" : cloudStatus === "saved" ? "Tersimpan" : cloudStatus === "error" ? "Belum tersimpan" : cloudStatus === "loading" ? "Memuat" : "Perangkat";
  const CloudIcon = cloudStatus === "saved" ? CloudCheck : cloudStatus === "offline" ? CloudOff : cloudStatus === "error" ? CloudOff : Cloud;

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-3 px-4 sm:px-6">
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
            {connected ? (
              <>
                <button
                  type="button"
                  className="icon-button md:hidden"
                  aria-label={syncing ? "Menyinkronkan" : "Sinkronkan tugas"}
                  disabled={syncing}
                  onClick={() => void handleSync()}
                >
                  <RefreshCw size={18} className={syncing ? "animate-spin" : ""} />
                </button>
                <button
                  type="button"
                  className="hidden min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent transition-[background-color,transform] hover:brightness-95 active:scale-[0.98] disabled:opacity-60 md:inline-flex"
                  disabled={syncing}
                  onClick={() => void handleSync()}
                >
                  <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
                  {syncing ? "Menyinkronkan" : "Sinkronkan"}
                </button>
              </>
            ) : null}
            <ThemeToggle />
            {account ? (
              <div className="flex items-center gap-1">
                <div className="hidden size-10 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent sm:flex" aria-label={account.name}>
                  {initials(account.name, account.nim)}
                </div>
                <button className="icon-button" type="button" aria-label="Keluar dari akun" onClick={() => void handleLogout()}><LogOut size={18} /></button>
              </div>
            ) : (
              <button type="button" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface-raised px-3 text-sm font-medium text-ink transition-colors hover:bg-surface-subtle sm:px-4" onClick={() => setLoginOpen(true)}>
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
              <h1 className="text-2xl font-semibold text-ink sm:text-3xl">Tugas saya</h1>
              {!connected ? <span className="rounded-lg bg-surface-subtle px-2 py-1 text-[11px] text-muted-ink">Contoh</span> : null}
            </div>
            <p className="mt-2 text-sm text-secondary-ink">{counts.total} tugas · {courses.length} mata kuliah</p>
          </div>
          {lastSyncedAt ? (
            <div className="flex items-center gap-2 text-xs text-muted-ink">
              <Cloud size={15} /> Sinkron {formatSyncTime(lastSyncedAt)}
            </div>
          ) : null}
        </section>

        {syncError ? (
          <section role="alert" className="glass-soft task-enter mt-6 flex flex-col gap-4 rounded-2xl border-danger/20 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-ink">Tugas belum berhasil dimuat</h2>
              <p className="mt-1 text-xs leading-5 text-secondary-ink">{syncError}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              {syncErrorCode === "AUTH_REQUIRED" || syncErrorCode === "SESSION_EXPIRED" ? (
                <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent" onClick={() => setLoginOpen(true)}>
                  <LogIn size={16} /> Masuk kembali
                </button>
              ) : null}
              <button type="button" className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
                syncErrorCode === "AUTH_REQUIRED" || syncErrorCode === "SESSION_EXPIRED"
                  ? "border border-line bg-surface-raised text-ink hover:bg-surface-subtle"
                  : "bg-accent text-on-accent",
              )} onClick={() => void handleSync()}>
                <RefreshCw size={16} /> Coba lagi
              </button>
            </div>
          </section>
        ) : null}

        <section className="mt-6 grid gap-4 sm:grid-cols-3" aria-label="Ringkasan tugas">
          <div className="glass-soft task-enter flex items-center gap-4 rounded-2xl p-5">
            <div className="relative size-14 shrink-0">
              <svg viewBox="0 0 44 44" className="size-14 -rotate-90" aria-hidden="true">
                <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="3" />
                <circle cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${counts.progress} ${100 - counts.progress}`} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-medium tabular-nums text-ink">{counts.progress}%</span>
            </div>
            <div>
              <div className="text-xs text-muted-ink">Progres</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{counts.done}<span className="text-base font-normal text-muted-ink"> / {counts.total}</span></div>
              <div className="mt-1 text-xs text-secondary-ink">selesai</div>
            </div>
          </div>
          <div className="glass-soft task-enter rounded-2xl p-5">
            <div className="text-xs text-muted-ink">Tenggat dekat</div>
            <div className="mt-3 text-3xl font-semibold tabular-nums text-ink">{counts.dueSoon}</div>
            <div className="mt-2 text-xs text-secondary-ink">dalam 3 hari</div>
          </div>
          <div className="glass-soft task-enter rounded-2xl p-5">
            <div className="text-xs text-muted-ink">Dikumpulkan</div>
            <div className="mt-3 text-3xl font-semibold tabular-nums text-ink">{counts.submitted}</div>
            <div className="mt-2 text-xs text-secondary-ink">terkonfirmasi SPADA</div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid grid-cols-4 gap-2 sm:flex" role="group" aria-label="Filter status tugas">
              {filterItems.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={cn(
                    "inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border px-2 text-[11px] font-medium transition-colors sm:shrink-0 sm:px-3 sm:text-xs",
                    statusFilter === item.value ? "border-accent/30 bg-accent-soft text-accent" : "border-line bg-surface text-secondary-ink hover:bg-surface-subtle hover:text-ink",
                  )}
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

          <div className="space-y-3">
            {filteredTasks.map((task, index) => (
              <TaskCard
                key={task.id}
                task={task}
                course={courses.find((course) => course.id === task.courseId)}
                index={index}
                onOpen={(item) => setSelectedTaskId(item.id)}
                onStatusChange={handleStatusChange}
              />
            ))}
          </div>

          {!filteredTasks.length ? (
            <div className="glass-soft rounded-2xl px-6 py-12 text-center">
              <Search size={24} className="mx-auto mb-3 text-muted-ink" />
              <h2 className="text-sm font-semibold text-ink">Tugas tidak ditemukan</h2>
              <p className="mt-2 text-xs leading-5 text-secondary-ink">Ubah kata kunci atau filter</p>
              <button type="button" className="mt-4 min-h-11 rounded-xl px-4 text-xs font-medium text-accent" onClick={() => { setQuery(""); setStatusFilter("all"); setCourseFilter("all"); }}>Reset filter</button>
            </div>
          ) : null}
        </section>
      </main>

      <SiakadLoginDialog open={loginOpen} onOpenChange={setLoginOpen} onSuccess={handleLogin} />
      <TaskDetailDialog
        task={selectedTask}
        course={selectedCourse}
        connected={connected}
        onClose={() => setSelectedTaskId(null)}
        onStatusChange={handleStatusChange}
        onSubmitted={handleSubmitted}
      />
    </div>
  );
}
