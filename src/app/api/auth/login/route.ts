import { loginWithSiakad } from "@/lib/siakad";
import { SpadaError } from "@/lib/spada";
import { readSpadaSession } from "@/lib/spada-session";

export const maxDuration = 60;

const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 6;

function attemptKey(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request) {
  const key = attemptKey(request);
  const now = Date.now();
  const current = attempts.get(key);
  if (current && current.resetAt > now && current.count >= MAX_ATTEMPTS) {
    return Response.json(
      { ok: false, code: "LOGIN_FAILED", message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit." },
      { status: 429, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: { nim?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, code: "LOGIN_FAILED", message: "Data login tidak valid." }, { status: 400 });
  }
  if (typeof body.nim !== "string" || typeof body.password !== "string") {
    return Response.json({ ok: false, code: "LOGIN_FAILED", message: "NIM dan password wajib diisi." }, { status: 400 });
  }

  try {
    await loginWithSiakad(body.nim, body.password);
    attempts.delete(key);
    const session = await readSpadaSession();
    return Response.json(
      {
        ok: true,
        user: session ? { nim: session.nim, name: session.name } : null,
        connectedAt: session?.connectedAt,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    attempts.set(key, {
      count: current && current.resetAt > now ? current.count + 1 : 1,
      resetAt: current && current.resetAt > now ? current.resetAt : now + WINDOW_MS,
    });
    if (error instanceof SpadaError) {
      return Response.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.code === "LOGIN_FAILED" ? 401 : 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { ok: false, code: "REQUEST_FAILED", message: "Login SIAKAD gagal. Coba lagi nanti." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
