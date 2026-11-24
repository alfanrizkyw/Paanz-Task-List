import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = `${readFileSync(resolve(root, "src/lib/spada.ts"), "utf8")}\nexport { courseCards, cardTitle, extractLinks, parseSpadaTree, parseMoodleDate, submissionStatus, tableRows, taskTitle };`;
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
});
const parserModule = { exports: {} };
const requireStub = (id) => {
  if (id === "server-only") return {};
  if (id === "node:fs") return { existsSync };
  if (id === "@/lib/spada-session") return { readSpadaSession: async () => null, writeSpadaSession: async () => undefined };
  throw new Error(`Unexpected import in parser test: ${id}`);
};
new Function("require", "module", "exports", outputText)(requireStub, parserModule, parserModule.exports);
const {
  courseCards,
  cardTitle,
  extractLinks,
  parseSpadaTree,
  parseMoodleDate,
  submissionStatus,
  tableRows,
  taskTitle,
} = parserModule.exports;

const cardsHtml = `
  <div class="gallery_grid">
    <div title="Pemrograman Web" class="gallery_grid_item md-card-content">
      <a target="_blank" href="https://slc.polinema.ac.id/spada/?gotourl=https%253A%252F%252Flmsslc.polinema.ac.id%252Fcourse%252Fview.php%253Fid%253D13310"><img src="course.jpg" alt=""></a>
      <div title="Pemrograman Web" class="gallery_grid_image_caption"><span class="gallery_image_title uk-text-truncate">Pemrograman Web</span></div>
    </div>
    <div title="Statistika" class="gallery_grid_item md-card-content">
      <img class="bw" src="course.jpg" alt="">
      <div title="Statistika" class="gallery_grid_image_caption"><span class="gallery_image_title uk-text-truncate">Statistika</span></div>
    </div>
  </div>`;
const cards = courseCards(cardsHtml);
assert.equal(cards.length, 2);
assert.equal(cardTitle(cards[0]), "Pemrograman Web");
assert.equal(cardTitle(cards[1]), "Statistika");
const courseLinks = extractLinks(cards[0], "https://slc.polinema.ac.id/spada/?mod=matakuliah");
assert.equal(courseLinks.length, 1);
assert.match(courseLinks[0].href, /gotourl=/);
assert.equal(courseLinks[0].text, "");

const submittedAnswer = encodeURIComponent(JSON.stringify([{
  status: "Submitted for grading",
  timemodified: "Monday, 2 November 2026, 10:00 AM",
}]));
const tree = parseSpadaTree([{
  key: 13310,
  title: '<span title="Pemrograman Web : Diploma IV Sistem Informasi Bisnis"><strong>Pemrograman Web : Diploma IV Sistem Informasi Bisnis</strong></span>',
  folder: 1,
  children: [{
    key: 10,
    title: '<span title="Pertemuan ke 1">Pertemuan ke 1</span>',
    folder: 1,
    children: [
      {
        key: "1",
        title: '<span idmodule="1001" jenis="submit" allowsubmissionsfromdate="Senin, 2 November 2026 Jam 08:00:00" duedate="Selasa, 3 November 2026 Jam 23:59:00" txt="" jawaban="%5B%5D" title="Tugas pertama">Tugas pertama</span>',
      },
      {
        key: "2",
        title: `<span idmodule="1002" jenis="submit" allowsubmissionsfromdate="Senin, 2 November 2026 Jam 08:00:00" duedate="Rabu, 4 November 2026 Jam 23:59:00" txt="" jawaban="${submittedAnswer}" title="Tugas kedua">Tugas kedua</span>`,
      },
    ],
  }],
}]);
assert.equal(tree.courses.length, 1);
assert.equal(tree.courses[0].name, "Pemrograman Web");
assert.equal(tree.tasks.length, 2);
assert.equal(tree.tasks[0].status, "todo");
assert.equal(tree.tasks[0].title, "Tugas pertama — Pertemuan ke 1");
assert.equal(tree.tasks[0].dueAt, "2026-11-03T16:59:00.000Z");
assert.equal(tree.tasks[0].sourceUrl, "https://lmsslc.polinema.ac.id/mod/assign/view.php?id=1001");
assert.equal(tree.tasks[1].status, "submitted");
assert.equal(tree.tasks[1].submittedAt, "2026-11-02T03:00:00.000Z");

const moodleHtml = `
  <h1>Nama mata kuliah</h1>
  <div role="main"><h2>Judul tugas sebenarnya</h2>
    <table>
      <tr><th>Submission status</th><td>No attempt</td></tr>
      <tr><th>Due date</th><td>Saturday, 21 November 2026, 12:00 AM</td></tr>
    </table>
  </div>`;
assert.equal(taskTitle(moodleHtml, "Tugas"), "Judul tugas sebenarnya");
const rows = tableRows(moodleHtml);
const due = rows.find((cells) => cells[0] === "Due date")?.[1] ?? "";
const status = rows.find((cells) => cells[0] === "Submission status")?.[1] ?? "";
assert.equal(parseMoodleDate(due), "2026-11-20T17:00:00.000Z");
assert.equal(parseMoodleDate("Kamis, 24 September 2026 Jam 08:00:00"), "2026-09-24T01:00:00.000Z");
assert.equal(submissionStatus(status), "todo");

const liveDashboardPath = resolve(root, ".data/spada-live.html");
if (existsSync(liveDashboardPath)) {
  const liveCards = courseCards(readFileSync(liveDashboardPath, "utf8"));
  assert.equal(liveCards.length, 9);
  assert.equal(cardTitle(liveCards[2]), "Pemrograman Web");
  assert.match(extractLinks(liveCards[2], "https://slc.polinema.ac.id/spada/?mod=matakuliah")[0].href, /id%253D13310/);
}

const liveTreePath = resolve(root, ".data/spada-tree.json");
if (existsSync(liveTreePath)) {
  const liveTree = parseSpadaTree(JSON.parse(readFileSync(liveTreePath, "utf8")));
  assert.equal(liveTree.courses.length, 5);
  assert.equal(liveTree.tasks.length, 37);
  assert.ok(liveTree.tasks.every((task) => task.dueAt));
  assert.ok(liveTree.tasks.every((task) => /^https:\/\/lmsslc\.polinema\.ac\.id\/mod\/assign\/view\.php\?id=\d+$/.test(task.sourceUrl)));
}

const liveAssignmentPath = resolve(root, ".data/moodle-assignment.html");
if (existsSync(liveAssignmentPath)) {
  const html = readFileSync(liveAssignmentPath, "utf8");
  assert.equal(taskTitle(html, "Tugas"), "SIB 2F - Konfigurasi Access Point (Upload Konfigurasi Terbaru)");
  const liveRows = tableRows(html);
  const liveStatus = liveRows.find((cells) => cells[0] === "Submission status")?.[1] ?? "";
  const liveDue = liveRows.find((cells) => cells[0] === "Due date")?.[1] ?? "";
  assert.equal(submissionStatus(liveStatus), "todo");
  assert.equal(parseMoodleDate(liveDue), "2026-11-20T17:00:00.000Z");
}

console.log(JSON.stringify({
  cards: cards.length,
  treeTasks: tree.tasks.length,
  liveDashboardChecked: existsSync(liveDashboardPath),
  liveTreeChecked: existsSync(liveTreePath),
  liveAssignmentChecked: existsSync(liveAssignmentPath),
}));
