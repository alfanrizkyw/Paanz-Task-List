import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "src/lib/spada-session.ts"), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
});

const cookieValues = new Map();
let cookieOptions;
const cookieStore = {
  get: (name) => cookieValues.has(name) ? { value: cookieValues.get(name) } : undefined,
  set: (name, value, options) => {
    cookieValues.set(name, value);
    cookieOptions = options;
  },
  delete: (name) => cookieValues.delete(name),
};
const requireStub = (id) => {
  if (id === "server-only") return {};
  if (id === "node:crypto") return require("node:crypto");
  if (id === "next/headers") return { cookies: async () => cookieStore };
  if (id === "jose") return require("jose");
  throw new Error(`Unexpected import in session test: ${id}`);
};
const sessionModule = { exports: {} };
new Function("require", "module", "exports", outputText)(requireStub, sessionModule, sessionModule.exports);
const { readSpadaSession, writeSpadaSession } = sessionModule.exports;

const previousSecret = process.env.AUTH_SECRET;
process.env.AUTH_SECRET = "x".repeat(64);

try {
  const session = {
    nim: "123456789",
    name: "Mahasiswa Uji",
    cookieHeader: "POLIMASPADA=uji; MoodleSession=uji",
    connectedAt: "2026-11-25T00:00:00.000Z",
  };
  await writeSpadaSession(session);
  const token = cookieValues.get("paanz_spada_session");
  assert.equal(typeof token, "string");
  assert.equal(cookieOptions.httpOnly, true);
  assert.equal(cookieOptions.maxAge, 60 * 60 * 24 * 365 * 10);
  assert.deepEqual(await readSpadaSession(), session);

  cookieValues.set("paanz_spada_session", `${token.slice(0, -2)}aa`);
  assert.equal(await readSpadaSession(), null);

  console.log(JSON.stringify({ secret64Byte: "lulus", cookieRoundTrip: "lulus", invalidTokenRejected: "lulus" }));
} finally {
  if (previousSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = previousSecret;
}
