import { Suspense } from "react";
import { LoaderCircle } from "lucide-react";
import { TaskDashboard } from "@/components/task-dashboard";
import { demoCourses, demoTasks } from "@/lib/demo-data";
import { readSpadaSession } from "@/lib/spada-session";

async function DashboardContent() {
  const session = await readSpadaSession();

  return (
    <TaskDashboard
      initialTasks={session ? [] : demoTasks}
      initialCourses={session ? [] : demoCourses}
      user={session ? { nim: session.nim, name: session.name } : null}
      connection={{
        connected: Boolean(session),
        nim: session?.nim,
        connectedAt: session?.connectedAt,
      }}
    />
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={(
        <main className="grid min-h-screen place-items-center px-6">
          <p role="status" className="flex items-center gap-3 text-sm text-secondary-ink">
            <LoaderCircle size={18} className="animate-spin" />
            Memuat Paanz Task List
          </p>
        </main>
      )}
    >
      <DashboardContent />
    </Suspense>
  );
}
