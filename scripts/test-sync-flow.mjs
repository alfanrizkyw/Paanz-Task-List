import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = `${readFileSync(resolve(root, "src/lib/spada.ts"), "utf8")}\nexport { downloadSpadaTaskFile, SpadaError, syncSpadaTasks };`;
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
const { downloadSpadaTaskFile, SpadaError, syncSpadaTasks } = syncModule.exports;

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

function syntheticTree(includeDuplicateCourse = false) {
  const entries = courseNames.slice(0, 5).map((name, courseIndex) => ({
    key: 13310 + courseIndex,
    title: `<span title="${name} : Diploma IV Sistem Informasi Bisnis">${name} : Diploma IV Sistem Informasi Bisnis</span>`,
    folder: 1,
    children: [{
      key: 10 + courseIndex,
      title: "Pertemuan ke 1",
      folder: 1,
      children: Array.from({ length: taskCounts[courseIndex] }, (_, taskIndex) => {
        const moduleId = 10000 + courseIndex * 100 + taskIndex;
        const taskHtml = courseIndex === 0 && taskIndex === 1
          ? encodeURIComponent(`<p>Modul tambahan dari SPADA.</p><a href="/pluginfile.php/1/assign/intro/Modul-Tree-${moduleId}.pdf">Modul Tree ${moduleId}.pdf <span>180 KB</span></a>`)
          : "";
        return {
          key: moduleId,
          title: `<span idmodule="${moduleId}" jenis="submit" allowsubmissionsfromdate="Senin, 2 November 2026 Jam 08:00:00" duedate="Kamis, 24 September 2026 Jam 16:00:00" txt="${taskHtml}" jawaban="%5B%5D" title="Tugas ${taskIndex + 1}">Tugas ${taskIndex + 1}</span>`,
        };
      }),
    }],
  }));
  if (includeDuplicateCourse) {
    entries.push({
      key: 99999,
      title: `<span title="${courseNames[0]} : Diploma IV Sistem Informasi Bisnis">${courseNames[0]} : Diploma IV Sistem Informasi Bisnis</span>`,
      folder: 1,
      children: [{
        key: 20,
        title: "Pertemuan ke 1",
        folder: 1,
        children: [{
          key: 19999,
          title: '<span idmodule="19999" jenis="submit" duedate="Kamis, 24 September 2026 Jam 16:00:00" txt="" jawaban="%5B%5D" title="Tugas mata kuliah duplikat">Tugas mata kuliah duplikat</span>',
        }],
      }],
    });
  }
  return entries;
}

const liveDashboardPath = resolve(root, ".data/spada-live.html");
const liveTreePath = resolve(root, ".data/spada-tree.json");
const useLiveFixtures = process.env.SPADA_TEST_LIVE === "1";
if (useLiveFixtures && !existsSync(liveDashboardPath)) throw new Error("Fixture dashboard live tidak ditemukan.");
if (useLiveFixtures && !existsSync(liveTreePath)) throw new Error("Fixture tree live tidak ditemukan.");
const dashboardHtml = useLiveFixtures ? readFileSync(liveDashboardPath, "utf8") : syntheticDashboard();
const treeJson = useLiveFixtures ? readFileSync(liveTreePath, "utf8") : JSON.stringify(syntheticTree(true));
const originalFetch = globalThis.fetch;
let coursePageRequests = 0;
let taskDetailRequests = 0;
let redirectDownloadToUnsafePort = false;
let oversizedDownload = false;

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
  if (target.hostname === "lmsslc.polinema.ac.id" && target.pathname === "/mod/assign/view.php") {
    taskDetailRequests += 1;
    const moduleId = target.searchParams.get("id");
    const submitted = moduleId === "10000";
    return new Response(`<div role="main"><h2>Detail tugas ${moduleId}</h2>
      <div id="intro"><p>Instruksi pengumpulan tugas.</p><a href="/pluginfile.php/1/assign/intro/Modul-${moduleId}.pdf">Modul-${moduleId}.pdf <span>240 KB</span></a></div>
      ${submitted ? '<div class="submissionfiles"><a href="/pluginfile.php/1/assign/submission_files/Jawaban-Alya.pdf">Jawaban-Alya.pdf <span>1,2 MB</span></a></div>' : ""}
      <table>
        <tr><th>Submission status</th><td>${submitted ? "Submitted for grading" : "No attempt"}</td></tr>
        <tr><th>Due date</th><td>Thursday, 24 September 2026, 4:00 PM</td></tr>
        <tr><th>Last modified</th><td>${submitted ? "Tuesday, 22 September 2026, 10:00 AM" : "-"}</td></tr>
      </table></div>`);
  }
  if (target.hostname === "lmsslc.polinema.ac.id" && target.pathname.startsWith("/pluginfile.php/")) {
    assert.match(init.headers.Cookie, /MoodleSession=moodle-uji/);
    if (redirectDownloadToUnsafePort) {
      return new Response(null, { status: 302, headers: { location: "https://lmsslc.polinema.ac.id:444/pluginfile.php/1/assign/submission_files/Jawaban-Alya.pdf" } });
    }
    if (oversizedDownload) {
      return new Response(new Uint8Array(20 * 1024 * 1024 + 1), { headers: { "content-type": "application/pdf" } });
    }
    return new Response("isi-berkas-uji", { headers: { "content-type": "application/pdf", "content-length": "15" } });
  }
  throw new Error(`Permintaan sinkronisasi uji tidak terduga: ${url}`);
};

