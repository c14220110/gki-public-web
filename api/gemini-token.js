// api/gemini-token.js
import { GoogleGenAI } from "@google/genai";

/**
 * Vercel serverless function:
 * - Baca GEMINI_API_KEY dari environment (Vercel)
 * - Bikin ephemeral token (short-lived) khusus Live API audio
 * - Kirim ke client sebagai JSON
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    if (!process.env.GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY is not set in environment");
      res.status(500).json({ error: "GEMINI_API_KEY not configured" });
      return;
    }

    // Client Node: pakai API key dari env
    const client = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    // Token berlaku 30 menit
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const token = await client.authTokens.create({
      config: {
        uses: 1,
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
