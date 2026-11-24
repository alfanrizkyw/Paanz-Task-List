import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = `${readFileSync(resolve(root, "src/lib/spada.ts"), "utf8")}\nexport { syncSpadaTasks };`;
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
});

const session = {
  nim: "123456789",
  name: "Mahasiswa Uji",
  cookieHeader: "POLIMASPADA=spada-uji; MoodleSession=moodle-uji",
  connectedAt: "2026-11-25T00:00:00.000Z",
};
const syncModule = { exports: {} };
const requireStub = (id) => {
  if (id === "server-only") return {};
  if (id === "node:fs") return { existsSync };
  if (id === "@/lib/spada-session") return { readSpadaSession: async () => session, writeSpadaSession: async () => undefined };
  throw new Error(`Unexpected import in sync test: ${id}`);
};
new Function("require", "module", "exports", outputText)(requireStub, syncModule, syncModule.exports);
const { syncSpadaTasks } = syncModule.exports;

const courseNames = [
  "Rekayasa Perangkat Lunak",
  "Praktikum Jaringan Komputer",
  "Jaringan Komputer",
  "Pemrograman Berorientasi Objek",
  "Praktikum Pemrograman Berorientasi Objek",
  "Pemrograman Web",
  "Statistika",
  "Pancasila",
  "Kewirausahaan",
];
const taskCounts = [8, 18, 2, 3, 6];

function syntheticDashboard() {
  const cards = courseNames.map((name, index) => {
    const link = index < 6
      ? `<a href="/spada/?gotourl=https%253A%252F%252Flmsslc.polinema.ac.id%252Fcourse%252Fview.php%253Fid%253D${13310 + index}"><img src="course.jpg" alt=""></a>`
      : "";
    return `<div title="${name}" class="gallery_grid_item">${link}<span class="gallery_image_title">${name}</span></div>`;
  });
  return `<div class="gallery_grid">${cards.join("")}</div>`;
}

function syntheticTree() {
  return courseNames.slice(0, 5).map((name, courseIndex) => ({
    key: 13310 + courseIndex,
    title: `<span title="${name} : Diploma IV Sistem Informasi Bisnis">${name} : Diploma IV Sistem Informasi Bisnis</span>`,
    folder: 1,
    children: [{
      key: 10 + courseIndex,
      title: "Pertemuan ke 1",
      folder: 1,
      children: Array.from({ length: taskCounts[courseIndex] }, (_, taskIndex) => {
        const moduleId = 10000 + courseIndex * 100 + taskIndex;
        return {
          key: moduleId,
          title: `<span idmodule="${moduleId}" jenis="submit" allowsubmissionsfromdate="Senin, 2 November 2026 Jam 08:00:00" duedate="Kamis, 24 September 2026 Jam 16:00:00" txt="" jawaban="%5B%5D" title="Tugas ${taskIndex + 1}">Tugas ${taskIndex + 1}</span>`,
        };
      }),
    }],
  }));
}

const liveDashboardPath = resolve(root, ".data/spada-live.html");
const liveTreePath = resolve(root, ".data/spada-tree.json");
const useLiveFixtures = process.env.SPADA_TEST_LIVE === "1";
const dashboardHtml = useLiveFixtures && existsSync(liveDashboardPath) ? readFileSync(liveDashboardPath, "utf8") : syntheticDashboard();
const treeJson = useLiveFixtures && existsSync(liveTreePath) ? readFileSync(liveTreePath, "utf8") : JSON.stringify(syntheticTree());
const originalFetch = globalThis.fetch;
let coursePageRequests = 0;

function decodeTarget(value) {
  let target = value;
  for (let index = 0; index < 3 && !/^https?:\/\//.test(target); index += 1) target = decodeURIComponent(target);
  return target;
}

globalThis.fetch = async (url, init = {}) => {
  const target = new URL(url);
  if (target.hostname === "slc.polinema.ac.id" && target.pathname === "/spada/" && target.searchParams.get("mod") === "matakuliah") {
    assert.match(init.headers.Cookie, /POLIMASPADA=spada-uji/);
    return new Response(dashboardHtml);
  }
  if (target.hostname === "slc.polinema.ac.id" && target.searchParams.get("get_tree_ugas") === "1") {
    return new Response(treeJson, { headers: { "content-type": "application/json" } });
  }
  if (target.hostname === "slc.polinema.ac.id" && target.searchParams.has("gotourl")) {
    return new Response(null, { status: 302, headers: { location: decodeTarget(target.searchParams.get("gotourl")) } });
  }
  if (target.hostname === "lmsslc.polinema.ac.id" && target.pathname === "/course/view.php") {
    coursePageRequests += 1;
    assert.match(init.headers.Cookie, /MoodleSession=moodle-uji/);
    return new Response(`<h1>Mata kuliah ${target.searchParams.get("id")}</h1>`);
  }
  throw new Error(`Permintaan sinkronisasi uji tidak terduga: ${url}`);
};

try {
  const result = await syncSpadaTasks();
  const courseIds = new Set(result.courses.map((course) => course.id));
  assert.equal(result.courses.length, 9);
  assert.equal(result.tasks.length, 37);
  assert.equal(coursePageRequests, 6);
  assert.equal(result.partial, false);
  assert.ok(result.tasks.every((task) => courseIds.has(task.courseId)));
  assert.ok(result.tasks.every((task) => task.dueAt));
  assert.equal(new Set(result.courses.map((course) => course.name.toLowerCase())).size, result.courses.length);
  assert.equal(result.tasks[0].dueAt, "2026-09-24T09:00:00.000Z");

  console.log(JSON.stringify({ courses: result.courses.length, tasks: result.tasks.length, coursePages: coursePageRequests, deadlines: "lengkap", duplicateCourses: 0 }));
} finally {
  globalThis.fetch = originalFetch;
}
