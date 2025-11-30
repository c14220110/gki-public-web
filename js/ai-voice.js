// js/ai-voice.js
import { GoogleGenAI, Modality } from "@google/genai";

// ⚠️ API key: untuk prototipe, masukkan di sini atau lewat window.GKI_GEMINI_API_KEY
// Jangan commit kalau repositori publik.
const GEMINI_API_KEY =
  window.GKI_GEMINI_API_KEY || "ISI_API_KEY_GEMINI_DI_SINI";

// === STATE & REF AUDIO ===
let aiClient = null;
let sessionPromise = null;

let outputCtx = null; // 24 kHz – untuk suara AI
let inputCtx = null; // 16 kHz – untuk mic input
let processor = null;
let sourceNode = null;
let micStream = null;
let nextStartTime = 0;

// STATE UI
let isConnecting = false;
let isConnected = false;
let isSpeaking = false;
let lastError = null;

// DOM refs (di-set setelah DOMContentLoaded)
let fabWrapper = null;
let triggerBtn = null;
let modal = null;
let closeBtn = null;
let stopBtn = null;
let statusDot = null;
let statusText = null;
let errorBox = null;
let visualizer = null;

// === HELPER: PCM utils (port dari audioUtils.ts) ===
function createPcmBlob(float32Array) {
  // Konversi Float32 [-1,1] ke Int16 LE
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);

  for (let i = 0; i < float32Array.length; i++) {
    let s = float32Array[i];
    s = Math.max(-1, Math.min(1, s));
    const val = s < 0 ? s * 0x8000 : s * 0x7fff;
    view.setInt16(i * 2, val, true);
  }

  return new Blob([buffer], { type: "audio/pcm" });
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Decode raw Int16 PCM ke AudioBuffer
function decodeAudioData(bytes, audioContext, sampleRate, channels = 1) {
  return new Promise((resolve) => {
    const numSamples = bytes.length / 2;
    const audioBuffer = audioContext.createBuffer(
      channels,
      numSamples,
      sampleRate
    );
    const channelData = audioBuffer.getChannelData(0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    for (let i = 0; i < numSamples; i++) {
      const int16 = view.getInt16(i * 2, true);
      channelData[i] = int16 / 0x8000;
    }

    resolve(audioBuffer);
  });
}

// === HELPER: Bangun SYSTEM_INSTRUCTION dari data website (Supabase) ===
function buildDynamicInstruction() {
  const data = window.__gkiContent || null;

  const parts = [];

  parts.push(
    [
      "Kamu adalah asisten AI untuk Gereja Kristen Indonesia (GKI) Kutisari Indah di Surabaya.",
      "Jawab dengan bahasa Indonesia yang sopan, ramah, dan cukup singkat tapi jelas.",
      "Jika informasi yang ditanya tidak ada di konteks di bawah, jujur katakan tidak tahu",
      "dan sarankan jemaat untuk menghubungi kantor gereja atau melihat warta terbaru.",
    ].join(" ")
  );

  if (data && data.hero) {
    parts.push(
      `Hero title di halaman utama: "${data.hero.title}" dengan subjudul "${data.hero.subtitle}".`
    );
  }

  if (data && data.about) {
    parts.push(
      "Tentang gereja:",
      (data.about.paragraph1 || "") + " " + (data.about.paragraph2 || "")
    );
  }

  if (data && data.schedules && Array.isArray(data.schedules.items)) {
    const jadwalLines = data.schedules.items
      .map((item) =>
        `- ${item.name} pada ${item.time || "-"}: ${
          item.description || ""
        }`.trim()
      )
      .join("\n");
    parts.push("Jadwal ibadah & kegiatan terbaru:", jadwalLines);
  }

  if (data && data.pastor) {
    parts.push(
      "Profil Gembala Sidang:",
      `Nama: ${data.pastor.name || "-"}, nomor yang tertera di website: ${
        data.pastor.phone || "-"
      }.`,
      data.pastor.description || ""
    );
  }

  if (data && data.contact) {
    parts.push(
      "Informasi kontak di website:",
      `Alamat: ${data.contact.addressText || ""}`,
      `WA kantor: ${data.contact.officeWhatsappLabel || "WhatsApp Kantor"} (${
        data.contact.officeWhatsappUrl || ""
      })`
    );
  }

  // Jika di masa depan kamu punya ringkasan warta → taruh di window.__gkiWartaContext
  if (window.__gkiWartaContext) {
    parts.push(
      "Ringkasan warta jemaat terbaru (boleh jadi referensi jika jemaat bertanya isi warta):",
      String(window.__gkiWartaContext)
    );
  }

  return parts.filter(Boolean).join("\n\n");
}

// === UI helper ===
function updateUi() {
  if (!statusDot || !statusText || !visualizer || !errorBox) return;

  // Status dot
  statusDot.className = "w-3 h-3 rounded-full";
  if (isConnecting) {
    statusDot.classList.add("bg-yellow-500");
  } else if (isConnected) {
    statusDot.classList.add("bg-green-500", "animate-pulse");
  } else {
    statusDot.classList.add("bg-gray-400");
  }

  // Status text
  if (isConnecting) {
    statusText.textContent = "Menghubungkan...";
  } else if (isConnected) {
    statusText.textContent = isSpeaking
      ? "AI sedang berbicara..."
      : "Mendengarkan...";
  } else {
    statusText.textContent = "Terputus";
  }

  // Error box
  if (lastError) {
    errorBox.textContent = lastError;
    errorBox.classList.remove("hidden");
  } else {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
  }

  // Wave bars
  if (isConnected || isSpeaking) {
    visualizer.classList.add("ai-speaking");
  } else {
    visualizer.classList.remove("ai-speaking");
  }
}

function setError(msg) {
  lastError = msg;
  updateUi();
}

// === AUDIO CLEANUP ===
function cleanupAudio() {
  try {
    if (processor) {
      processor.disconnect();
      processor.onaudioprocess = null;
      processor = null;
    }
    if (sourceNode) {
      sourceNode.disconnect();
      sourceNode = null;
    }
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
    }
    if (inputCtx) {
      inputCtx.close();
      inputCtx = null;
    }
    if (outputCtx) {
      outputCtx.close();
      outputCtx = null;
    }
    sessionPromise = null;
    nextStartTime = 0;
  } catch (e) {
    console.warn("cleanupAudio error", e);
  }

  isConnecting = false;
  isConnected = false;
  isSpeaking = false;
  updateUi();
}

