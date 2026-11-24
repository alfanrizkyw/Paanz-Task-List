import { readSpadaSession, writeSpadaSession } from "@/lib/spada-session";
import { isSyncPayload, isTaskStatusEntry } from "@/lib/task-state";
import { readTaskState, saveTaskState, taskStorageConfigured } from "@/lib/task-state-store";
import type { SyncPayload, TaskState, TaskStatusEntry } from "@/lib/types";

export const maxDuration = 30;

function noStore() {
  return { "Cache-Control": "no-store" };
}

export async function GET() {
  const session = await readSpadaSession();
  if (!session) return Response.json({ ok: false, code: "AUTH_REQUIRED", message: "Masuk dengan SIAKAD terlebih dahulu." }, { status: 401, headers: noStore() });
  await writeSpadaSession(session);

  const configured = taskStorageConfigured();
  if (!configured) return Response.json({ ok: true, configured: false, state: null }, { headers: noStore() });

  try {
    const stored = await readTaskState(session.nim);
    return Response.json({ ok: true, configured: true, state: stored?.state ?? null }, { headers: noStore() });
  } catch {
    return Response.json({ ok: false, code: "STORAGE_FAILED", message: "Data tersimpan belum dapat dimuat." }, { status: 503, headers: noStore() });
  }
}

export async function PUT(request: Request) {
  const session = await readSpadaSession();
  if (!session) return Response.json({ ok: false, code: "AUTH_REQUIRED", message: "Masuk dengan SIAKAD terlebih dahulu." }, { status: 401, headers: noStore() });
  await writeSpadaSession(session);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, code: "INVALID_STATE", message: "Data tugas tidak valid." }, { status: 400, headers: noStore() });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ ok: false, code: "INVALID_STATE", message: "Data tugas tidak valid." }, { status: 400, headers: noStore() });
  }

  const candidate = body as { statuses?: unknown; cache?: unknown; updatedAt?: unknown };
  if (candidate.statuses !== undefined && (!candidate.statuses || typeof candidate.statuses !== "object" || Array.isArray(candidate.statuses))) {
    return Response.json({ ok: false, code: "INVALID_STATE", message: "Status tugas tidak valid." }, { status: 400, headers: noStore() });
  }
  if (candidate.cache !== undefined && !isSyncPayload(candidate.cache)) {
    return Response.json({ ok: false, code: "INVALID_STATE", message: "Cache tugas tidak valid." }, { status: 400, headers: noStore() });
  }

  const entries = Object.entries(candidate.statuses ?? {});
  if (entries.length > 1000 || entries.some(([taskId, entry]) => taskId.length > 500 || !isTaskStatusEntry(entry))) {
    return Response.json({ ok: false, code: "INVALID_STATE", message: "Status tugas tidak valid." }, { status: 400, headers: noStore() });
  }

  const updatedAt = typeof candidate.updatedAt === "string" && !Number.isNaN(Date.parse(candidate.updatedAt))
    ? candidate.updatedAt
    : new Date().toISOString();
  const incoming: TaskState = {
    statuses: Object.fromEntries(entries) as Record<string, TaskStatusEntry>,
    ...(candidate.cache ? { cache: candidate.cache as SyncPayload } : {}),
    updatedAt,
  };

  try {
    const result = await saveTaskState(session.nim, incoming);
    return Response.json({ ok: true, configured: true, persisted: result.persisted, state: result.state }, { headers: noStore() });
  } catch {
    return Response.json({ ok: false, code: "STORAGE_FAILED", message: "Perubahan belum tersimpan lintas perangkat." }, { status: 503, headers: noStore() });
  }
}
