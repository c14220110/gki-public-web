// js/ai-voice.js
import { GoogleGenAI, Modality } from "@google/genai";

// Sekarang GEMINI_API_KEY akan diisi dengan ephemeral token
// yang diambil dari backend (/api/gemini-token)
let GEMINI_API_KEY = null; // ini nanti diisi pakai ephemeral token dari backend

// === STATE & REF AUDIO ===
let aiClient = null;
let sessionPromise = null;

let outputCtx = null; // 24 kHz – untuk suara AI
let inputCtx = null; // 16 kHz – untuk mic input
let processor = null;
let sourceNode = null;
let micStream = null;
let nextStartTime = 0;
let activeSources = []; // Track active audio sources

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

// === HELPER: PCM utils (versi untuk Live API) ===

// ArrayBuffer -> base64 (untuk kirim audio ke Gemini)
function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Bikin "blob" versi @google/genai (BUKAN DOM Blob)
function createPcmBlob(float32Array) {
  const l = float32Array.length;
  const int16 = new Int16Array(l);

  for (let i = 0; i < l; i++) {
    let s = float32Array[i];
    s = Math.max(-1, Math.min(1, s));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  return {
    data: arrayBufferToBase64(int16.buffer),
    mimeType: "audio/pcm;rate=16000",
  };
}

// base64 -> Uint8Array (untuk decode audio dari Gemini)
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

// === HELPER: Bangun SYSTEM_INSTRUCTION dari data website (DATABASE) ===
function buildDynamicInstruction() {
  const data = window.__gkiContent || null;
  const wartaSummary = window.__gkiWartaContext || null;

  const parts = [];

  // Identitas & gaya bicara
  parts.push(
    [
      "Kamu adalah asisten AI untuk Gereja Kristen Indonesia (GKI) Kutisari Indah di Surabaya.",
      "Jawab SELALU dalam bahasa Indonesia yang sopan, ramah, NAMUN tidak terlalu CEPAT tapi ENERGIK.",
      "Jangan berbicara terlalu lambat. Gunakan intonasi yang hidup dan tidak membosankan.",
      "Jawabanmu harus SINGKAT, PADAT, dan LUGAS. Jangan bertele-tele. Pakai Shalom di awal percakapan karena ini untuk gereja! target pasarnya biasanya orang tua!",
    ].join(" ")
  );

  // Batasan umum
  parts.push(
    [
      "Kamu TIDAK bisa membuka link atau file sendiri.",
      "Kamu hanya boleh memakai informasi yang tertulis di instruksi sistem ini (tentang gereja, jadwal, dan ringkasan warta).",
      "Jika informasi yang ditanya tidak ada di konteks di bawah, jujur katakan kamu tidak punya datanya,",
      "dan sarankan jemaat untuk menghubungi kantor gereja atau melihat Warta Jemaat lengkap.",
    ].join(" ")
  );

  // Hero section
  if (data && data.hero) {
    parts.push(
      `Informasi umum halaman utama: judul hero "${data.hero.title}" dengan subjudul "${data.hero.subtitle}".`
    );
  }

  // Tentang Gereja
  if (data && data.about) {
    parts.push(
      "Tentang gereja:",
      (data.about.paragraph1 || "") + " " + (data.about.paragraph2 || "")
    );
  }

  // Jadwal ibadah & kegiatan
  if (data && data.schedules && Array.isArray(data.schedules.items)) {
    const jadwalLines = data.schedules.items
      .map((item) =>
        `- ${item.name} pada ${item.time || "-"}: ${
          item.description || ""
        }`.trim()
      )
      .join("\n");
    parts.push("Jadwal ibadah & kegiatan dari website:", jadwalLines);
  }

  // Profil gembala
  if (data && data.pastor) {
    parts.push(
      "Profil Gembala Sidang:",
      `Nama: ${data.pastor.name || "-"}. Nomor yang tercantum di website: ${
        data.pastor.phone || "-"
      }.`,
      data.pastor.description || ""
    );
  }

  // Kontak
  if (data && data.contact) {
    parts.push(
      "Informasi kontak gereja dari website:",
      `Alamat: ${data.contact.addressText || ""}`,
      `WhatsApp kantor: ${
        data.contact.officeWhatsappLabel || "WhatsApp Kantor"
      } (${data.contact.officeWhatsappUrl || ""}).`
    );
  }

  // WARTA: bagian paling penting buat kasusmu
  if (wartaSummary) {
    parts.push(
      [
        "Kamu JUGA memiliki ringkasan Warta Jemaat terbaru berikut ini.",
        "Jika jemaat bertanya tentang Warta Jemaat, pengumuman minggu ini, jadwal khusus (Natal, Tahun Baru, Sakramen, Aksi Sosial), atau kegiatan yang tertulis di Warta,",
        "gunakan ringkasan warta di bawah ini untuk menjawab.",
        "Saat menjawab, sebutkan bahwa informasi ini berasal dari Warta Jemaat terbaru.",
      ].join(" ")
    );
    parts.push("Ringkasan Warta Jemaat terbaru:", String(wartaSummary));
  } else {
    parts.push(
      [
        "Saat ini kamu TIDAK memiliki ringkasan Warta Jemaat di konteks.",
        "Jika jemaat bertanya detail isi Warta Jemaat, jawab dengan sopan bahwa kamu tidak punya akses ringkasannya,",
        "dan sarankan jemaat membuka Warta Jemaat yang bisa diunduh di halaman Warta gereja.",
      ].join(" ")
    );
  }

  return parts.filter(Boolean).join("\n\n");
}

// Kirim ulang konteks sebagai input pertama ke sesi Live
function sendInitialContext(session) {
  const instruction = buildDynamicInstruction();
  if (!instruction) return;

  try {
    console.log("[AI-VOICE] Sending initial context to Gemini");
    session.sendRealtimeInput({
      text:
        "Gunakan konteks berikut tentang Gereja Kristen Indonesia (GKI) Kutisari Indah di Surabaya. " +
        "Jangan membaca ulang teks ini secara lengkap, cukup gunakan sebagai panduan saat menjawab pertanyaan jemaat:\n\n" +
        instruction,
    });
  } catch (err) {
    console.error("Failed to send initial context:", err);
  }
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
function stopAllAudio() {
  activeSources.forEach((source) => {
    try {
      source.stop();
      source.disconnect();
    } catch (e) {
      // ignore if already stopped
    }
  });
  activeSources = [];
}

function cleanupAudio() {
  try {
    stopAllAudio(); // Stop any playing audio

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
  if (isConnecting || isConnected) {
    return;
  }

  lastError = null;
  isConnecting = true;
  isConnected = false;
  isSpeaking = false;
  updateUi();

  try {
    // 1. Ambil ephemeral token dari backend (BUKAN API key langsung)
    const res = await fetch("/api/gemini-token");
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Gagal mengambil token dari server (status ${res.status}): ${text}`
      );
    }

    const data = await res.json();
    const ephemeralToken = data.token;
    if (!ephemeralToken) {
      throw new Error("Token tidak valid");
    }

    GEMINI_API_KEY = ephemeralToken;

    // 2. Inisialisasi client pakai ephemeral token
    aiClient = new GoogleGenAI({
      apiKey: ephemeralToken,
      httpOptions: { apiVersion: "v1alpha" },
    });

    // 3. Siapkan AudioContext
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    outputCtx = new AudioCtx({ sampleRate: 24000 });
    inputCtx = new AudioCtx({ sampleRate: 16000 });

    // 4. Minta akses mic
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // 5. Build system instruction dari konten website (Supabase)
    const systemInstruction = buildDynamicInstruction();

    // 6. Buka sesi realtime
    console.log("[AI-VOICE] Using voice:", "Puck");

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

          // Kirim konteks awal segera setelah koneksi terbuka
          if (sessionPromise) {
            sessionPromise
              .then((session) => {
                sendInitialContext(session);
              })
              .catch((err) =>
                console.error("Failed to send initial instruction", err)
              );
          }
        },
        onmessage: async (msg) => {
          if (msg.error) {
            console.error("Gemini server error:", msg.error);
            setError("Terjadi error dari server AI.");
            return;
          }

          const serverContent = msg && msg.serverContent;
          const inlineData =
            serverContent &&
            serverContent.modelTurn &&
            serverContent.modelTurn.parts &&
            serverContent.modelTurn.parts[0] &&
            serverContent.modelTurn.parts[0].inlineData;

          if (inlineData && inlineData.data) {
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

              // Track active source
              activeSources.push(source);

              source.onended = () => {
                // Remove from active sources
                activeSources = activeSources.filter((s) => s !== source);

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
            console.log("Interrupted by user! Stopping audio...");
            stopAllAudio(); // Stop all currently playing audio
            isSpeaking = false;
            nextStartTime = 0;
            updateUi();
          }
        },
        onclose: (event) => {
          console.log(
            "Gemini session closed:",
            event?.code,
            event?.reason ?? "(no reason)"
          );
          cleanupAudio();
        },
        onerror: (err) => {
          console.error("Session error", err);
          setError("Error sesi: " + (err?.message || String(err)));
          cleanupAudio();
        },
      },
    });
  } catch (err) {
    console.error(err);
    isConnecting = false;
    isConnected = false;
    setError("Gagal menghubungkan ke AI: " + (err?.message || String(err)));
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
