// === KONFIG FRONT-END ===
const APPS_URL =
  "https://script.google.com/macros/s/AKfycbwy43M6LfmKXBXOQuaLq1MvpjG1-0w2mAirMh3ipoYQeUEvXGp08YseKGmgKfnd80SQ6Q/exec";
const CHANNEL_ID = "UCLDrtr-jxpA0h9WzmgUiKdQ";
const YT_API_KEY = "AIzaSyDXjJ8hNVO9x4OD3VfPuofEpVKl9GXfzKM"; // opsional
const MANAGEMENT_API = "https://gki-management.vercel.app/api/website-content";

// === GLOBALS ===
let observer;
window.__ytJsonpOk = false;
window.__wartaJsonpOk = false;

// === UTIL: inject JSONP script ===
function injectScript(src, onerror) {
  const s = document.createElement("script");
  s.src = src;
  s.async = true;
  if (onerror) s.onerror = onerror;
  document.body.appendChild(s);
}

// === YOUTUBE SPOTLIGHT (JSONP -> fallback ke API) ===
window.renderYT = function renderYT(data) {
  const grid = document.getElementById("youtube-spotlight-container");
  if (!grid || document.querySelector(".youtube-spotlight-card")) return;

  window.__ytJsonpOk = true;

  if (!data || data.error || !data.video) return;
  const v = data.video || {};
  const status = data.status || "latest";
  const isLive = status === "live";
  const isUpcoming = status === "upcoming";

  const badge = isLive ? "LIVE" : isUpcoming ? "SEGERA" : "TERBARU";
  const badgeClass = isLive
    ? "bg-red-600"
    : isUpcoming
    ? "bg-amber-600"
    : "bg-slate-600";

  const videoId = v.id;
  const finalThumb = videoId
    ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
    : v.thumbnail || "";
  const whenText = isLive
    ? "Sedang live sekarang."
    : isUpcoming && v.liveDetails && v.liveDetails.scheduledStartTime
    ? "Tayang: " +
      new Date(v.liveDetails.scheduledStartTime).toLocaleString("id-ID", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Diunggah: " +
      (v.publishedAt
        ? new Date(v.publishedAt).toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : "-");

  const card = document.createElement("div");
  card.className =
    "glass-card overflow-hidden p-0 youtube-spotlight-card text-left md:max-w-2xl w-full";
  card.setAttribute("data-animate", "");

  const imgWrapper = document.createElement("div");
  imgWrapper.className = "relative";
  const img = document.createElement("img");
  img.src = finalThumb;
  img.alt = v.title || "";
  img.className = "w-full h-56 object-cover";
  img.loading = "lazy";
  img.decoding = "async";
  imgWrapper.appendChild(img);

  const badgeSpan = document.createElement("span");
  badgeSpan.className = `absolute top-3 left-3 text-xs font-bold text-white px-2 py-1 rounded ${badgeClass}`;
  badgeSpan.textContent = badge;
  imgWrapper.appendChild(badgeSpan);

  const contentDiv = document.createElement("div");
  contentDiv.className = "p-6";
  const spanType = document.createElement("span");
  spanType.className = "text-sm font-semibold";
  spanType.style.color = "var(--color-text-accent)";
  spanType.textContent = "SIARAN DARI YOUTUBE";
  const h3 = document.createElement("h3");
  h3.className = "text-xl font-bold mt-2";
  h3.style.color = "var(--color-text-main)";
  h3.textContent = v.title || "";
  const pWhen = document.createElement("p");
  pWhen.className = "mt-2";
  pWhen.style.color = "var(--color-text-secondary)";
  pWhen.textContent = whenText;

  const actionsDiv = document.createElement("div");
  actionsDiv.className = "mt-4 flex items-center gap-3";
  const aWatch = document.createElement("a");
  aWatch.href =
    v.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "#");
  aWatch.target = "_blank";
  aWatch.rel = "noopener";
  aWatch.className = "inline-block btn btn-primary";
  aWatch.textContent = "Tonton di YouTube";
  const aChannel = document.createElement("a");
  aChannel.href = "https://www.youtube.com/@gkikutisariindah2685";
  aChannel.target = "_blank";
  aChannel.rel = "noopener";
  aChannel.className = "inline-block font-semibold";
  aChannel.style.color = "var(--color-text-accent)";
  aChannel.textContent = "Kunjungi Channel →";

  actionsDiv.append(aWatch, aChannel);
  contentDiv.append(spanType, h3, pWhen, actionsDiv);
  card.append(imgWrapper, contentDiv);
  grid.appendChild(card);

  if (observer) observer.observe(card);
};

