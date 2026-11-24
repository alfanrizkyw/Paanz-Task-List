import "server-only";

import { existsSync } from "node:fs";
import type { Browser } from "playwright-core";
import { readSpadaSession, writeSpadaSession, type SpadaSession } from "@/lib/spada-session";
import type { Course, SyncPayload, Task, TaskKind, TaskStatus } from "@/lib/types";

const BASE_URL = process.env.SPADA_BASE_URL ?? "https://slc.polinema.ac.id/spada/";
const MOODLE_URL = process.env.MOODLE_BASE_URL ?? "https://lmsslc.polinema.ac.id";
const MOODLE_HOST = new URL(MOODLE_URL).hostname;
const SPADA_HOST = new URL(BASE_URL).hostname;
const MAX_COURSES = 30;
const MAX_TASKS = 120;

export class SpadaError extends Error {
  constructor(
    message: string,
    public code:
      | "AUTH_REQUIRED"
      | "LOGIN_FAILED"
      | "SESSION_EXPIRED"
      | "STRUCTURE_UNKNOWN"
      | "FORM_NOT_FOUND"
      | "ALREADY_SUBMITTED"
      | "SUBMIT_UNCONFIRMED"
      | "REQUEST_FAILED",
  ) {
    super(message);
  }
}

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkup(value: string) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ");
}

function stripHtml(value: string) {
  return decodeEntities(stripMarkup(value));
}

