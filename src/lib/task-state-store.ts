import "server-only";

import { createHash } from "node:crypto";
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { emptyTaskState, mergeTaskStates, parseTaskState } from "@/lib/task-state";
import type { TaskState } from "@/lib/types";

interface StoredTaskState {
  state: TaskState;
  etag: string;
}

export function taskStorageConfigured() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || (process.env.BLOB_STORE_ID && process.env.VERCEL_OIDC_TOKEN));
}

function statePath(nim: string) {
  const digest = createHash("sha256").update(nim.trim()).digest("hex");
  return `task-state/${digest}.json`;
}

async function readStoredState(nim: string): Promise<StoredTaskState | null> {
  const result = await get(statePath(nim), { access: "private", useCache: false });
  if (!result) return null;
  const value: unknown = await new Response(result.stream).json();
  const state = parseTaskState(value);
  if (!state) throw new Error("Data tugas tersimpan tidak valid.");
  return { state, etag: result.blob.etag };
}

export async function readTaskState(nim: string): Promise<StoredTaskState | null> {
  if (!taskStorageConfigured()) return null;
  return readStoredState(nim);
}

export async function saveTaskState(nim: string, incoming: TaskState): Promise<{ state: TaskState; persisted: boolean }> {
  if (!taskStorageConfigured()) return { state: incoming, persisted: false };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await readStoredState(nim);
    const state = mergeTaskStates(current?.state ?? emptyTaskState(), incoming);
    try {
      await put(statePath(nim), JSON.stringify(state), {
        access: "private",
        contentType: "application/json",
        cacheControlMaxAge: 60,
        allowOverwrite: Boolean(current),
        ...(current ? { ifMatch: current.etag } : {}),
        maximumSizeInBytes: 512 * 1024,
      });
      return { state, persisted: true };
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
    }
  }

  throw new Error("Data tugas sedang diubah dari perangkat lain. Coba lagi.");
}
