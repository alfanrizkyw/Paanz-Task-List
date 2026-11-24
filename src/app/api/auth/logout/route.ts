import { clearSpadaSession } from "@/lib/spada-session";

export async function POST() {
  await clearSpadaSession();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
