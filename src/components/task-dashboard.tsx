"use client";

import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Circle,
  Cloud,
  GraduationCap,
  KeyRound,
  LayoutList,
  LoaderCircle,
  LogIn,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
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
import type { Course, SpadaConnection, SyncPayload, Task, TaskStatus } from "@/lib/types";
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

const filterItems: Array<{ value: StatusFilter; label: string; icon: typeof Circle }> = [
  { value: "all", label: "Semua tugas", icon: LayoutList },
  { value: "todo", label: "Belum dikerjakan", icon: Circle },
  { value: "doing", label: "Sedang dikerjakan", icon: LoaderCircle },
  { value: "done", label: "Selesai", icon: CheckCircle2 },
];

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 items-center justify-center rounded-2xl bg-accent text-on-accent shadow-sm">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v12.5H7.5A2.5 2.5 0 0 1 5 17V4.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="M8 8.5h6M8 12h6M8 15.5h3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="m15.5 16 1.6 1.6 3.2-3.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div>
        <div className="text-[15px] font-semibold leading-5 tracking-tight text-ink">Paanz Task List</div>
        <div className="text-[11px] text-muted-ink">SPADA Polinema</div>
      </div>
    </div>
  );
}

function initials(name: string, nim: string) {
  const value = name.trim() || nim;
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-50 w-[calc(100%-32px)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 shadow-2xl sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold text-ink">Masuk ke SPADA</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-secondary-ink">
                Gunakan akun SIAKAD Polinema untuk memuat mata kuliah dan tugas Anda.
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
              <span className="mb-2 block text-xs font-medium text-secondary-ink">Password SIAKAD</span>
              <span className="relative block">
                <KeyRound size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-ink" />
                <input className="control w-full pl-10" name="password" type="password" autoComplete="current-password" minLength={6} required placeholder="Password akun" />
              </span>
            </label>
            {error ? <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-xs leading-5 text-danger">{error}</p> : null}
            <p className="flex items-start gap-2 text-[11px] leading-5 text-muted-ink">
              <ShieldCheck size={15} className="mt-0.5 shrink-0" />
              Password tidak disimpan. Sesi terenkripsi digunakan untuk sinkronisasi dan pengumpulan.
            </p>
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
  const [tasks, setTasks] = useState(initialTasks);
  const [courses, setCourses] = useState(initialCourses);
  const [localStatuses, setLocalStatuses] = useState<Record<string, TaskStatus>>({});
  const [account, setAccount] = useState(user);
  const [isDemo, setIsDemo] = useState(!connection.connected);
  const [connected, setConnected] = useState(connection.connected);
  const [connectedNim, setConnectedNim] = useState(connection.nim);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>(connection.lastSyncedAt);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [courseFilter, setCourseFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"deadline" | "course">("deadline");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [cacheReady, setCacheReady] = useState(!user);
  const router = useRouter();
  const syncInFlight = useRef(false);
  const autoSyncStarted = useRef(false);
  const loadedStatusKey = useRef<string | null>(null);

  const tasksWithStatus = useMemo(
    () => tasks.map((task) => ({ ...task, status: localStatuses[task.id] ?? task.status })),
    [tasks, localStatuses],
  );

  useEffect(() => {
    const nim = account?.nim;
    if (!nim) return;
    const frame = requestAnimationFrame(() => {
      try {
        const statusRaw = localStorage.getItem(`paanz-status:${nim}`);
        setLocalStatuses(statusRaw ? JSON.parse(statusRaw) as Record<string, TaskStatus> : {});
        loadedStatusKey.current = nim;
        const cacheRaw = localStorage.getItem(`paanz-cache:${nim}`);
        if (cacheRaw) {
          const cache = JSON.parse(cacheRaw) as SyncPayload;
          setTasks(cache.tasks);
          setCourses(cache.courses);
          setLastSyncedAt(cache.syncedAt);
          setIsDemo(false);
        }
      } catch {
        loadedStatusKey.current = nim;
        try {
          localStorage.removeItem(`paanz-status:${nim}`);
          localStorage.removeItem(`paanz-cache:${nim}`);
        } catch {
          setCacheReady(true);
          return;
        }
      }
      setCacheReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [account?.nim]);

  useEffect(() => {
    if (!account?.nim || loadedStatusKey.current !== account.nim) return;
    try {
      localStorage.setItem(`paanz-status:${account.nim}`, JSON.stringify(localStatuses));
    } catch {
      return;
    }
  }, [localStatuses, account?.nim]);

  const handleSync = useCallback(async (silent = false, nim = account?.nim) => {
    if (!nim) {
      if (!silent) toast.error("Masuk dengan SIAKAD terlebih dahulu.");
      return;
    }
    if (syncInFlight.current) return;
    syncInFlight.current = true;
    setSyncing(true);
    setSyncError("");
    try {
      const response = await fetch("/api/spada/sync", { method: "POST" });
      const result = (await response.json()) as SyncPayload & { ok: boolean; code?: string; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Sinkronisasi gagal.");
      setTasks(result.tasks);
      setCourses(result.courses);
      setLastSyncedAt(result.syncedAt);
      setIsDemo(false);
      try {
        localStorage.setItem(`paanz-cache:${nim}`, JSON.stringify(result));
      } catch {
        toast.warning("Tugas dimuat, tetapi cache perangkat tidak dapat disimpan.");
      }
      if (!silent) toast.success(`${result.tasks.length} tugas diperbarui dari SPADA`);
      if (result.partial) toast.warning("Sebagian data ditampilkan karena jumlahnya melebihi batas sinkronisasi.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sinkronisasi SPADA gagal.";
      setSyncError(message);
      toast.error(message);
    } finally {
      syncInFlight.current = false;
      setSyncing(false);
    }
  }, [account]);

  useEffect(() => {
    if (cacheReady && connected && account?.nim && !autoSyncStarted.current) {
      autoSyncStarted.current = true;
      void handleSync(true);
    }
  }, [cacheReady, connected, account, handleSync]);

  function handleLogin(nextUser: DashboardUser) {
    loadedStatusKey.current = null;
    autoSyncStarted.current = false;
    setCacheReady(false);
    setAccount(nextUser);
    setConnected(true);
    setConnectedNim(nextUser.nim);
    setLoginOpen(false);
    setLocalStatuses({});
    setTasks([]);
    setCourses([]);
    setIsDemo(false);
    setLastSyncedAt(undefined);
    setSyncError("");
    toast.success("Akun SIAKAD terhubung");
  }

  async function handleLogout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout gagal.");
      loadedStatusKey.current = null;
      autoSyncStarted.current = false;
      setCacheReady(true);
      setAccount(null);
      setConnected(false);
      setConnectedNim(undefined);
      setTasks(initialTasks);
      setCourses(initialCourses);
      setLocalStatuses({});
      setIsDemo(true);
      setLastSyncedAt(undefined);
      setSyncError("");
      setSelectedTaskId(null);
      setMobileMenu(false);
      router.refresh();
    } catch {
      toast.error("Gagal keluar. Coba lagi.");
    }
  }

  function handleStatusChange(taskId: string, status: TaskStatus) {
    if (status === "submitted") return;
    setLocalStatuses((current) => ({ ...current, [taskId]: status }));
  }

  function handleSubmitted(taskId: string, submittedAt: string) {
    setLocalStatuses((current) => ({ ...current, [taskId]: "submitted" }));
    setTasks((current) => current.map((task) => task.id === taskId ? { ...task, submittedAt } : task));
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
        if (sort === "course") return a.courseId.localeCompare(b.courseId);
        const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      });
  }, [tasksWithStatus, statusFilter, courseFilter, query, courses, sort]);

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
  const upcomingTasks = tasksWithStatus
    .filter((task): task is Task & { dueAt: string } => task.status !== "submitted" && task.status !== "done" && Boolean(task.dueAt))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 4);

  const sidebar = (
    <>
      <div className="px-5 pb-7 pt-6"><Brand /></div>
      <nav className="px-3" aria-label="Navigasi utama">
        <div className="px-3 pb-2 text-[11px] font-medium text-muted-ink">Tugas</div>
        <div className="space-y-1">
          {filterItems.map((item) => {
            const Icon = item.icon;
            const active = statusFilter === item.value;
            const count = item.value === "all"
              ? tasksWithStatus.length
              : item.value === "done"
                ? tasksWithStatus.filter((task) => task.status === "done" || task.status === "submitted").length
                : tasksWithStatus.filter((task) => task.status === item.value).length;
            return (
              <button
                key={item.value}
                type="button"
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition-colors",
                  active ? "bg-accent-soft font-medium text-accent" : "text-secondary-ink hover:bg-surface-subtle hover:text-ink",
                )}
                onClick={() => {
                  setStatusFilter(item.value);
                  setMobileMenu(false);
                }}
              >
                <Icon size={17} />
                <span className="flex-1">{item.label}</span>
                <span className="font-mono text-xs tabular-nums text-muted-ink">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 px-3 pb-2 text-[11px] font-medium text-muted-ink">Mata kuliah</div>
        <div className="space-y-1">
          {courses.map((course) => {
            const courseTasks = tasksWithStatus.filter((task) => task.courseId === course.id);
            const active = courseFilter === course.id;
            return (
              <button
                key={course.id}
                type="button"
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors",
                  active ? "bg-surface-subtle text-ink" : "text-secondary-ink hover:bg-surface-subtle hover:text-ink",
                )}
                onClick={() => {
                  setCourseFilter(active ? "all" : course.id);
                  setStatusFilter("all");
                  setMobileMenu(false);
                }}
              >
                <BookOpen size={17} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm">{course.name}</span>
                <span className="font-mono text-xs tabular-nums text-muted-ink">{courseTasks.length}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="mt-auto p-4">
        <div className="glass-soft rounded-2xl p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-ink">
            <span className={cn("size-2 rounded-full", connected ? "bg-success" : "bg-warning")} />
            {connected ? "SPADA terhubung" : "SPADA belum terhubung"}
          </div>
          <p className="mt-2 text-[11px] leading-5 text-muted-ink">
            {connected ? `NIM ${connectedNim ?? account?.nim ?? ""}`.trim() : "Hubungkan untuk tugas dan deadline asli"}
          </p>
          {connected ? (
            <button type="button" className="mt-3 inline-flex min-h-11 items-center gap-2 text-xs font-medium text-accent" onClick={() => void handleSync()}>
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} /> Sinkronkan sekarang
            </button>
          ) : null}
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="glass sticky top-0 hidden h-screen flex-col border-r lg:flex">{sidebar}</aside>

      {mobileMenu ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/30 backdrop-blur-sm" aria-label="Tutup menu" onClick={() => setMobileMenu(false)} />
          <aside className="glass relative flex h-full w-[min(88vw,320px)] flex-col border-r">
            <button className="icon-button absolute right-3 top-3 z-10" aria-label="Tutup menu" onClick={() => setMobileMenu(false)}><X size={18} /></button>
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="min-w-0">
        <header className="glass sticky top-0 z-30 border-b">
          <div className="mx-auto flex h-[72px] max-w-[1600px] items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button type="button" className="icon-button -ml-2 lg:hidden" aria-label="Buka menu" onClick={() => setMobileMenu(true)}><Menu size={20} /></button>
            <div className="lg:hidden"><Brand /></div>
            <label className="relative ml-auto hidden w-full max-w-sm sm:block lg:ml-0">
              <span className="sr-only">Cari tugas</span>
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-ink" />
              <input
                className="control w-full pl-10 pr-4 text-sm"
                placeholder="Cari tugas atau mata kuliah"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="ml-auto flex items-center gap-2 sm:ml-0">
              <button
                type="button"
                className="hidden min-h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent transition-[background-color,transform] hover:brightness-95 active:scale-[0.98] disabled:opacity-60 sm:inline-flex"
                disabled={syncing || !connected}
                onClick={() => void handleSync()}
              >
                <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
                {syncing ? "Menyinkronkan" : "Sinkronkan"}
              </button>
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
          <div className="border-t border-line px-4 py-3 sm:hidden">
            <label className="relative block">
              <span className="sr-only">Cari tugas</span>
              <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-ink" />
              <input
                className="control w-full pl-10 pr-4 text-sm"
                placeholder="Cari tugas atau mata kuliah"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
        </header>

        <main className="mx-auto max-w-[1600px] px-4 pb-12 pt-6 sm:px-6 sm:pt-8 lg:px-8">
          <section className="task-enter flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-accent"><GraduationCap size={15} /> Ruang tugas mahasiswa</div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Tugas minggu ini</h1>
              <p className="mt-2 text-sm leading-6 text-secondary-ink">Deadline terdekat dari semua mata kuliah, dalam satu tampilan.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-ink">
              <Cloud size={15} />
              <span>Terakhir sinkron: {formatSyncTime(lastSyncedAt)}</span>
            </div>
          </section>

          {syncError ? (
            <section role="alert" className="glass-soft task-enter mt-6 flex flex-col gap-4 rounded-2xl border-danger/20 p-4 sm:flex-row sm:items-center sm:p-5" style={{ animationDelay: "60ms" }}>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-ink">Tugas belum berhasil dimuat</h2>
                <p className="mt-1 text-xs leading-5 text-secondary-ink">{syncError}</p>
              </div>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent" onClick={() => void handleSync()}>
                <RefreshCw size={16} /> Coba sinkronkan
              </button>
            </section>
          ) : null}

          {!connected ? (
            <section className="glass-soft task-enter mt-6 flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:p-5" style={{ animationDelay: "60ms" }}>
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Cloud size={20} /></div>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-ink">Masuk untuk memuat tugas asli</h2>
                <p className="mt-1 text-xs leading-5 text-secondary-ink">
                  Data di bawah adalah contoh. Login SIAKAD untuk mendeteksi mata kuliah, tugas, status, dan deadline Anda.
                </p>
              </div>
              <button type="button" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent" onClick={() => setLoginOpen(true)}>
                <ArrowUpRight size={16} /> Masuk SIAKAD
              </button>
            </section>
          ) : null}

          <section className="mt-6 grid gap-4 lg:grid-cols-[1.45fr_1fr_1fr]" aria-label="Ringkasan tugas">
            <div className="glass-soft task-enter flex items-center gap-5 rounded-2xl p-5 sm:p-6" style={{ animationDelay: "90ms" }}>
              <div className="relative size-16 shrink-0">
                <svg viewBox="0 0 44 44" className="size-16 -rotate-90" aria-hidden="true">
                  <circle cx="22" cy="22" r="18" fill="none" stroke="var(--border)" strokeWidth="3" />
                  <circle cx="22" cy="22" r="18" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" pathLength="100" strokeDasharray={`${counts.progress} ${100 - counts.progress}`} />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-medium tabular-nums text-ink">{counts.progress}%</span>
              </div>
              <div>
                <div className="text-xs text-muted-ink">Progres semester</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums text-ink">{counts.done}<span className="text-base font-normal text-muted-ink"> / {counts.total}</span></div>
                <div className="mt-1 text-xs text-secondary-ink">tugas selesai atau dikumpulkan</div>
              </div>
            </div>
            <div className="glass-soft task-enter rounded-2xl p-5 sm:p-6" style={{ animationDelay: "120ms" }}>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-ink">Tenggat dekat</div>
                <span className="size-2 rounded-full bg-warning" />
              </div>
              <div className="mt-3 text-3xl font-semibold tabular-nums text-ink">{counts.dueSoon}</div>
              <div className="mt-2 text-xs leading-5 text-secondary-ink">tugas dalam 3 hari ke depan</div>
            </div>
            <div className="glass-soft task-enter rounded-2xl p-5 sm:p-6" style={{ animationDelay: "150ms" }}>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-ink">Sudah dikumpulkan</div>
                <CheckCircle2 size={16} className="text-success" />
              </div>
              <div className="mt-3 text-3xl font-semibold tabular-nums text-ink">{counts.submitted}</div>
              <div className="mt-2 text-xs leading-5 text-secondary-ink">terkonfirmasi dari SPADA</div>
            </div>
          </section>

          <div className="mt-8 grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_304px]">
            <section className="min-w-0">
              <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-ink">Daftar tugas</h2>
                  <p className="mt-1 text-xs text-muted-ink">{filteredTasks.length} tugas ditampilkan{isDemo ? " · data contoh" : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="sr-only" htmlFor="course-filter">Filter mata kuliah</label>
                  <select id="course-filter" className="control max-w-44 flex-1 px-3 text-xs sm:flex-none" value={courseFilter} onChange={(event) => setCourseFilter(event.target.value)}>
                    <option value="all">Semua mata kuliah</option>
                    {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
                  </select>
                  <label className="sr-only" htmlFor="sort-tasks">Urutkan tugas</label>
                  <select id="sort-tasks" className="control px-3 text-xs" value={sort} onChange={(event) => setSort(event.target.value as "deadline" | "course")}>
                    <option value="deadline">Deadline</option>
                    <option value="course">Mata kuliah</option>
                  </select>
                </div>
              </div>

              <div className="scrollbar-quiet mb-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter status tugas">
                {filterItems.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    className={cn(
                      "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-medium transition-colors",
                      statusFilter === item.value ? "border-accent/30 bg-accent-soft text-accent" : "border-line bg-surface text-secondary-ink hover:bg-surface-subtle hover:text-ink",
                    )}
                    onClick={() => setStatusFilter(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
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
                  <h3 className="text-sm font-semibold text-ink">Tugas tidak ditemukan</h3>
                  <p className="mt-2 text-xs leading-5 text-secondary-ink">Ubah kata kunci atau filter status dan mata kuliah.</p>
                  <button type="button" className="mt-4 min-h-11 rounded-xl px-4 text-xs font-medium text-accent" onClick={() => { setQuery(""); setStatusFilter("all"); setCourseFilter("all"); }}>Reset filter</button>
                </div>
              ) : null}
            </section>

            <aside className="space-y-4 xl:sticky xl:top-24">
              <section className="glass-soft rounded-2xl p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">Tenggat dekat</h2>
                  <span className="font-mono text-xs tabular-nums text-muted-ink">{upcomingTasks.length}</span>
                </div>
                <div className="space-y-1">
                  {upcomingTasks.map((task) => {
                    const deadline = getDeadlineState(task.dueAt);
                    return (
                      <button key={task.id} type="button" className="group flex min-h-16 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors hover:bg-surface-subtle" onClick={() => setSelectedTaskId(task.id)}>
                        <span className={cn("size-2 shrink-0 rounded-full", deadline.tone === "danger" ? "bg-danger" : deadline.tone === "warning" ? "bg-warning" : "bg-accent")} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-ink">{task.title}</span>
                          <span className="mt-1 block font-mono text-[11px] tabular-nums text-muted-ink">{formatDeadline(task.dueAt)}</span>
                        </span>
                        <ChevronRight size={15} className="text-muted-ink transition-transform group-hover:translate-x-0.5" />
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="glass-soft rounded-2xl p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-ink">Mata kuliah</h2>
                  <BookOpen size={16} className="text-muted-ink" />
                </div>
                <div className="space-y-4">
                  {courses.map((course) => {
                    const courseTasks = tasksWithStatus.filter((task) => task.courseId === course.id);
                    const complete = courseTasks.filter((task) => task.status === "done" || task.status === "submitted").length;
                    const percent = courseTasks.length ? Math.round((complete / courseTasks.length) * 100) : 0;
                    return (
                      <button key={course.id} type="button" className="block min-h-11 w-full text-left" onClick={() => { setCourseFilter(course.id); setStatusFilter("all"); }}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-xs font-medium text-ink">{course.name}</span>
                          <span className="font-mono text-[11px] tabular-nums text-muted-ink">{complete}/{courseTasks.length}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-subtle">
                          <div className="h-full origin-left rounded-full bg-accent transition-transform duration-300" style={{ transform: `scaleX(${percent / 100})` }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <div className="flex items-start gap-2 px-2 text-[11px] leading-5 text-muted-ink">
                <ShieldCheck size={14} className="mt-0.5 shrink-0" />
                Status lokal tersimpan di perangkat ini. Status dikumpulkan hanya berubah setelah SPADA mengonfirmasi.
              </div>
            </aside>
          </div>
        </main>
      </div>

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