async function fetchYouTubeDirect(channelId, apiKey) {
  if (document.querySelector(".youtube-spotlight-card")) return;

  let status = "latest";
  let vidId = null;
  let snippet = {};
  let liveStreamingDetails = null;

  try {
    const liveURL = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&order=date&maxResults=1&key=${apiKey}`;
    const liveRes = await fetch(liveURL);
    if (liveRes.ok) {
      const liveJs = await liveRes.json();
      if (Array.isArray(liveJs.items) && liveJs.items.length) {
        status = "live";
        vidId = liveJs.items[0].id && liveJs.items[0].id.videoId;
        if (vidId) {
          const detailURL = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${vidId}&key=${apiKey}`;
          const detailRes = await fetch(detailURL);
          const detailJs = await detailRes.json();
          const item = detailJs.items && detailJs.items[0];
          if (item) {
            snippet = item.snippet || {};
            liveStreamingDetails = item.liveStreamingDetails || null;
          }
        }
      }
    }
  } catch {}

  if (!vidId) {
    try {
      const latestURL = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&type=video&order=date&maxResults=1&key=${apiKey}`;
      const latestRes = await fetch(latestURL);
      if (!latestRes.ok) return;
      const latestJs = await latestRes.json();
      if (Array.isArray(latestJs.items) && latestJs.items.length) {
        status = "latest";
        vidId = latestJs.items[0].id && latestJs.items[0].id.videoId;
        snippet = latestJs.items[0].snippet || {};
      } else {
        return;
      }
    } catch {
      return;
    }
  }

  if (!vidId) return;

  window.renderYT({
    status,
    video: {
      id: vidId,
      title: snippet.title,
      url: `https://www.youtube.com/watch?v=${vidId}`,
      publishedAt: snippet.publishedAt,
      liveDetails: liveStreamingDetails,
      thumbnail:
        snippet.thumbnails?.high?.url ||
        snippet.thumbnails?.medium?.url ||
        snippet.thumbnails?.default?.url ||
        "",
    },
  });
}

