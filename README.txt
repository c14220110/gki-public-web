 GKI Kutisari Indah – Public Web

Landing page statis untuk website publik GKI Kutisari Indah (GKI KI).
Project ini berisi satu halaman utama (`index.html`) dengan jadwal ibadah, warta jemaat, highlight YouTube, galeri kegiatan, dan informasi kontak gereja.

Fokusnya:

 Mudah di-host di static hosting (Vercel, Netlify, GitHub Pages, dll).
 Hanya memakai HTML + Tailwind CDN + CSS custom + JavaScript vanilla.
 Beberapa bagian konten diambil dinamis dari:

   Google Apps Script (Warta & YouTube spotlight, via JSONP).
   YouTube Data API v3 (fallback langsung ke API YouTube).
   Elfsight (galeri Instagram).

---

 Tech Stack

Frontend:

 HTML5 satu halaman (`index.html`)
 [Tailwind CSS](https://tailwindcss.com/) via CDN (`https://cdn.tailwindcss.com`)
 [GSAP 3](https://greensock.com/gsap/) via CDN (untuk animasi preloader)
 [Google Fonts](https://fonts.google.com/) – `Inter` & `Oswald`
 CSS custom di `css/styles.css`
 JavaScript vanilla di `js/app.js`

Integrasi & Layanan Eksternal:

 Google Apps Script (endpoint `APPS_URL`)

   Service `?service=warta` → data Warta Jemaat (JSONP).
   Service `?service=yt` → data video YouTube terbaru/live (JSONP).
 YouTube Data API v3 (opsional, pakai `YT_API_KEY`)

   Untuk fallback jika JSONP ke Apps Script gagal.
 Elfsight widget → embed galeri (umumnya Instagram feed).
 WhatsApp & Telepon → link kontak langsung ke gereja & pendeta.

Tidak ada Node, npm, bundler, ataupun backend lain di repo ini.

---

 Struktur Proyek

Struktur utama yang relevan untuk frontend:

```text
.
├── index.html           Halaman utama (one-page site)
├── css
│   └── styles.css       CSS custom (tema, glass, animasi scroll, dsb.)
├── js
│   └── app.js           JS utama (preloader, JSONP, YouTube, Warta, dsb.)
└── assets
    ├── bg_gki.mp4       Video background hero
    ├── galeri1.jpg      (Saat ini tidak dipakai langsung)
    ├── galeri2.jpg
    ├── galeri3.jpg
    ├── galeri4.jpg
    ├── gedung_gereja.jpg
    ├── logo.png
    ├── paskah.jpg
    ├── pastor.jpg
    ├── peta_lokasi.jpg
    ├── seminar.jpg
    └── warta.jpg
```

> Catatan: di `index.html` ada referensi `poster="assets/bg_gki_poster.jpg"` untuk video hero, tapi file tersebut belum ada di folder `assets`. Disarankan menambahkan file poster ini atau mengganti namanya.

---

 Penjelasan Tiap Bagian

 1. `index.html`

Halaman utama terdiri dari:

 `<head>`

 Set charset & viewport.
 `<title>`: “GKI Kutisari Indah | Gereja Modern di Surabaya”
 Load:

   Tailwind CSS via CDN.
   GSAP via cdnjs (defer).
   Google Fonts (Inter & Oswald).
   Preconnect ke:

     `i.ytimg.com` dan `youtube.com` (thumbnail & embed YouTube).
     `elfsightcdn.com` (script galeri).
   CSS custom: `css/styles.css`.

 Preloader (`preloader`)

 Overlay full-screen yang muncul saat awal load.
 Menampilkan teks “GKI” dan “KUTISARI” dengan efek animasi huruf.
 Dikontrol di `app.js`:

   Menggunakan GSAP timeline untuk animasi masuk/keluar preloader.
   Minimal tampil selama `MIN_PRELOADER_MS` (800ms) agar transisi terasa halus.
   Setelah selesai → `preloader` dihilangkan, `<main>` dan `<header>` difade-in.

 Header (`<header id="header">`)

 Navbar dengan:

   Logo gereja (`assets/logo.png`) + teks “GKI KUTISARI”.
   Menu: Beranda, Tentang Kami, Jadwal, Warta, Galeri, Kontak.
   Tombol “Gabung Pelayanan” → link WhatsApp (`https://api.whatsapp.com/send/?phone=6281332240711`).
 Untuk mobile:

   Tombol burger dengan `id="mobile-menu-button"`.
   Menu mobile (`mobile-menu`) yang ditoggle oleh JS.
 Di `app.js`:

   Header diberi class `shadow-lg` ketika scroll > 10px (efek bayangan sticky).

 Main (`<main>`)

Berisi beberapa section utama:

 a. Hero / Beranda (`<section id="beranda">`)

 Full viewport (`h-screen`) dengan:

   Video background: `assets/bg_gki.mp4` (autoplay, muted, loop).
   Overlay gradient (`.hero-overlay`).
   Judul: “Selamat Datang di GKI Kutisari Indah”.
   Subjudul: deskripsi singkat gereja.
   CTA:

     “Lihat Jadwal Ibadah” → scroll ke `jadwal`.
     “Kunjungi Kami” → scroll ke `kontak`.
   Indicator “scroll ke bawah” dengan ikon panah.

 b. Jadwal Ibadah & Kegiatan (`<section id="jadwal">`)

 Judul & subjudul.
 Grid card (`.glass-card`) jadwal ibadah:

   Ibadah Umum I, II, III (jam & gaya ibadah).
   Kegiatan lain jika ditambahkan (komsel, youth, dll).
 Semua card pakai data-animate → akan muncul dengan animasi scroll (via IntersectionObserver + CSS).

 c. YouTube Spotlight (`youtube-spotlight-container`)

 Container kosong yang akan diisi dinamis oleh `app.js`.
 JS akan menambahkan satu card berisi:

   Thumbnail video.
   Badge: `LIVE`, `SEGERA`, atau `TERBARU`.
   Judul video.
   Info waktu:

     Jika live: “Sedang live sekarang.”
     Jika upcoming: jadwal tayang (format lokal `id-ID`).
     Jika biasa: tanggal upload (format lokal `id-ID`).
   Tombol:

     “Tonton di YouTube”.
     “Kunjungi Channel →”.

 d. Warta & Acara Mendatang (`<section id="warta">`)

 Judul & subjudul.
 Grid kosong dengan `id="warta-grid"`.
 Diisi oleh `window.renderWarta` (dipanggil via JSONP dari Apps Script).
 Tiap card berisi:

   Thumbnail (dari Google Drive).
   Nama file / nama warta.
   Tanggal terakhir diubah (formatted bahasa Indonesia).
   Link:

     “Unduh Warta →” (`downloadUrl`).
     “Lihat Pratinjau” (`viewUrl`).

 e. Tentang Gereja & Gembala (`<section id="tentang">`)

2 blok utama:

1. Tentang Gereja

    Gambar gedung gereja (`assets/gedung_gereja.jpg`).
    Teks penjelasan singkat identitas GKI KI (visi, suasana ibadah, dsb).
    Button opsional: “Visi, Misi & Sejarah” (saat ini hanya dummy link `href=""`).

2. Profil Gembala Sidang

    Foto gembala (`assets/pastor.jpg`).
    Nama: Pdt. William Suryajaya.
    Info kontak:

      Telepon (ikon telepon + `tel:`).
      WhatsApp (link `https://wa.me/6287808786969`).
    Highlight cara menghubungi pendeta.

 f. Galeri Kegiatan (`<section id="galeri">`)

 Judul & subjudul.
 Konten utama: sebuah `<div>` dengan class `elfsight-app-...` dan `data-elfsight-app-lazy`.
 Ketika user scroll mendekati section ini:

   `app.js` meload script `https://elfsightcdn.com/platform.js` secara malas (lazy-load).
   Widget Elfsight akan render galeri (biasanya feed Instagram).
 Ada fallback `<noscript>` / teks:

   Info agar mengaktifkan JavaScript.
   Link ke Instagram resmi: `https://www.instagram.com/gkikutisariindah/`.

 g. Kontak & Lokasi (`<section id="kontak">`)

 Judul & subjudul.
 Card kontak (`.glass-card`) berisi:

   Alamat gereja (Jl. Raya Kutisari Indah No.139, Surabaya).
   Info kantor gereja + link WhatsApp administrasi (`https://wa.me/6281332240711`).
   Informasi kontak lain sesuai markup.
 Visual map/gambar bisa memakai `assets/peta_lokasi.jpg` jika mau (saat ini tidak dispakai di HTML).

 Footer

 Background gelap (`--color-footer-bg`).
 3 kolom (umumnya):

   Logo & deskripsi singkat.
   Quick links (jadwal, warta, dsb).
   Ikon social:

     Instagram: `https://www.instagram.com/gkikutisariindah/`
     Facebook: `https://www.facebook.com/gkikutisariindah`
 Baris bawah:

   `© <span id="year"></span> GKI Kutisari Indah. Dikembangkan sebagai bagian dari pelayanan oleh Mahasiswa UK Petra.`
   Nilai `<span id="year">` diisi oleh `app.js` dengan `new Date().getFullYear()`.

---

 2. `css/styles.css`

Isi CSS ini melengkapi Tailwind, terutama untuk:

 Design system / tema:

  ```css
  :root {
    --color-text-main: 1f2937;
    --color-text-secondary: 4b5563;
    --color-text-accent: d97706;
    --color-background: ffffff;
    --color-surface-glass: rgba(255, 255, 255, 0.3);
    --color-border-glass: rgba(255, 255, 255, 0.4);
    --color-footer-bg: 1f2937;
    --color-footer-text: d1d5db;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      / warna diganti versi dark /
    }
  }
  ```

  Jadi warna utama gampang diganti hanya lewat variabel.

 Glassmorphism: class `.glass-card`
  Background semi-transparan + blur + border.

 Buttons: `.btn`, `.btn-primary`, `.btn-secondary`
  Border radius pill, shadow, hover transition.

 Typography: `.section-title`, `.section-subtitle`, dsb.

 Animasi scroll:

  ```css
  [data-animate] {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  [data-animate].is-visible {
    opacity: 1;
    transform: translateY(0);
  }
  ```

 Optimisasi performa:

  ```css
  tentang,
  warta,
  galeri,
  kontak {
    content-visibility: auto;
    contain-intrinsic-size: 1000px;
  }
  ```

  Ini membuat browser menunda render penuh section yang jauh di bawah viewport, sehingga first paint lebih cepat.

---

 3. `js/app.js`

File ini meng-handle:

 a. Konfigurasi

```js
const APPS_URL = "https://script.google.com/macros/s/....../exec";
const CHANNEL_ID = "UCLDrtr-jxpA0h9WzmgUiKdQ";
const YT_API_KEY = "...."; // opsional
```

 APPS_URL
  Harus diarahkan ke deployment Google Apps Script yang Anda miliki.
 CHANNEL_ID
  ID channel YouTube GKI Kutisari Indah.
 YT_API_KEY
  API key YouTube Data API (dipakai untuk fallback jika Apps Script tidak merespon).

> Saran produksi: pindahkan API key ke tempat yang lebih aman (jangan disimpan plaintext di repo publik).

 b. Utility JSONP

```js
function injectScript(src, onerror) {
  const s = document.createElement("script");
  s.src = src;
  s.async = true;
  s.onerror = onerror;
  document.body.appendChild(s);
}
```

Dipakai untuk mem-bypass CORS dengan cara `script src="APPS_URL?...&callback=renderXXX"`.

 c. YouTube Spotlight

1. Callback JSONP – `window.renderYT(data)`

   Ekspektasi struktur `data` dari Apps Script:

   ```js
   {
     status: "live" | "upcoming" | "latest",
     video: {
       id: "...",
       title: "...",
       url: "https://www.youtube.com/watch?v=...",
       publishedAt: "2024-01-01T...",
       liveDetails?: {
         scheduledStartTime?: "...",
       },
       thumbnails?: { / high / standard url / }
     }
   }
   ```

   Fungsi ini:

    Menandai `window.__ytJsonpOk = true`.
    Menentukan badge berdasarkan `status`.
    Memilih thumbnail (resolusi tinggi kalau ada).
    Menghitung teks waktu (live/upcoming/diunggah).
    Membuat elemen card dan menyisipkannya ke `youtube-spotlight-container`.

2. Fallback langsung ke YouTube API – `async function fetchYouTubeDirect(...)`

    Coba cari video LIVE dulu via endpoint `search` (`eventType=live`).
    Jika tidak ada:

      Coba cari video upcoming (`eventType=upcoming`).
    Jika tetap tidak ada:

      Ambil video terbaru via `search` biasa (`order=date`).
    Setelah dapat `videoId`:

      Panggil endpoint `videos?part=snippet,liveStreamingDetails&id=...`.
      Susun object `data` dan panggil `window.renderYT(data)`.

 d. Warta Jemaat

Callback JSONP – `window.renderWarta(data)`

Ekspektasi struktur `data` dari Apps Script:

```js
{
  files: [
    {
      name: "Warta 5 Januari 2025",
      modifiedTime: "2025-01-05T...",
      thumbnailUrl: "https://.../thumbnail",
      downloadUrl: "https://.../download",
      viewUrl: "https://.../view"
    },
    ...
  ];
}
```

 Menandai `window.__wartaJsonpOk = true`.
 Jika `files` kosong → tampilkan pesan “Belum ada Warta terbaru.”
 Untuk setiap file:

   Format tanggal `modifiedTime` ke bahasa Indonesia (hari, tanggal, bulan, tahun).
   Render card ke dalam `warta-grid`.

 e. DOMContentLoaded handler

Saat `document.addEventListener("DOMContentLoaded", ...)`:

1. Preloader + fade-in

    Jika `window.gsap` tersedia → animasi huruf + fade out preloader.

2. Mobile menu

    Toggle `hidden` pada `mobile-menu`.
    Tutup menu saat link navigasi diklik.

3. Footer year

    Isi `<span id="year">` dengan tahun saat ini.

4. Scroll reveal

    Buat `IntersectionObserver` untuk semua `[data-animate]`.
    Saat elemen masuk viewport:

      Tambahkan class `.is-visible` (animasi fade-in di CSS).

5. Header shadow

    Tambah/hapus class `shadow-lg` berdasarkan `window.scrollY`.

6. Load Warta dari Apps Script (JSONP)

   ```js
   const WARTA_JSONP_URL = `${APPS_URL}?service=warta&callback=renderWarta`;
   injectScript(WARTA_JSONP_URL, () => { / fallback teks error / });
   ```

7. Load YouTube dari Apps Script (JSONP) + fallback API

   ```js
   const YT_JSONP_URL =
     `${APPS_URL}?service=yt&channelId=${encodeURIComponent(CHANNEL_ID)}&callback=renderYT`;

   injectScript(YT_JSONP_URL, () => fetchYouTubeDirect(CHANNEL_ID, YT_API_KEY));

   // Timeout 12 detik: kalau JSONP tidak OK, pakai API langsung
   setTimeout(() => {
     if (!window.__ytJsonpOk) fetchYouTubeDirect(CHANNEL_ID, YT_API_KEY);
   }, 12000);
   ```

8. Lazy-load Elfsight

    Observasi `galeri` dengan `rootMargin: "800px"`.
    Saat mendekati viewport untuk pertama kali:

      Tambah script `https://elfsightcdn.com/platform.js`.
      Set `window.elfsightLoaded = true`.
      `disconnect()` observer.

---

 Cara Menjalankan di Local

Tidak perlu build step. Cukup:

 Opsi 1 – Buka langsung

1. Download / clone folder project.
2. Buka `index.html` dengan browser modern (Chrome, Edge, Firefox).
3. Pastikan perangkat terhubung internet agar:

    Tailwind, GSAP, Google Fonts ter-load.
    Warta & YouTube bisa diambil dari Apps Script/YouTube API.
    Elfsight galeri tampil.

 Opsi 2 – Live Server (VS Code)

1. Buka folder di VS Code.
2. Install extension “Live Server”.
3. Klik kanan `index.html` → Open with Live Server.
4. Repo ini punya `.vscode/settings.json`:

   ```json
   {
     "liveServer.settings.port": 5502
   }
   ```

   Jadi Live Server biasanya akan jalan di `http://localhost:5502`.

---

 Konfigurasi yang Perlu Dicek Ulang

Untuk programmer yang mau lanjut maintain/prod:

1. APPS_URL di `js/app.js`

    Ganti dengan Apps Script milik gereja sendiri.
    Pastikan service yang di-handle:

      `?service=warta&callback=renderWarta`
      `?service=yt&channelId=...&callback=renderYT`

2. Struktur response Apps Script

    Pastikan match dengan ekspektasi `window.renderWarta` dan `window.renderYT` (lihat bagian di atas).

3. YouTube API Key (`YT_API_KEY`)

    Untuk environment publik, sebaiknya:

      Dipindah ke server / proxy.
      Atau hanya pakai JSONP via Apps Script tanpa expose API key di client.

4. Channel ID & Social Media

    `CHANNEL_ID` (YouTube).
    Link Instagram & Facebook di `index.html`.

5. Kontak & Alamat

    Nomor WA di beberapa tempat:

      Tombol “Gabung Pelayanan”.
      Kontak kantor gereja.
      Kontak pendeta.
    Alamat gereja & teks deskripsi → sesuaikan jika ada perubahan.

6. Assets

    Tambahkan `assets/bg_gki_poster.jpg` (poster untuk video hero) atau ubah referensinya.
    Gambar lain (paskah, warta, seminar, galeri1-4, peta_lokasi, dll.) bisa dipakai untuk konten tambahan atau dihapus jika tidak diperlukan.

---