import { downloadSpadaTaskFile, SpadaError } from "@/lib/spada";

export const maxDuration = 60;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const taskUrl = url.searchParams.get("taskUrl") ?? "";
  const fileUrl = url.searchParams.get("fileUrl") ?? "";
  if (!taskUrl || !fileUrl || taskUrl.length > 2_000 || fileUrl.length > 4_000) {
    return Response.json({ ok: false, message: "Tautan berkas tidak valid." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    return await downloadSpadaTaskFile(taskUrl, fileUrl);
  } catch (error) {
    if (error instanceof SpadaError) {
      const status = error.code === "AUTH_REQUIRED" || error.code === "SESSION_EXPIRED"
        ? 401
        : error.code === "FILE_NOT_FOUND"
          ? 404
          : error.code === "FILE_TOO_LARGE"
            ? 413
            : error.code === "REQUEST_FAILED"
              ? 502
              : 400;
      return Response.json(
        { ok: false, code: error.code, message: error.message },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json({ ok: false, message: "Berkas gagal diunduh." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
