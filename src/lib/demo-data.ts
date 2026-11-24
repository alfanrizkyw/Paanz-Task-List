import type { Course, Task } from "@/lib/types";

function at(days: number, hour: number, minute = 0) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export const demoCourses: Course[] = [
  { id: "basis-data", code: "BD-01", name: "Basis Data", lecturer: "Adi Sutrisno" },
  { id: "pemrograman-web", code: "PW-02", name: "Pemrograman Web", lecturer: "Rina Kartika" },
  { id: "kecerdasan-buatan", code: "KBA-03", name: "Kecerdasan Buatan", lecturer: "Yoga Pratama" },
  { id: "jaringan-komputer", code: "JK-04", name: "Jaringan Komputer", lecturer: "Dimas Saputra" },
];

export const demoTasks: Task[] = [
  {
    id: "demo-1",
    courseId: "basis-data",
    title: "Laporan praktikum JOIN dan VIEW",
    kind: "Praktikum",
    dueAt: at(1, 23, 59),
    status: "doing",
    description: "Kerjakan modul praktikum dan unggah laporan beserta tangkapan layar hasil query.",
  },
  {
    id: "demo-2",
    courseId: "pemrograman-web",
    title: "Tugas API daftar tugas mahasiswa",
    kind: "Tugas",
    dueAt: at(2, 20, 0),
    status: "todo",
    description: "Buat endpoint daftar tugas dengan status, deadline, dan pengelompokan mata kuliah.",
  },
  {
    id: "demo-3",
    courseId: "kecerdasan-buatan",
    title: "Kuis clustering",
    kind: "Kuis",
    dueAt: at(3, 19, 0),
    status: "todo",
    description: "Kerjakan kuis materi K-Means dan hierarkical clustering.",
  },
  {
    id: "demo-4",
    courseId: "jaringan-komputer",
    title: "Simulasi subnetting kelas B",
    kind: "Praktikum",
    dueAt: at(5, 21, 0),
    status: "done",
    description: "Simulasikan pembagian subnet dan dokumentasikan tabel alamat IP.",
  },
  {
    id: "demo-5",
    courseId: "basis-data",
    title: "Presentasi ERD perpustakaan",
    kind: "Proyek",
    dueAt: at(-1, 23, 59),
    status: "todo",
    description: "Susun ERD dan presentasikan alur transaksi perpustakaan.",
  },
  {
    id: "demo-6",
    courseId: "pemrograman-web",
    title: "Proyek akhir dashboard responsif",
    kind: "Proyek",
    dueAt: at(12, 23, 59),
    status: "doing",
    description: "Bangun dashboard responsif dengan tema gelap dan terang.",
  },
  {
    id: "demo-7",
    courseId: "jaringan-komputer",
    title: "Latihan konfigurasi VLAN",
    kind: "Tugas",
    dueAt: at(-4, 20, 0),
    status: "submitted",
    submittedAt: at(-5, 18, 30),
    description: "Konfigurasikan VLAN dan unggah berkas topologi.",
  },
];
