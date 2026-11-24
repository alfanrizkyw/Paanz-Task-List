# Paanz Task List

Aplikasi untuk mahasiswa Polinema melihat mata kuliah, tugas, deadline, status pengerjaan, dan alur pengumpulan SPADA/Moodle dalam satu tampilan.

## Menjalankan secara lokal

```bash
npm install
npm run dev
```

Buka `http://localhost:3000`.

## Environment

Salin `.env.example` ke `.env.local`, lalu isi `AUTH_SECRET` dengan nilai acak minimal 32 karakter. Jangan commit `.env.local`.

Variabel opsional:

- `SPADA_BASE_URL` — alamat dasar SPADA
- `MOODLE_BASE_URL` — alamat dasar Moodle
- `CHROME_PATH` — lokasi Chrome atau Edge untuk pengumpulan di server non-Vercel

## Script

- `npm run dev` — server pengembangan
- `npm run build` — build produksi
- `npm run start` — menjalankan build produksi
- `npm run lint` — pemeriksaan ESLint

## Sesi dan keamanan

Password SIAKAD tidak disimpan. Sesi kampus disimpan dalam cookie HTTP-only terenkripsi, dan pengumpulan hanya diterima setelah server memverifikasi status serta berkas atau jawaban yang dikirim.