// === START SESSION ===
async function startSession() {
  if (!GEMINI_API_KEY || GEMINI_API_KEY === "ISI_API_KEY_GEMINI_DI_SINI") {
    setError("API key Gemini belum di-set.");
    return;
  }

  if (isConnecting || isConnected) {
    return;
  }

  lastError = null;
  isConnecting = true;
  isConnected = false;
  isSpeaking = false;
  updateUi();

  try {
    aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Audio contexts
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    outputCtx = new AudioCtx({ sampleRate: 24000 });
    inputCtx = new AudioCtx({ sampleRate: 16000 });

    // Mic
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const systemInstruction = buildDynamicInstruction();

    sessionPromise = aiClient.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-09-2025",
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction,
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Puck" },
          },
        },
      },
      callbacks: {
        onopen: () => {
          isConnected = true;
          isConnecting = false;
          updateUi();
          setupInputProcessing();
          console.log("Gemini Live connected");
        },
        onmessage: async (msg) => {
          const serverContent = msg && msg.serverContent;
          const inlineData =
            serverContent &&
            serverContent.modelTurn &&
            serverContent.modelTurn.parts &&
            serverContent.modelTurn.parts[0] &&
            serverContent.modelTurn.parts[0].inlineData;

          if (inlineData && inlineData.data) {
            // Audio dari AI
            if (!outputCtx) return;
            const base64Audio = inlineData.data;
            const audioBytes = base64ToUint8Array(base64Audio);
            isSpeaking = true;
            updateUi();

            try {
              const audioBuffer = await decodeAudioData(
                audioBytes,
                outputCtx,
                24000,
                1
              );
              const source = outputCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputCtx.destination);

              const now = outputCtx.currentTime;
              const startTime = Math.max(nextStartTime, now + 0.05);
              source.start(startTime);
              nextStartTime = startTime + audioBuffer.duration;

              source.onended = () => {
                if (outputCtx && outputCtx.currentTime >= nextStartTime - 0.1) {
                  isSpeaking = false;
                  updateUi();
                }
              };
            } catch (e) {
              console.error("Error decoding audio", e);
            }
          }

          if (serverContent && serverContent.interrupted) {
            isSpeaking = false;
            nextStartTime = 0;
            updateUi();
          }
        },
        onclose: () => {
          console.log("Gemini session closed");
          cleanupAudio();
        },
        onerror: (err) => {
          console.error("Session error", err);
          setError("Terputus. Silakan coba lagi.");
          cleanupAudio();
        },
      },
    });
  } catch (err) {
    console.error(err);
    isConnecting = false;
    isConnected = false;
    setError("Gagal menghubungkan ke AI.");
  }
}

// Setup stream processing (mic → PCM → sendRealtimeInput)
function setupInputProcessing() {
  if (!inputCtx || !micStream) return;

  sourceNode = inputCtx.createMediaStreamSource(micStream);
  processor = inputCtx.createScriptProcessor(4096, 1, 1);

  processor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    const pcmBlob = createPcmBlob(inputData);
    if (!sessionPromise) return;
    sessionPromise
      .then((session) => {
        session.sendRealtimeInput({ media: pcmBlob });
      })
      .catch((err) => console.error("sendRealtimeInput error", err));
  };

  sourceNode.connect(processor);
  processor.connect(inputCtx.destination);
}

// === OPEN / CLOSE MODAL ===
function openVoiceAgent() {
  if (!modal || !fabWrapper) return;
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  fabWrapper.classList.add("hidden");

  // Reset UI state
  lastError = null;
  isConnecting = false;
  isConnected = false;
  isSpeaking = false;
  updateUi();

  startSession();
}

function closeVoiceAgent() {
  if (!modal || !fabWrapper) return;
  modal.classList.add("hidden");
  modal.classList.remove("flex");
  fabWrapper.classList.remove("hidden");

  cleanupAudio();
}

// === INIT DOM LISTENERS ===
document.addEventListener("DOMContentLoaded", () => {
  fabWrapper = document.getElementById("ai-voice-fab-wrapper");
  triggerBtn = document.getElementById("ai-voice-trigger");
  modal = document.getElementById("ai-voice-modal");
  closeBtn = document.getElementById("ai-voice-close");
  stopBtn = document.getElementById("ai-voice-stop");
  statusDot = document.getElementById("ai-status-dot");
  statusText = document.getElementById("ai-status-text");
  errorBox = document.getElementById("ai-error-box");
  visualizer = document.getElementById("ai-visualizer");

  if (triggerBtn) {
    triggerBtn.addEventListener("click", () => openVoiceAgent());
  }
  if (closeBtn) {
    closeBtn.addEventListener("click", () => closeVoiceAgent());
  }
  if (stopBtn) {
    stopBtn.addEventListener("click", () => closeVoiceAgent());
  }

  updateUi();
});

// Bersih-bersih kalau user tutup tab
window.addEventListener("beforeunload", () => {
  cleanupAudio();
});
