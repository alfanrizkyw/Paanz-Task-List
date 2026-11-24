import "server-only";

import { SpadaError } from "@/lib/spada";
import { writeSpadaSession } from "@/lib/spada-session";

const SIAKAD_URL = "https://siakad.polinema.ac.id";
const SLC_URL = "https://slc.polinema.ac.id";
const SPADA_URL = process.env.SPADA_BASE_URL ?? "https://slc.polinema.ac.id/spada/";
const MOODLE_URL = process.env.MOODLE_BASE_URL ?? "https://lmsslc.polinema.ac.id";
const ALLOWED_HOSTS = new Set([
  new URL(SIAKAD_URL).hostname,
  new URL(SLC_URL).hostname,
  new URL(SPADA_URL).hostname,
  new URL(MOODLE_URL).hostname,
]);

interface CookieEntry {
  name: string;
  value: string;
}

function parseCookies(response: Response): CookieEntry[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return (headers.getSetCookie?.() ?? []).flatMap((value) => {
    const pair = value.split(";", 1)[0];
    const index = pair.indexOf("=");
    return index > 0 ? [{ name: pair.slice(0, index).trim(), value: pair.slice(index + 1).trim() }] : [];
  });
}

function mergeCookies(current: CookieEntry[], incoming: CookieEntry[]) {
  const map = new Map(current.map((cookie) => [cookie.name, cookie.value]));
  for (const cookie of incoming) map.set(cookie.name, cookie.value);
  return [...map].map(([name, value]) => ({ name, value }));
}

function cookieHeader(cookies: CookieEntry[]) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

async function request(url: string, cookies: CookieEntry[], init?: RequestInit) {
  let currentUrl = url;
  let currentCookies = cookies;
  let response: Response | undefined;

  for (let redirects = 0; redirects < 6; redirects += 1) {
    const target = new URL(currentUrl);
    if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
      throw new SpadaError("Tautan login tidak berasal dari server kampus.", "LOGIN_FAILED");
    }
    try {
      response = await fetch(currentUrl, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(20_000),
        headers: {
          Cookie: cookieHeader(currentCookies),
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
          "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
          ...init?.headers,
        },
        cache: "no-store",
        redirect: "manual",
      });
    } catch {
      throw new SpadaError("Tidak dapat menghubungi server kampus. Coba lagi nanti.", "REQUEST_FAILED");
    }
    currentCookies = mergeCookies(currentCookies, parseCookies(response));
    const location = response.headers.get("location");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) break;
    currentUrl = new URL(location, currentUrl).toString();
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && init?.method === "POST")) {
      init = { ...init, method: "GET", body: undefined };
    }
  }

  if (!response) throw new SpadaError("Server kampus tidak memberikan respons.", "REQUEST_FAILED");
  if (!response.ok) {
    throw new SpadaError(`Server kampus mengembalikan status ${response.status}.`, "REQUEST_FAILED");
  }
  return { response, cookies: currentCookies, url: currentUrl };
}

function firstMoodleLink(html: string) {
  const match = html.match(/href=["']([^"']*lmsslc\.polinema\.ac\.id[^"']*)["']/i);
  return match?.[1] ?? `${MOODLE_URL}/my/`;
}

export async function loginWithSiakad(nim: string, password: string) {
  const cleanNim = nim.trim();
  if (!/^\d{6,20}$/.test(cleanNim) || password.length < 6) {
    throw new SpadaError("NIM atau password tidak valid.", "LOGIN_FAILED");
  }

  const loginPage = await request(`${SIAKAD_URL}/login`, []);
  const loginResponse = await request(`${SIAKAD_URL}/login`, loginPage.cookies, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: `${SIAKAD_URL}/login`,
      "X-Requested-With": "XMLHttpRequest",
    },
    body: new URLSearchParams({ username: cleanNim, password }),
  });

  let loginData: { output?: string; nama?: string; name?: string };
  try {
    loginData = (await loginResponse.response.json()) as typeof loginData;
  } catch {
    throw new SpadaError("Respons login SIAKAD tidak dapat dibaca.", "LOGIN_FAILED");
  }
  if (loginData.output !== "ok") {
    throw new SpadaError("NIM atau password SIAKAD salah.", "LOGIN_FAILED");
  }

  const ssoCookie = loginResponse.cookies.find((cookie) => cookie.name === "polinema_sso");
  if (!ssoCookie) throw new SpadaError("Sesi SSO kampus tidak diterbitkan.", "LOGIN_FAILED");

  const slc = await request(SLC_URL, loginResponse.cookies);
  const spadaCookie = slc.cookies.find((cookie) => cookie.name === "POLIMASPADA");
  if (!spadaCookie) throw new SpadaError("Sesi SPADA tidak diterbitkan.", "LOGIN_FAILED");

  const courses = await request(`${SPADA_URL}?mod=matakuliah`, slc.cookies);
  const coursesHtml = await courses.response.text();
  if (/IDXPG=['"]GES['"]/i.test(coursesHtml) || (/gsi_btn/i.test(coursesHtml) && !/gallery_grid_item/i.test(coursesHtml))) {
    throw new SpadaError("Sesi SPADA belum aktif. Ulangi login beberapa saat lagi.", "SESSION_EXPIRED");
  }

  const bridge = await request(firstMoodleLink(coursesHtml), courses.cookies);
  const moodleCookie = bridge.cookies.find((cookie) => cookie.name === "MoodleSession");
  if (!moodleCookie) throw new SpadaError("Sesi Moodle tidak diterbitkan.", "LOGIN_FAILED");

  await writeSpadaSession({
    nim: cleanNim,
    name: loginData.nama ?? loginData.name ?? `Mahasiswa ${cleanNim}`,
    cookieHeader: cookieHeader(bridge.cookies.filter((cookie) => ["POLIMASPADA", "MoodleSession"].includes(cookie.name))),
    connectedAt: new Date().toISOString(),
  });
}
