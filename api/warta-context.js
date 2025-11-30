// api/warta-context.js
import { GoogleGenAI } from "@google/genai";

const APPS_URL =
  "https://script.google.com/macros/s/AKfycbwy43M6LfmKXBXOQuaLq1MvpjG1-0w2mAirMh3ipoYQeUEvXGp08YseKGmgKfnd80SQ6Q/exec";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(500).json({ error: "GEMINI_API_KEY is not set" });
      return;
    }

    // 1. Ambil daftar Warta dari Apps Script (JSON biasa, bukan JSONP)
    const listRes = await fetch(APPS_URL);
    if (!listRes.ok) {
      const text = await listRes.text().catch(() => "");
      throw new Error(
        `Gagal fetch daftar warta (status ${listRes.status}): ${text}`
      );
    }

    const listJson = await listRes.json();
    const files = Array.isArray(listJson.files) ? listJson.files : [];

    if (!files.length) {
      res.status(200).json({
        summary: null,
        title: null,
        modifiedTime: null,
        source: null,
      });
      return;
    }

    // 2. Ambil Warta paling baru (asumsi urut dari terbaru)
    const latest = files[0];
    const pdfUrl = latest.downloadUrl || latest.viewUrl;

    if (!pdfUrl) {
      res.status(200).json({
        summary: null,
        title: latest.name || null,
        modifiedTime: latest.modifiedTime || null,
        source: {
          id: latest.id,
          viewUrl: latest.viewUrl || null,
          downloadUrl: latest.downloadUrl || null,
        },
      });
      return;
    }

    // 3. Download PDF Warta
    const pdfRes = await fetch(pdfUrl);
    if (!pdfRes.ok) {
      const text = await pdfRes.text().catch(() => "");
      throw new Error(
        `Gagal download PDF warta (status ${pdfRes.status}): ${text}`
      );
    }

    const pdfArrayBuffer = await pdfRes.arrayBuffer();
    const pdfBase64 = Buffer.from(pdfArrayBuffer).toString("base64");

    // 4. Ringkas pakai Gemini (model teks, bukan live audio)
    const client = new GoogleGenAI({ apiKey });

    const model = "gemini-2.5-flash-lite"; // free tier, cukup buat summarization

    const prompt = [
      "Kamu akan membaca file PDF Warta Jemaat dari Gereja Kristen Indonesia (GKI) Kutisari Indah di Surabaya.",
      "",
      "Tugasmu: ringkas isi Warta ini dalam bahasa Indonesia yang rapi dan mudah dimengerti, dengan struktur:",
      "1. Tema renungan utama (maksimal 3 kalimat).",
      "2. Poin-poin penting pengumuman ibadah, pelayanan, dan kegiatan jemaat.",
      "3. Informasi penting lain (jadwal ibadah khusus, persekutuan, ketentuan pendaftaran, kontak, dll).",
      "",
      "Jawabanmu maksimal sekitar 200 kata, cocok dibacakan oleh asisten suara, hindari detail yang terlalu teknis.",
    ].join("\n");

    const result = await client.models.generate({
      model,
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

    const summary =
      result?.response?.text?.() ??
      result?.response?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("") ??
      null;

    res.status(200).json({
      title: latest.name || null,
      modifiedTime: latest.modifiedTime || null,
      summary,
      source: {
        id: latest.id,
        viewUrl: latest.viewUrl || null,
        downloadUrl: latest.downloadUrl || null,
      },
    });
  } catch (err) {
    console.error("Error building warta context:", err);
    res.status(500).json({ error: "Failed to build warta context" });
  }
}