// === WARTA (JSONP anti-CORS) ===
window.renderWarta = function renderWarta(data) {
  const wartaGrid = document.getElementById("warta-grid");
  if (!wartaGrid) return;

  window.__wartaJsonpOk = true;

  wartaGrid.innerHTML = "";
  if (!data || !Array.isArray(data.files) || !data.files.length) {
    wartaGrid.innerHTML = `<div class="text-center col-span-3"><p style="color: var(--color-text-secondary)">Belum ada Warta terbaru.</p></div>`;
    return;
  }

  function formatTanggalID(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("id-ID", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  }

  data.files.forEach((item, idx) => {
    const delay = idx === 1 ? "200ms" : idx === 2 ? "400ms" : "0ms";
    const card = document.createElement("div");
    card.className = "glass-card overflow-hidden p-0";
    card.setAttribute("data-animate", "");
    card.style.transitionDelay = delay;

    const thumb = `${item.thumbnailUrl}&v=${Date.now()}`;

    card.innerHTML = `
      <img src="${thumb}" alt="${item.name || "Warta"}"
           class="w-full h-56 object-cover" loading="lazy" decoding="async" />
      <div class="p-6">
        <span class="text-sm font-semibold" style="color: var(--color-text-accent)">PENGUMUMAN</span>
        <h3 class="text-xl font-bold mt-2" style="color: var(--color-text-main}">${
          item.name || "Warta Jemaat"
        }</h3>
        <p class="mt-2" style="color: var(--color-text-secondary)">
          Terakhir diperbarui: ${
            item.modifiedTime ? formatTanggalID(item.modifiedTime) : "-"
          }
        </p>
        <div class="mt-4 flex items-center gap-3">
          <a href="${item.downloadUrl}" target="_blank" rel="noopener"
             class="inline-block font-semibold" style="color: var(--color-text-accent)">Unduh Warta →</a>
          <a href="${item.viewUrl}" target="_blank" rel="noopener"
             class="inline-block text-sm underline opacity-80 hover:opacity-100" style="color: var(--color-text-secondary)">Lihat Pratinjau</a>
        </div>
      </div>
    `;

    wartaGrid.appendChild(card);
  });

  if (observer) {
    wartaGrid
      .querySelectorAll("[data-animate]:not(.is-visible)")
      .forEach((el) => observer.observe(el));
  }
};

// === DOM Ready ===
document.addEventListener("DOMContentLoaded", () => {
  // --- Preloader + fade-in --- (mulai di DOMContentLoaded agar cepat tampil)
  const preloader = document.getElementById("preloader");
  const letters = document.querySelectorAll(".loader-text-line span");
  const mainContent = document.querySelector("main");
  const header = document.getElementById("header");

  const MIN_PRELOADER_MS = 800;
  const t0 = performance.now();

  if (window.gsap) {
    const tl = gsap.timeline({
      onComplete: () => {
        const elapsed = performance.now() - t0;
        const wait = Math.max(0, MIN_PRELOADER_MS - elapsed);
        setTimeout(() => {
          gsap.to(preloader, {
            duration: 0.4,
            opacity: 0,
            onComplete: () => (preloader.style.display = "none"),
          });
          gsap.to([header, mainContent], {
            duration: 0.6,
            opacity: 1,
            delay: 0.1,
          });
        }, wait);
      },
    });

    tl.to(letters, { duration: 0.6, y: 0, stagger: 0.05, ease: "power2.out" })
      .to(letters, {
        "--clipPath": "inset(0% 0 0 0)",
        duration: 0.8,
        delay: 0.3,
        ease: "power1.inOut",
      })
      .to(letters, {
        duration: 0.6,
        y: -110,
        stagger: 0.05,
        delay: 0.8,
        ease: "power2.in",
      });
  } else {
    // Fallback kalau GSAP gagal load
    preloader.style.display = "none";
    header.style.opacity = 1;
    mainContent.style.opacity = 1;
  }

  // Mobile menu
  const mobileMenuButton = document.getElementById("mobile-menu-button");
  const mobileMenu = document.getElementById("mobile-menu");
  if (mobileMenuButton && mobileMenu) {
    mobileMenuButton.addEventListener("click", () =>
      mobileMenu.classList.toggle("hidden")
    );
    document.querySelectorAll("#mobile-menu a").forEach((link) => {
      link.addEventListener("click", () => mobileMenu.classList.add("hidden"));
    });
  }

  // Footer year
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();
  // === Load Dynamic Website Content ===
  // === Load Dynamic Website Content ===
  async function loadDynamicContent() {
    try {
      console.log("🔄 Loading dynamic content from:", MANAGEMENT_API);

      const response = await fetch(MANAGEMENT_API);
      console.log("📡 Response status:", response.status);

      if (!response.ok) throw new Error("Failed to load content");

      const data = await response.json();
      console.log("✅ Data loaded:", data);

      // Update Hero Section
      if (data.hero) {
        const heroTitle = document.querySelector("#beranda .hero-content h1");
        const heroSubtitle = document.querySelector("#beranda .hero-content p");
        const heroVideo = document.getElementById("heroVideo");

        console.log("🎯 Found hero elements:", {
          titleFound: !!heroTitle,
          subtitleFound: !!heroSubtitle,
          videoFound: !!heroVideo,
        });

        if (heroTitle) {
          heroTitle.textContent = data.hero.title;
          console.log("✏️ Updated hero title to:", data.hero.title);
        }
        if (heroSubtitle) {
          heroSubtitle.textContent = data.hero.subtitle;
          console.log("✏️ Updated hero subtitle to:", data.hero.subtitle);
        }

        // 🔥 ganti source video kalau API kirim videoUrl
        if (heroVideo && data.hero.videoUrl) {
          const sourceEl = heroVideo.querySelector("source");
          if (sourceEl) {
            sourceEl.src = data.hero.videoUrl;
            heroVideo.load();
            console.log("🎬 Updated hero video src to:", data.hero.videoUrl);
          }
        }
      }

      // Update "Tentang Kami" Section
      if (data.about) {
        const about = data.about;

        const aboutTagline = document.getElementById("about-tagline");
        const aboutTitle = document.getElementById("about-title");
        const aboutP1 = document.getElementById("about-paragraph-1");
        const aboutP2 = document.getElementById("about-paragraph-2");
        const aboutBtn = document.getElementById("about-button");
        const aboutImg = document.getElementById("about-image");

        // dukung 2 versi struktur: lama (badge/heading/ctaText/ctaUrl)
        // dan baru (taglineLabel/title/buttonLabel/buttonHref)
        const badge = about.taglineLabel || about.badge;
        const title = about.title || about.heading;
        const paragraph1 = about.paragraph1;
        const paragraph2 = about.paragraph2;
        const buttonLabel = about.buttonLabel || about.ctaText;
        const buttonHref = about.buttonHref || about.ctaUrl;
        const imageUrl = about.imageUrl;

        if (aboutTagline && badge) {
          aboutTagline.textContent = badge;
        }
        if (aboutTitle && title) {
          aboutTitle.textContent = title;
        }
        if (aboutP1 && paragraph1) {
          aboutP1.textContent = paragraph1;
        }
        if (aboutP2 && paragraph2) {
          aboutP2.textContent = paragraph2;
        }
        if (aboutBtn) {
          if (buttonLabel) {
            aboutBtn.textContent = buttonLabel;
          }
          if (buttonHref) {
            aboutBtn.href = buttonHref;
          }
        }
        if (aboutImg && imageUrl) {
          aboutImg.src = imageUrl;
        }
      }

      // Update "Profil Gembala Sidang" Section
      if (data.pastor) {
        const p = data.pastor;

        const pastorTagline = document.getElementById("pastor-tagline");
        const pastorName = document.getElementById("pastor-name");
        const pastorPhone = document.getElementById("pastor-phone");
        const pastorDesc = document.getElementById("pastor-description");
        const pastorBtn = document.getElementById("pastor-button");
        const pastorImg = document.getElementById("pastor-image");

        const badge = p.taglineLabel || p.badge;
        const name = p.name;
        const description = p.description;
        const buttonLabel = p.buttonLabel || p.buttonText;
        const buttonHref = p.buttonHref || p.buttonUrl;
        const imageUrl = p.imageUrl;
        const phoneDisplay = p.phoneDisplay || p.phone;
        const phoneHref =
          p.phoneHref ||
          (phoneDisplay ? `tel:${phoneDisplay.replace(/[^0-9+]/g, "")}` : null);

        if (pastorTagline && badge) {
          pastorTagline.textContent = badge;
        }
        if (pastorName && name) {
          pastorName.textContent = name;
        }
        if (pastorPhone) {
          if (phoneDisplay) {
            pastorPhone.textContent = phoneDisplay;
          }
          if (phoneHref) {
            pastorPhone.href = phoneHref;
          }
        }
        if (pastorDesc && description) {
          pastorDesc.textContent = description;
        }
        if (pastorBtn) {
          if (buttonLabel) {
            pastorBtn.textContent = buttonLabel;
          }
          if (buttonHref) {
            pastorBtn.href = buttonHref;
          }
        }
        if (pastorImg && imageUrl) {
          pastorImg.src = imageUrl;
        }
      }

      if (data.schedules) {
        const scheduleTitle = document.querySelector("#jadwal .section-title");
        const scheduleSubtitle = document.querySelector(
          "#jadwal .section-subtitle"
        );

        if (scheduleTitle) scheduleTitle.textContent = data.schedules.title;
        if (scheduleSubtitle)
          scheduleSubtitle.textContent = data.schedules.subtitle;

        // Render schedule cards
        // Render schedule cards
        const scheduleGrid = document.getElementById("schedule-grid");
        console.log("📅 Schedule grid found:", !!scheduleGrid);

        if (
          scheduleGrid &&
          data.schedules.items &&
          data.schedules.items.length > 0
        ) {
          // Clear existing hardcoded cards
          const existingCards = scheduleGrid.querySelectorAll(".glass-card");
          console.log("🗑️ Removing", existingCards.length, "existing cards");
          existingCards.forEach((card) => card.remove());

          // Render dynamic cards
          data.schedules.items.forEach((item, index) => {
            const delay =
              index === 1
                ? "200ms"
                : index === 2
                ? "400ms"
                : index === 3
                ? "600ms"
                : index === 4
                ? "800ms"
                : "0ms";

            const card = document.createElement("div");
            card.setAttribute("data-animate", "");
            card.style.transitionDelay = delay;
            card.className = "glass-card p-8 w-full max-w-md";
            card.innerHTML = `
              <h3 class="text-2xl font-bold mb-2" style="color: var(--color-text-main)">${item.name}</h3>
              <p class="font-semibold text-lg" style="color: var(--color-text-secondary)">${item.time}</p>
              <p class="mt-4" style="color: var(--color-text-secondary)">${item.description}</p>
            `;
            scheduleGrid.appendChild(card);

            // Observe for animation
            if (observer) observer.observe(card);
          });

          console.log(
            "✅ Rendered",
            data.schedules.items.length,
            "schedule cards"
          );
        }
      }
    } catch (error) {
      console.warn("⚠️ Could not load dynamic content:", error);
    }
  }

  // Load dynamic content
  loadDynamicContent();

  // Load dynamic content
  loadDynamicContent();

  // Scroll reveal
  observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const delay = entry.target.style.transitionDelay
            ? parseInt(entry.target.style.transitionDelay)
            : 0;
          setTimeout(() => entry.target.classList.add("is-visible"), delay);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );

  document
    .querySelectorAll("[data-animate]:not(.is-visible)")
    .forEach((el) => observer.observe(el));

  // Header shadow on scroll
  window.addEventListener("scroll", () => {
    if (window.scrollY > 10) header.classList.add("shadow-lg");
    else header.classList.remove("shadow-lg");
  });

  // === Load WARTA via JSONP (anti-CORS) ===
  const WARTA_JSONP_URL = `${APPS_URL}?service=warta&callback=renderWarta`;
  injectScript(WARTA_JSONP_URL, () => {
    const grid = document.getElementById("warta-grid");
    if (grid)
      grid.innerHTML = `<div class="text-center col-span-3"><p style="color: var(--color-text-secondary)">Gagal memuat Warta Jemaat.</p></div>`;
  });

  // === YouTube Spotlight: JSONP dulu, kalau gagal pakai API key ===
  const YT_JSONP_URL = `${APPS_URL}?service=yt&channelId=${encodeURIComponent(
    CHANNEL_ID
  )}&callback=renderYT`;
  injectScript(YT_JSONP_URL, () => fetchYouTubeDirect(CHANNEL_ID, YT_API_KEY));

  // Fallback keamanan: bila JSONP YT tidak panggil callback dalam 12 detik → pakai API
  setTimeout(() => {
    if (!window.__ytJsonpOk) fetchYouTubeDirect(CHANNEL_ID, YT_API_KEY);
  }, 12000);

  // === Lazy-load Elfsight saat #galeri mendekati viewport ===
  const galeri = document.getElementById("galeri");
  let elfsightLoaded = false;
  if (galeri) {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !elfsightLoaded) {
            elfsightLoaded = true;
            const s = document.createElement("script");
            s.src = "https://elfsightcdn.com/platform.js";
            s.async = true;
            document.head.appendChild(s);
            obs.disconnect();
          }
        });
      },
      { rootMargin: "800px" }
    );
    obs.observe(galeri);
  }
});