try {
  const result = await syncSpadaTasks();
  const syncedTaskDetailRequests = taskDetailRequests;
  const courseIds = new Set(result.courses.map((course) => course.id));
  const expectedCourses = useLiveFixtures ? 9 : 10;
  const expectedTasks = useLiveFixtures ? 37 : 38;
  assert.equal(result.courses.length, expectedCourses);
  assert.equal(result.tasks.length, expectedTasks);
  assert.equal(coursePageRequests, 6);
  assert.equal(result.partial, false);
  assert.ok(result.tasks.every((task) => courseIds.has(task.courseId)));
  assert.ok(result.tasks.every((task) => task.dueAt));
  assert.equal(courseIds.size, result.courses.length);
  if (useLiveFixtures) {
    assert.equal(new Set(result.courses.map((course) => course.name.toLowerCase())).size, result.courses.length);
  } else {
    const duplicateCourses = result.courses.filter((course) => course.name === courseNames[0]);
    assert.equal(duplicateCourses.length, 2);
    assert.equal(new Set(duplicateCourses.map((course) => course.id)).size, 2);
    assert.equal(result.tasks.find((task) => task.id.endsWith("id=19999"))?.courseId, "course-99999");
  }
  assert.equal(result.tasks[0].dueAt, "2026-09-24T09:00:00.000Z");
  assert.equal(taskDetailRequests, expectedTasks);
  assert.equal(result.tasks[0].status, "submitted");
  assert.equal(result.tasks[0].submittedAt, "2026-09-22T03:00:00.000Z");
  assert.equal(result.tasks[0].instructorFiles[0].name, "Modul-10000.pdf");
  assert.equal(result.tasks[0].submissionFiles[0].name, "Jawaban-Alya.pdf");
  assert.equal(result.tasks[1].status, "todo");
  if (!useLiveFixtures) {
    assert.deepEqual(result.tasks[1].instructorFiles.map((item) => item.name), ["Modul-10001.pdf", "Modul Tree 10001.pdf"]);
  }

  const fileResponse = await downloadSpadaTaskFile(result.tasks[0].sourceUrl, result.tasks[0].submissionFiles[0].url);
  assert.equal(fileResponse.status, 200);
  assert.match(fileResponse.headers.get("content-disposition"), /attachment/);
  assert.equal(await fileResponse.text(), "isi-berkas-uji");
  if (!useLiveFixtures) {
    const treeFile = result.tasks[1].instructorFiles.find((item) => item.name === "Modul Tree 10001.pdf");
    assert.ok(treeFile);
    const treeFileResponse = await downloadSpadaTaskFile(result.tasks[1].sourceUrl, treeFile.url);
    assert.equal(treeFileResponse.status, 200);
    assert.equal(await treeFileResponse.text(), "isi-berkas-uji");
    await assert.rejects(
      downloadSpadaTaskFile(result.tasks[0].sourceUrl, treeFile.url),
      (error) => error instanceof SpadaError && error.code === "FILE_NOT_FOUND",
    );
  }
  await assert.rejects(
    downloadSpadaTaskFile(result.tasks[0].sourceUrl, "https://lmsslc.polinema.ac.id/pluginfile.php/1/assign/submission_files/tidak-ada.pdf"),
    (error) => error instanceof SpadaError && error.code === "FILE_NOT_FOUND",
  );
  await assert.rejects(
    downloadSpadaTaskFile(result.tasks[0].sourceUrl, "https://lmsslc.polinema.ac.id:444/pluginfile.php/1/assign/submission_files/Jawaban-Alya.pdf"),
    (error) => error instanceof SpadaError && error.code === "FILE_NOT_FOUND",
  );
  redirectDownloadToUnsafePort = true;
  await assert.rejects(
    downloadSpadaTaskFile(result.tasks[0].sourceUrl, result.tasks[0].submissionFiles[0].url),
    (error) => error instanceof SpadaError && error.code === "FILE_NOT_FOUND",
  );
  redirectDownloadToUnsafePort = false;
  oversizedDownload = true;
  await assert.rejects(
    downloadSpadaTaskFile(result.tasks[0].sourceUrl, result.tasks[0].submissionFiles[0].url),
    (error) => error instanceof SpadaError && error.code === "FILE_TOO_LARGE",
  );
  oversizedDownload = false;

  console.log(JSON.stringify({ courses: result.courses.length, tasks: result.tasks.length, coursePages: coursePageRequests, taskDetails: syncedTaskDetailRequests, attachments: "terlindungi", duplicateCourses: useLiveFixtures ? 0 : 1, fixture: useLiveFixtures ? "live" : "synthetic" }));
} finally {
  globalThis.fetch = originalFetch;
}
