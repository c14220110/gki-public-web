// api/warta-context.js
import { GoogleGenAI } from "@google/genai";

const APPS_URL =
  "https://script.google.com/macros/s/AKfycbwy43M6LfmKXBXOQuaLq1MvpjG1-0w2mAirMh3ipoYQeUEvXGp08YseKGmgKfnd80SQ6Q/exec";

// Model teks / dokumen yang punya free tier dan bisa baca PDF
const WARTA_MODEL = "gemini-2.5-pro";

// === CACHE DI MEMORY SERVERLESS ===
// Vercel akan reuse instance ini selama belum cold start
let lastFileId = null;
let lastContext = null;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[WARTA] GEMINI_API_KEY belum di-set di Vercel.");
    // Jangan bikin frontend error 500
    res.status(200).json({
      ok: false,
      context: "",
      reason: "GEMINI_API_KEY not set",
    });
    return;
  }

  try {
    // 1. Ambil daftar Warta dari Apps Script
    const listRes = await fetch(APPS_URL);
    if (!listRes.ok) {
      const txt = await listRes.text().catch(() => "");
      console.error(
        "[WARTA] Gagal fetch APPS_URL:",
        listRes.status,
        listRes.statusText,
        txt
      );
      res.status(200).json({
        ok: false,
        context: "",
        reason: "Failed to fetch warta list",
      });
      return;
    }

    const listJson = await listRes.json();
    const files = Array.isArray(listJson.files) ? listJson.files : [];

    if (!files.length) {
      console.warn("[WARTA] Tidak ada file warta dalam response Apps Script.");
      res.status(200).json({
        ok: true,
        context: "",
        reason: "No warta files",
      });
      return;
    }

    // 2. Ambil Warta paling baru (index 0)
    const latest = files[0];
    const latestId = latest.id;
    const latestName = latest.name || "Warta Jemaat";
    const latestModified = latest.modifiedTime || null;
    const pdfUrl = latest.downloadUrl || latest.viewUrl;

    if (!pdfUrl) {
      console.warn("[WARTA] File terbaru tanpa downloadUrl:", latestName);
      res.status(200).json({
        ok: true,
        context: "",
        reason: "Latest warta has no downloadUrl",
        title: latestName,
        modifiedTime: latestModified,
      });
      return;
    }

    // 3. Kalau masih sama dengan file yang terakhir diringkas → pakai cache
    if (lastFileId === latestId && lastContext) {
      console.log(
        "[WARTA] Menggunakan ringkasan dari cache untuk:",
        latestName
      );
      res.status(200).json({
        ok: true,
        context: lastContext,
        cached: true,
        title: latestName,
        modifiedTime: latestModified,
      });
      return;
    }

    console.log("[WARTA] Download & ringkas warta terbaru:", latestName);

    // 4. Download PDF dan ubah jadi base64
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) {
      const txt = await pdfRes.text().catch(() => "");
      console.error(
        "[WARTA] Gagal download PDF warta:",
        pdfRes.status,
        pdfRes.statusText,
        txt
      );
      res.status(200).json({
        ok: false,
        context: "",
        reason: "Failed to download warta PDF",
        title: latestName,
        modifiedTime: latestModified,
      });
      return;
    }

    const pdfArrayBuffer = await pdfRes.arrayBuffer();
    const pdfBase64 = Buffer.from(pdfArrayBuffer).toString("base64");

    // 5. Ringkas pakai Gemini 1.5 Flash (inlineData PDF)
    const client = new GoogleGenAI({ apiKey });

    const prompt = [
      `Kamu akan membaca file PDF Warta Jemaat berjudul "${latestName}" dari Gereja Kristen Indonesia (GKI) Kutisari Indah di Surabaya.`,
      "",
      "Tolong buat ringkasan dalam bahasa Indonesia yang rapi dan mudah dimengerti jemaat, dengan struktur:",
      "1. Tema utama ibadah / renungan minggu ini (maks 3 kalimat).",
      "2. Poin-poin pengumuman penting (ibadah, pelayanan, kegiatan kategorial, persekutuan, dll).",
      "3. Jadwal atau tanggal penting yang perlu diperhatikan jemaat.",
      "",
      "Jawabanmu maksimal sekitar 200 kata dan cocok dibacakan oleh asisten suara.",
    ].join("\n");

    const result = await client.models.generateContent({
      model: WARTA_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: pdfBase64,
                mimeType: "application/pdf",
              },
            },
          ],
        },
      ],
    });

    let summaryText = "";

    if (
      result &&
      result.response &&
      typeof result.response.text === "function"
    ) {
      summaryText = result.response.text();
    } else if (
      result &&
      result.response &&
      Array.isArray(result.response.candidates)
    ) {
      const first = result.response.candidates[0];
      if (
        first &&
        first.content &&
        Array.isArray(first.content.parts) &&
        first.content.parts.length
      ) {
        summaryText =
          first.content.parts
            .map((p) => p.text || "")
            .join(" ")
            .trim() || "";
      }
    }

    summaryText = (summaryText || "").trim();

    if (!summaryText) {
      console.warn("[WARTA] Ringkasan kosong untuk:", latestName);
      const fallback =
        `Warta jemaat terbaru berjudul "${latestName}" sudah tersedia, ` +
        `namun ringkasan otomatis tidak berhasil dibuat. ` +
        `Silakan baca file wartanya secara langsung untuk informasi lengkap.`;

      lastFileId = latestId;
      lastContext = fallback;

      res.status(200).json({
        ok: true,
        context: fallback,
        cached: false,
        title: latestName,
        modifiedTime: latestModified,
      });
      return;
    }

    const fullContext = `Ringkasan Warta Jemaat terbaru "${latestName}":\n${summaryText}`;

    // 6. Simpan ke cache
    lastFileId = latestId;
    lastContext = fullContext;

    res.status(200).json({
      ok: true,
      context: fullContext,
      cached: false,
      title: latestName,
      modifiedTime: latestModified,
    });
  } catch (err) {
    console.error("[WARTA] Fatal error saat build context:", err);
    // Tetap balikin 200 supaya frontend tidak error
    res.status(200).json({
      ok: false,
      context: "",
      reason: "Unexpected error while building warta context",
    });
  }
}
