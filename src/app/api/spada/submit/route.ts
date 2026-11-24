import { SpadaError, submitSpadaTask } from "@/lib/spada";
import { readSpadaSession } from "@/lib/spada-session";

export const maxDuration = 120;

const MAX_FILE_SIZE = 4 * 1024 * 1024;
const MAX_TEXT_LENGTH = 50_000;
const ALLOWED_FILE = /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|zip|rar|png|jpe?g)$/i;

export async function POST(request: Request) {
  const session = await readSpadaSession();
  if (!session) {
    return Response.json({ ok: false, code: "AUTH_REQUIRED", message: "Masuk dengan akun SIAKAD terlebih dahulu." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ ok: false, code: "FORM_NOT_FOUND", message: "Data pengumpulan tidak valid." }, { status: 400 });
  }

  const taskUrl = String(formData.get("taskUrl") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const fileValue = formData.get("file");
  const file = fileValue instanceof File ? fileValue : undefined;

  if (!taskUrl) {
    return Response.json({ ok: false, code: "FORM_NOT_FOUND", message: "Tautan tugas tidak valid." }, { status: 400 });
  }
  if (!file && !text) {
    return Response.json({ ok: false, code: "FORM_NOT_FOUND", message: "Pilih berkas atau tulis jawaban terlebih dahulu." }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return Response.json({ ok: false, code: "FORM_NOT_FOUND", message: "Jawaban teks terlalu panjang." }, { status: 400 });
  }
  if (file && file.size > MAX_FILE_SIZE) {
    return Response.json({ ok: false, code: "FORM_NOT_FOUND", message: "Ukuran berkas maksimal 4 MB." }, { status: 400 });
  }
  if (file && !ALLOWED_FILE.test(file.name)) {
    return Response.json({ ok: false, code: "FORM_NOT_FOUND", message: "Format berkas tidak didukung." }, { status: 400 });
  }

  try {
    const result = await submitSpadaTask({ taskUrl, text, file });
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SpadaError) {
      return Response.json(
        { ok: false, code: error.code, message: error.message },
        { status: error.code === "AUTH_REQUIRED" || error.code === "SESSION_EXPIRED" ? 401 : error.code === "ALREADY_SUBMITTED" ? 409 : 400 },
      );
    }
    return Response.json({ ok: false, code: "REQUEST_FAILED", message: "Pengumpulan tugas gagal." }, { status: 500 });
  }
}