function attribute(attributes: string, name: string) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}=["']([^"']*)["']`, "i"));
  return match?.[1] ?? "";
}

function absoluteUrl(value: string, base: string) {
  try {
    return new URL(decodeEntities(value), base).toString();
  } catch {
    return "";
  }
}

function isCampusUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && [SPADA_HOST, MOODLE_HOST].includes(url.hostname);
  } catch {
    return false;
  }
}

function cookiesForHost(hostname: string, cookieHeader: string) {
  const allowedNames = hostname === MOODLE_HOST ? ["MoodleSession"] : ["POLIMASPADA"];
  const values = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    values.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return allowedNames.flatMap((name) => {
    const value = values.get(name);
    return value ? [`${name}=${value}`] : [];
  }).join("; ");
}

async function campusPage(value: string, session: SpadaSession) {
  let currentUrl = value;
  for (let redirects = 0; redirects < 8; redirects += 1) {
    if (!isCampusUrl(currentUrl)) {
      throw new SpadaError("Tautan tidak berasal dari server kampus.", "FORM_NOT_FOUND");
    }
    let response: Response;
    try {
      response = await fetch(currentUrl, {
        headers: {
          Cookie: cookiesForHost(new URL(currentUrl).hostname, session.cookieHeader),
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
          "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
        },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new SpadaError("Tidak dapat menghubungi server kampus. Coba lagi nanti.", "REQUEST_FAILED");
    }

    const location = response.headers.get("location");
    if ([301, 302, 303, 307, 308].includes(response.status) && location) {
      await response.body?.cancel();
      currentUrl = absoluteUrl(location, currentUrl);
      continue;
    }
    if (!response.ok) {
      throw new SpadaError(`Server kampus mengembalikan status ${response.status}.`, "REQUEST_FAILED");
    }
    return { html: await response.text(), url: response.url || currentUrl };
  }
  throw new SpadaError("Terlalu banyak pengalihan dari server kampus.", "REQUEST_FAILED");
}

function extractLinks(html: string, pageUrl: string) {
  const links: Array<{ href: string; text: string }> = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = absoluteUrl(attribute(match[1], "href"), pageUrl);
    const text = stripHtml(match[2]);
    if (href && isCampusUrl(href) && text) links.push({ href, text });
  }
  return links;
}

function isSpadaLogin(html: string) {
  return /IDXPG\s*=\s*['"]GES['"]/i.test(html) || /g_id_onload|gsi_btn/i.test(html);
}

function isMoodleLogin(html: string, url: string) {
  return /\/login\/index\.php/i.test(new URL(url).pathname) || /<input\b[^>]*name=["']password["']/i.test(html);
}

function pageTitle(html: string, fallback: string) {
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return stripHtml(heading || title || fallback).replace(/\s*[-|]\s*(?:SPADA|Moodle).*$/i, "").trim() || fallback;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function courseCards(html: string) {
  const starts = [...html.matchAll(/<[a-z][^>]*\bclass=["'][^"']*\bgallery_grid_item\b[^"']*["'][^>]*>/gi)]
    .map((match) => match.index ?? 0);

  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
}

function cardTitle(card: string) {
  const titled = card.match(/<[a-z][^>]*\bclass=["'][^"']*(?:gallery_card_title|gallery_grid_item_title|course-title|card-title)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z][^>]*>/i)?.[1];
  const heading = card.match(/<h[234]\b[^>]*>([\s\S]*?)<\/h[234]>/i)?.[1];
  const link = extractLinks(card, BASE_URL)[0]?.text;
  return stripHtml(titled || heading || link || "").slice(0, 180);
}

function courseCode(card: string, title: string) {
  const marked = card.match(/<[a-z][^>]*\bclass=["'][^"']*(?:course-code|course_code|kode)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z][^>]*>/i)?.[1];
  const explicit = stripHtml(marked || title.match(/\(([^)]+)\)/)?.[1] || "");
  const token = title.match(/\b[a-z]{1,12}[-_.]?\d[\w.-]*\b/i)?.[0];
  return (explicit || token || "SPADA").toUpperCase().slice(0, 24);
}

function taskKind(title: string, url: string): TaskKind {
  if (/\/mod\/quiz\//i.test(url) || /kuis|quiz/i.test(title)) return "Kuis";
  if (/praktikum|lab|laporan/i.test(title)) return "Praktikum";
  if (/proyek|project|presentasi/i.test(title)) return "Proyek";
  return "Tugas";
}

const months: Record<string, number> = {
  january: 0, jan: 0, januari: 0,
  february: 1, feb: 1, februari: 1,
  march: 2, mar: 2, maret: 2,
  april: 3, apr: 3,
  may: 4, mei: 4,
  june: 5, jun: 5, juni: 5,
  july: 6, jul: 6, juli: 6,
  august: 7, aug: 7, agustus: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9, oktober: 9,
  november: 10, nov: 10,
  december: 11, dec: 11, desember: 11,
};

function parseMoodleDate(value: string) {
  const normalized = decodeEntities(value);
  const iso = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (iso) {
    const timezone = normalized.match(/(Z|[+-]\d{2}:?\d{2})/i)?.[1] ?? "+07:00";
    const date = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T${iso[4]}:${iso[5]}:${iso[6] ?? "00"}${timezone}`);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  const named = normalized.match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Januari|Februari|Maret|Mei|Juni|Juli|Agustus|Oktober|Desember|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})(?:,?\s+(?:pukul\s+)?(\d{1,2})[:.](\d{2})(?:\s*(AM|PM))?)?/i);
  if (named) {
    const month = months[named[2].toLowerCase()];
    let hour = Number(named[4] ?? 23);
    if (named[6]?.toUpperCase() === "PM" && hour < 12) hour += 12;
    if (named[6]?.toUpperCase() === "AM" && hour === 12) hour = 0;
    const date = new Date(Date.UTC(Number(named[3]), month, Number(named[1]), hour - 7, Number(named[5] ?? 59)));
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }

  const numeric = normalized.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[,\s]+(?:pukul\s+)?(\d{1,2})[:.](\d{2}))?/);
  if (numeric) {
    const date = new Date(Date.UTC(Number(numeric[3]), Number(numeric[2]) - 1, Number(numeric[1]), Number(numeric[4] ?? 23) - 7, Number(numeric[5] ?? 59)));
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  return undefined;
}

function tableRows(html: string) {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => stripHtml(cell[1])),
  );
}

function submissionStatus(value: string, fallback = ""): TaskStatus {
  const text = `${value} ${fallback}`;
  if (/no submission|not submitted|no attempt|not attempted|belum dikumpulkan|belum mencoba|tidak ada pengumpulan/i.test(text)) return "todo";
  if (/draft|sedang dikerjakan|in progress/i.test(text)) return "doing";
  if (/submitted for grading|submission (?:recorded|submitted)|assignment submitted|graded|dinilai|dikumpulkan|finished|completed|selesai/i.test(text)) return "submitted";
  return "todo";
}

