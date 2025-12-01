// api/warta-context.js

// URL Apps Script yang sudah kamu pakai di front-end
const APPS_URL =
  "https://script.google.com/macros/s/AKfycbwy43M6LfmKXBXOQuaLq1MvpjG1-0w2mAirMh3ipoYQeUEvXGp08YseKGmgKfnd80SQ6Q/exec";

// Pakai Gemini 2.5 Flash yang stabil & free tier buat summary PDF
const GEMINI_MODEL = "models/gemini-2.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- CACHE DI MEMORY (per instance serverless) ---
let cachedFileId = null;
let cachedSummary = null;
let cachedSource = null;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, reason: "Method not allowed" });
    return;
  }

  // Pastikan API key ada
  if (!GEMINI_API_KEY) {
    console.error("[WARTA] Missing GEMINI_API_KEY env var");
    res.status(200).json({
      ok: false,
      reason: "Server belum dikonfigurasi GEMINI_API_KEY",
    });
    return;
  }

  try {
    // 1) Ambil list Warta dari Apps Script
    const appsRes = await fetch(APPS_URL);
    if (!appsRes.ok) {
      const text = await appsRes.text().catch(() => "");
      console.error(
        "[WARTA] Apps Script error:",
        appsRes.status,
        appsRes.statusText,
        text
      );
      res.status(200).json({
        ok: false,
        reason: `Apps Script error: ${appsRes.status} ${appsRes.statusText}`,
      });
      return;
    }

    const data = await appsRes.json();
    const files = Array.isArray(data.files) ? data.files : [];

    if (!files.length) {
      console.warn("[WARTA] Tidak ada files di Apps Script JSON");
      res.status(200).json({
        ok: false,
        reason: "Tidak ada file Warta di Apps Script",
      });
      return;
    }

    // 2) Ambil file terbaru (by modifiedTime desc)
    const sorted = [...files].sort(
      (a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime)
    );
    const latest = sorted[0];

    const fileId = latest.id;
    const fileName = latest.name;
    const downloadUrl = latest.downloadUrl;
    const modifiedTime = latest.modifiedTime;

    if (!downloadUrl) {
      res.status(200).json({
        ok: false,
        reason: "File Warta tidak punya downloadUrl",
      });
      return;
    }

    // 3) Kalau fileId sama dengan cache & sudah ada summary → pakai cache
    if (cachedFileId === fileId && cachedSummary && cachedSource) {
      console.log("[WARTA] Using cached summary for", fileName);
      res.status(200).json({
        ok: true,
        source: cachedSource,
        summary: cachedSummary,
        fromCache: true,
      });
      return;
    }

    console.log("[WARTA] Fetching PDF for summarization:", fileName);

    // 4) Download PDF binary dari Google Drive
    const pdfRes = await fetch(downloadUrl);
    if (!pdfRes.ok) {
      const text = await pdfRes.text().catch(() => "");
      console.error(
        "[WARTA] Gagal download PDF:",
        pdfRes.status,
        pdfRes.statusText,
        text
      );
      res.status(200).json({
        ok: false,
        reason: `Gagal download PDF: ${pdfRes.status} ${pdfRes.statusText}`,
      });
      return;
    }

    const pdfArrayBuffer = await pdfRes.arrayBuffer();
    const pdfBase64 = Buffer.from(pdfArrayBuffer).toString("base64");

    // 5) Panggil Gemini untuk merangkum PDF
    const promptText =
      "Dokumen ini adalah Warta Jemaat / buletin gereja." +
      " Tolong ringkas isi dokumen ini dalam 10–15 poin bullet berbahasa Indonesia yang singkat & jelas." +
      " Fokus pada: tema ibadah, pengumuman penting, jadwal ibadah, pelayanan, kegiatan komunitas, dan informasi lain yang relevan untuk jemaat." +
      " Jangan tulis ulang isi PDF apa adanya, tapi buat ringkasan yang mudah dimengerti jemaat.";

    const geminiUrl =
      "https://generativelanguage.googleapis.com/v1beta/" +
      GEMINI_MODEL +
      ":generateContent?key=" +
      encodeURIComponent(GEMINI_API_KEY);

    const genRes = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: pdfBase64,
                },
              },
              {
                text: promptText,
              },
            ],
          },
        ],
      }),
    });

    if (!genRes.ok) {
      const text = await genRes.text().catch(() => "");
      console.error("[WARTA] Gemini API error:", genRes.status, text);
      res.status(200).json({
        ok: false,
        reason: `Gemini API error: ${genRes.status}`,
        details: text.slice(0, 300),
      });
      return;
    }

    const genJson = await genRes.json();

    const summaryText =
      genJson?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("")
        .trim() || "";

    if (!summaryText) {
      console.error("[WARTA] Summary kosong dari Gemini:", genJson);
      res.status(200).json({
        ok: false,
        reason: "Ringkasan dari Gemini kosong",
      });
      return;
    }

    // 6) Simpan cache di memory
    cachedFileId = fileId;
    cachedSummary = summaryText;
    cachedSource = { id: fileId, name: fileName, modifiedTime };

    console.log("[WARTA] Summary generated for", fileName);

    res.status(200).json({
      ok: true,
      source: cachedSource,
      summary: cachedSummary,
      fromCache: false,
    });
  } catch (err) {
    console.error(
      "[WARTA] Unexpected error while building warta context:",
      err
    );
    res.status(200).json({
      ok: false,
      reason: "Unexpected error while building warta context",
    });
  }
}
