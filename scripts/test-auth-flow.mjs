import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = `${readFileSync(resolve(root, "src/lib/siakad.ts"), "utf8")}\nexport { loginWithSiakad };`;
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
});

class TestSpadaError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const sessions = [];
const authModule = { exports: {} };
const requireStub = (id) => {
  if (id === "server-only") return {};
  if (id === "@/lib/spada") return { SpadaError: TestSpadaError };
  if (id === "@/lib/spada-session") return { writeSpadaSession: async (session) => sessions.push(session) };
  throw new Error(`Unexpected import in auth test: ${id}`);
};
new Function("require", "module", "exports", outputText)(requireStub, authModule, authModule.exports);
const { loginWithSiakad } = authModule.exports;

const originalFetch = globalThis.fetch;
let postedCredentials;
let loginOutput = "ok";

function response(body, init = {}) {
  return new Response(body, init);
}

function redirect(location) {
  return response(null, { status: 302, headers: { location } });
}

function moodleTarget(value) {
  let target = value;
  for (let index = 0; index < 3 && !/^https?:\/\//.test(target); index += 1) target = decodeURIComponent(target);
  return target;
}

globalThis.fetch = async (url, init = {}) => {
  const target = new URL(url);
  const method = init.method ?? "GET";

  if (target.hostname === "siakad.polinema.ac.id" && target.pathname === "/login" && method === "GET") {
    return response("<form id='form_login'></form>", { headers: { "set-cookie": "ci_session=awal; Path=/; HttpOnly" } });
  }
  if (target.hostname === "siakad.polinema.ac.id" && target.pathname === "/login" && method === "POST") {
    postedCredentials = Object.fromEntries(new URLSearchParams(init.body));
    return response(JSON.stringify({ output: loginOutput, nama: "Mahasiswa Uji" }), {
      headers: { "content-type": "application/json", "set-cookie": "ci_session=aktif; Path=/; HttpOnly" },
    });
  }
  if (target.hostname === "siakad.polinema.ac.id" && target.pathname === "/beranda") {
    assert.match(init.headers.Cookie, /ci_session=aktif/);
    return response("<h1>Beranda</h1>", { headers: { "set-cookie": "polinema_sso=sso-uji; Path=/; Secure; HttpOnly" } });
  }
  if (target.hostname === "slc.polinema.ac.id" && target.pathname === "/") {
    assert.match(init.headers.Cookie, /polinema_sso=sso-uji/);
    return redirect("/spada/");
  }
  if (target.hostname === "slc.polinema.ac.id" && target.pathname === "/spada/" && target.searchParams.get("mod") === "matakuliah") {
    assert.match(init.headers.Cookie, /POLIMASPADA=spada-uji/);
    return response('<a href="/spada/?gotourl=https%253A%252F%252Flmsslc.polinema.ac.id%252Fcourse%252Fview.php%253Fid%253D13310"><img src="course.jpg"></a>');
  }
  if (target.hostname === "slc.polinema.ac.id" && target.searchParams.has("gotourl")) {
    return redirect(moodleTarget(target.searchParams.get("gotourl")));
  }
  if (target.hostname === "slc.polinema.ac.id" && target.pathname === "/spada/") {
    return response("<html></html>", { headers: { "set-cookie": "POLIMASPADA=spada-uji; Path=/; HttpOnly" } });
  }
  if (target.hostname === "lmsslc.polinema.ac.id" && target.pathname === "/course/view.php") {
    assert.match(init.headers.Cookie, /POLIMASPADA=spada-uji/);
    return response("<h1>Pemrograman Web</h1>", { headers: { "set-cookie": "MoodleSession=moodle-uji; Path=/; HttpOnly" } });
  }

  throw new Error(`Permintaan uji tidak terduga: ${method} ${url}`);
};

try {
  await loginWithSiakad(" 123456789 ", "  data-uji-bukan-kredensial  ");
  assert.deepEqual(postedCredentials, { username: "123456789", password: "  data-uji-bukan-kredensial  " });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].nim, "123456789");
  assert.equal(sessions[0].name, "Mahasiswa Uji");
  assert.match(sessions[0].cookieHeader, /POLIMASPADA=spada-uji/);
  assert.match(sessions[0].cookieHeader, /MoodleSession=moodle-uji/);

  loginOutput = "NIM atau password salah";
  await assert.rejects(loginWithSiakad("123456789", "data-uji-salah"), (error) => {
    assert.equal(error.code, "LOGIN_FAILED");
    assert.equal(error.message, "NIM atau password salah");
    return true;
  });
  assert.equal(sessions.length, 1);

  console.log(JSON.stringify({ loginFlow: "lulus", cookieBridge: "lulus", passwordDikirimApaAdanya: "lulus", rejectedLogin: "lulus" }));
} finally {
  globalThis.fetch = originalFetch;
}
