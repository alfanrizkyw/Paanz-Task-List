import { SpadaError, syncSpadaTasks } from "@/lib/spada";

export const maxDuration = 120;

export async function POST() {
  try {
    const payload = await syncSpadaTasks();
    return Response.json({ ok: true, ...payload }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SpadaError) {
      return Response.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.code === "AUTH_REQUIRED" || error.code === "SESSION_EXPIRED" ? 401 : 400 },
      );
    }
    return Response.json({ ok: false, code: "REQUEST_FAILED", message: "Sinkronisasi SPADA gagal." }, { status: 500 });
  }
}
