// api/gemini-token.js
import { GoogleGenAI } from "@google/genai";

/**
 * Vercel serverless function:
 * - Baca GEMINI_API_KEY dari environment (Vercel)
 * - Bikin ephemeral token (short-lived)
 * - Kirim ke client sebagai JSON
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // client akan otomatis ambil GEMINI_API_KEY dari env Vercel
    const client = new GoogleGenAI({});

    // expired 30 menit ke depan (max waktu sesi)
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const token = await client.authTokens.create({
      config: {
        uses: 1, // token hanya boleh dipakai start 1 sesi
        expireTime,
        liveConnectConstraints: {
          model: "gemini-2.5-flash-native-audio-preview-09-2025",
          config: {
            sessionResumption: {},
            temperature: 0.7,
            responseModalities: ["AUDIO"],
          },
        },
        httpOptions: {
          apiVersion: "v1alpha",
        },
      },
    });

    // token.name ini yang nanti dipakai sebagai apiKey di browser
    res.status(200).json({ token: token.name });
  } catch (err) {
    console.error("Error creating ephemeral token:", err);
    res.status(500).json({ error: "Failed to create token" });
  }
}