function descriptionFrom(html: string) {
  const intro = html.match(/<(?:div|section)\b[^>]*(?:id=["']intro["']|class=["'][^"']*\bdescription-inner\b)[^>]*>([\s\S]*?)<\/(?:div|section)>/i)?.[1];
  return intro ? stripHtml(intro).slice(0, 800) : "";
}

interface TaskDetails {
  title: string;
  dueAt?: string;
  status: TaskStatus;
  description?: string;
  submittable: boolean;
  html: string;
  url: string;
}

async function readTaskDetails(value: string, session: SpadaSession): Promise<TaskDetails> {
  const page = await campusPage(value, session);
  if (isMoodleLogin(page.html, page.url)) {
    throw new SpadaError("Sesi Moodle sudah berakhir. Masuk kembali dengan SIAKAD.", "SESSION_EXPIRED");
  }

  const rows = tableRows(page.html);
  const dueRow = rows.find((cells) => /^(?:due date|deadline|batas waktu|batas akhir)$/i.test(cells[0] ?? ""));
  const statusRow = rows.find((cells) => /^(?:submission status|status pengumpulan)$/i.test(cells[0] ?? ""));
  const plain = stripHtml(page.html);
  const quizDate = plain.match(/(?:quiz closes|due date|batas waktu|ditutup pada)[\s:.-]*([^.]{0,140})/i)?.[1];
  const quizStatusRow = rows.find((cells) => /^(?:attempt status|status percobaan|status)$/i.test(cells[0] ?? ""));
  const isAssignment = /\/mod\/assign\/view\.php\b/i.test(new URL(page.url).pathname);
  const isQuiz = /\/mod\/quiz\/view\.php\b/i.test(new URL(page.url).pathname);
  if (!isAssignment && !isQuiz) {
    throw new SpadaError("Tautan ini bukan halaman tugas Moodle.", "FORM_NOT_FOUND");
  }

  return {
    title: pageTitle(page.html, isQuiz ? "Kuis" : "Tugas"),
    dueAt: parseMoodleDate(dueRow?.[1] ?? quizDate ?? ""),
    status: isAssignment ? submissionStatus(statusRow?.[1] ?? "") : submissionStatus(quizStatusRow?.[1] ?? plain),
    description: descriptionFrom(page.html),
    submittable: isAssignment,
    html: page.html,
    url: page.url,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function syncSpadaTasks(): Promise<SyncPayload> {
  const session = await readSpadaSession();
  if (!session) throw new SpadaError("Masuk dengan akun SIAKAD terlebih dahulu.", "AUTH_REQUIRED");

  const dashboard = await campusPage(`${BASE_URL}?mod=matakuliah`, session);
  if (isSpadaLogin(dashboard.html)) {
    throw new SpadaError("Sesi SPADA sudah berakhir. Masuk kembali dengan SIAKAD.", "SESSION_EXPIRED");
  }

  const cards = courseCards(dashboard.html);
  if (!cards.length) {
    throw new SpadaError("Daftar mata kuliah SPADA belum dikenali. Coba sinkronkan kembali.", "STRUCTURE_UNKNOWN");
  }

  const partial = cards.length > MAX_COURSES;
  const courseLinks = cards.slice(0, MAX_COURSES).map((card) => {
    const title = cardTitle(card);
    const links = extractLinks(card, dashboard.url);
    const href = links.find((link) => /lmsslc|moodle|\/course\/view\.php/i.test(`${link.href} ${link.text}`))?.href ?? links[0]?.href;
    return href ? { href, title, code: courseCode(card, title), card } : null;
  }).filter((link): link is NonNullable<typeof link> => Boolean(link?.href));

  if (!courseLinks.length) {
    throw new SpadaError("Tautan mata kuliah SPADA tidak ditemukan.", "STRUCTURE_UNKNOWN");
  }

  const coursePages = await mapLimit(courseLinks, 4, async (link) => ({
    link,
    page: await campusPage(link.href, session),
  }));

  const courses: Course[] = [];
  const taskLinks = new Map<string, { url: string; courseId: string }>();
  for (const { link, page } of coursePages) {
    if (isMoodleLogin(page.html, page.url)) {
      throw new SpadaError("Sesi Moodle sudah berakhir. Masuk kembali dengan SIAKAD.", "SESSION_EXPIRED");
    }
    const courseUrl = new URL(page.url);
    const title = link.title && !/masuk|klik|buka|lanjut/i.test(link.title) ? link.title : pageTitle(page.html, "Mata kuliah");
    const id = `course-${courseUrl.searchParams.get("id") || slug(title) || slug(page.url)}`;
    if (!courses.some((course) => course.id === id)) {
      courses.push({ id, code: link.code, name: title });
    }

    for (const taskLink of extractLinks(page.html, page.url)) {
      const taskUrl = new URL(taskLink.href);
      if (!/^\/mod\/(?:assign|quiz)\/view\.php$/.test(taskUrl.pathname) || !/^\d+$/.test(taskUrl.searchParams.get("id") ?? "")) continue;
      if (!taskLinks.has(taskLink.href)) taskLinks.set(taskLink.href, { url: taskLink.href, courseId: id });
    }
  }

  const limitedTasks = [...taskLinks.values()].slice(0, MAX_TASKS);
  const taskResults = await mapLimit(limitedTasks, 5, async (request) => ({
    request,
    detail: await readTaskDetails(request.url, session),
  }));
  const tasks: Task[] = taskResults.map(({ request, detail }) => ({
    id: request.url,
    courseId: request.courseId,
    title: detail.title,
    kind: taskKind(detail.title, detail.url),
    dueAt: detail.dueAt,
    status: detail.status,
    sourceUrl: detail.url,
    description: detail.description,
    submittable: detail.submittable,
  }));

  return {
    courses,
    tasks,
    syncedAt: new Date().toISOString(),
    partial: partial || taskLinks.size > MAX_TASKS,
  };
}

function canonicalAssignmentUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SpadaError("Tautan tugas tidak valid.", "FORM_NOT_FOUND");
  }
  const id = url.searchParams.get("id") ?? "";
  if (url.origin !== new URL(MOODLE_URL).origin || url.pathname !== "/mod/assign/view.php" || !/^\d+$/.test(id)) {
    throw new SpadaError("Tautan tugas bukan halaman pengumpulan Moodle yang valid.", "FORM_NOT_FOUND");
  }
  return `${MOODLE_URL}/mod/assign/view.php?id=${id}`;
}

async function launchSubmissionBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const configuredPath = process.env.CHROME_PATH;
  const localPaths = process.platform === "win32"
    ? [
        configuredPath,
        `${process.env.ProgramFiles ?? "C:\\Program Files"}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.ProgramFiles ?? "C:\\Program Files"}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)"}\\Microsoft\\Edge\\Application\\msedge.exe`,
      ]
    : process.platform === "darwin"
      ? [configuredPath, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"]
      : [configuredPath, "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  const executablePath = localPaths.find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));

  if (executablePath) {
    return chromium.launch({ executablePath, headless: true, args: ["--disable-dev-shm-usage"] });
  }
  if (process.platform === "linux") {
    const chromiumBinary = (await import("@sparticuz/chromium")).default;
    return chromium.launch({
      executablePath: await chromiumBinary.executablePath(),
      args: chromiumBinary.args,
      headless: true,
    });
  }
  throw new SpadaError("Browser pengumpulan tidak tersedia di server.", "REQUEST_FAILED");
}

function replaceCookie(cookieHeader: string, name: string, value: string) {
  const parts = cookieHeader.split(";").map((part) => part.trim()).filter(Boolean);
  const index = parts.findIndex((part) => part.startsWith(`${name}=`));
  if (index >= 0) parts[index] = `${name}=${value}`;
  else parts.push(`${name}=${value}`);
  return parts.join("; ");
}

export async function submitSpadaTask(input: {
  taskUrl: string;
  text?: string;
  file?: File;
}) {
  const session = await readSpadaSession();
  if (!session) throw new SpadaError("Masuk dengan akun SIAKAD terlebih dahulu.", "AUTH_REQUIRED");

  const taskUrl = canonicalAssignmentUrl(input.taskUrl);
  const initial = await readTaskDetails(taskUrl, session);
  if (initial.status === "submitted") {
    throw new SpadaError("Tugas ini sudah dikumpulkan di SPADA.", "ALREADY_SUBMITTED");
  }
  if (!cookiesForHost(MOODLE_HOST, session.cookieHeader)) {
    throw new SpadaError("Sesi Moodle tidak tersedia. Masuk kembali dengan SIAKAD.", "SESSION_EXPIRED");
  }

  const browser = await launchSubmissionBrowser();
  let verificationSession = session;
  try {
    const context = await browser.newContext({ locale: "id-ID" });
    const page = await context.newPage();
    page.setDefaultTimeout(25_000);
    page.on("dialog", async (dialog) => {
      if (/yakin|are you sure|unsaved|belum disimpan/i.test(dialog.message())) await dialog.accept();
      else await dialog.dismiss();
    });

    const moodleCookieHeader = cookiesForHost(MOODLE_HOST, session.cookieHeader);
    const moodleCookie = moodleCookieHeader.slice(moodleCookieHeader.indexOf("=") + 1);
    await context.addCookies([{
      name: "MoodleSession",
      value: moodleCookie,
      url: MOODLE_URL,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    }]);

    await page.goto(taskUrl, { waitUntil: "domcontentloaded", timeout: 35_000 });
    if (isMoodleLogin(await page.content(), page.url())) {
      throw new SpadaError("Sesi Moodle sudah berakhir. Masuk kembali dengan SIAKAD.", "SESSION_EXPIRED");
    }

    const submissionActionName = /add submission|edit submission|update submission|tambahkan pengumpulan|ubah pengumpulan|perbarui pengumpulan/i;
    const addSubmission = page.getByRole("button", { name: submissionActionName })
      .or(page.getByRole("link", { name: submissionActionName }))
      .first();
    if (await addSubmission.count()) {
      await addSubmission.click();
      await page.waitForLoadState("domcontentloaded");
    }

    if (input.file) {
      const fileInput = page.locator('input[type="file"]').first();
      if (!(await fileInput.count())) {
        throw new SpadaError("Kolom unggahan tidak tersedia pada tugas ini.", "FORM_NOT_FOUND");
      }
      await fileInput.setInputFiles({
        name: input.file.name,
        mimeType: input.file.type || "application/octet-stream",
        buffer: Buffer.from(await input.file.arrayBuffer()),
      });
      const uploadButton = page.getByRole("button", { name: /upload this file|unggah (?:file|berkas) ini/i }).first();
      await uploadButton.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
      if (await uploadButton.isVisible()) await uploadButton.click();
      const uploadArea = page.locator(".filemanager-container, .dndupload-container").first();
      if (await uploadArea.count()) {
        await page.waitForFunction((name) => {
          const area = document.querySelector(".filemanager-container, .dndupload-container");
          return area?.textContent?.includes(name);
        }, input.file.name, { timeout: 35_000 });
      }
      await page.waitForLoadState("networkidle", { timeout: 35_000 }).catch(() => undefined);
    }

    if (input.text?.trim()) {
      const editable = page.locator('.editor_atto_content[contenteditable="true"], [id*="onlinetext"][contenteditable="true"], [role="textbox"][contenteditable="true"]').first();
      const textarea = page.locator('textarea[name*="onlinetext"]').first();
      if (await editable.count()) {
        await editable.fill(input.text.trim());
      } else if (await textarea.count()) {
        await textarea.evaluate((element, value) => {
          const field = element as HTMLTextAreaElement;
          field.value = value;
          field.dispatchEvent(new Event("input", { bubbles: true }));
          field.dispatchEvent(new Event("change", { bubbles: true }));
        }, input.text.trim());
      } else {
        throw new SpadaError("Kolom jawaban teks tidak tersedia pada tugas ini.", "FORM_NOT_FOUND");
      }
    }

    const saveButton = page.getByRole("button", { name: /^save changes$|^simpan perubahan$/i }).first();
    if (!(await saveButton.count())) {
      throw new SpadaError("Tombol simpan pengumpulan tidak ditemukan.", "FORM_NOT_FOUND");
    }
    await saveButton.click();
    await page.waitForLoadState("networkidle", { timeout: 35_000 }).catch(() => undefined);

    const refreshedCookie = (await context.cookies(MOODLE_URL)).find((cookie) => cookie.name === "MoodleSession");
    if (refreshedCookie) {
      verificationSession = {
        ...session,
        cookieHeader: replaceCookie(session.cookieHeader, "MoodleSession", refreshedCookie.value),
      };
      if (verificationSession.cookieHeader !== session.cookieHeader) {
        await writeSpadaSession(verificationSession);
      }
    }
  } finally {
    await browser.close();
  }

  const verified = await readTaskDetails(taskUrl, verificationSession);
  const verifiedText = stripHtml(verified.html);
  if (verified.status !== "submitted") {
    throw new SpadaError("SPADA belum mengonfirmasi status dikumpulkan. Periksa kembali sebelum mencoba lagi.", "SUBMIT_UNCONFIRMED");
  }
  if (input.file && !verifiedText.includes(input.file.name)) {
    throw new SpadaError("Status berubah, tetapi berkas belum terlihat pada pengumpulan. Periksa SPADA sebelum mencoba lagi.", "SUBMIT_UNCONFIRMED");
  }
  const expectedText = input.text?.trim().replace(/\s+/g, " ").slice(0, 80);
  if (expectedText && !verifiedText.includes(expectedText)) {
    throw new SpadaError("Status berubah, tetapi jawaban teks belum terlihat pada pengumpulan. Periksa SPADA sebelum mencoba lagi.", "SUBMIT_UNCONFIRMED");
  }

  return { submittedAt: new Date().toISOString(), sourceUrl: taskUrl };
}
