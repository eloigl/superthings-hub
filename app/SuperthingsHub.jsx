"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Linkedin,
  Youtube,
  Grid3x3,
  MessagesSquare,
  Newspaper,
  Search,
  Settings,
  RefreshCw,
  ExternalLink,
  Check,
  X,
  Play,
  Calendar,
  Filter,
  Eye,
  EyeOff,
  Star,
  Heart,
  AlertCircle,
  Loader2,
  Zap,
  Info,
  Moon,
  Sun,
  ChevronDown,
} from "lucide-react";

/* =========================================================================
   SUPERTHINGS HUB
   App de seguimiento automático de contenido sobre SuperThings
   ========================================================================= */

// ---------- CONFIG POR DEFECTO (editable desde la pestaña de Ajustes) ----------
const DEFAULT_CONFIG = {
  linkedinCompany: "magic-box-int-",
  linkedinRssUrl: "https://rss.app/feeds/ncqqzQD5qCRcpNTf.xml",
  youtubePlaylistId: "PLkoFClbNd6NDy0GUQuY5p3eDQm3qnYKqH",
  fandomWiki: "superthings",
  newsQuery: "Superthings La Película",
  darkMode: true,
};

// En Next.js las llamadas pasan por nuestra API route interna (/api/rss)
// que se ejecuta en el servidor. Adiós a todos los errores CORS.
const fetchWithFallback = async (targetUrl) => {
  const proxyUrl = `/api/rss?url=${encodeURIComponent(targetUrl)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(proxyUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error || `Error ${response.status}`);
    }
    const text = await response.text();
    if (!text || text.length < 50) throw new Error("Respuesta vacía del servidor");
    return { text };
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
};

// ---------- 16 SERIES DE SUPERTHINGS ----------
// Los personajes se cargan al vuelo desde /api/characters que consulta Fandom.
// Así siempre están actualizados con lo último que publica MagicBox.
const SERIES_LIST = [
  { slug: "Series_1",                      name: "Serie 1",                accent: "#ff006e" },
  { slug: "Series_2",                      name: "Serie 2",                accent: "#3a86ff" },
  { slug: "Series_3",                      name: "Serie 3",                accent: "#fb5607" },
  { slug: "Series_4",                      name: "Serie 4",                accent: "#8338ec" },
  { slug: "Series_5",                      name: "Serie 5",                accent: "#ffbe0b" },
  { slug: "Secret_Spies_Series",           name: "Secret Spies",           accent: "#06d6a0" },
  { slug: "Power_Machines_Series",         name: "Power Machines",         accent: "#ef476f" },
  { slug: "Kazoom_Kids_Series",            name: "Kazoom Kids",            accent: "#f72585" },
  { slug: "Guardians_of_Kazoom_Series",    name: "Guardians of Kazoom",    accent: "#d00000" },
  { slug: "Rescue_Force_Series",           name: "Rescue Force",           accent: "#00b4d8" },
  { slug: "Neon_Power_Series",             name: "Neon Power",             accent: "#c77dff" },
  { slug: "Mutant_Battle_Series",          name: "Mutant Battle",          accent: "#588b8b" },
  { slug: "Kazoom_Power_Battle_Series",    name: "Kazoom Power Battle",    accent: "#f48c06" },
  { slug: "Kazoom_Power_Mission_Series",   name: "Kazoom Power Mission",   accent: "#118ab2" },
  { slug: "Kazoom_Power_Warriors_Series",  name: "Kazoom Power Warriors",  accent: "#e4b343" },
  { slug: "Evolution_Series",              name: "Evolution",              accent: "#7209b7" },
];

// ---------- Helpers de storage local ----------
const STORAGE_KEYS = {
  config:     "superthings_config",
  seen:       "superthings_seen_characters",
  favorites:  "superthings_favorites",
};

const loadFromStorage = async (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v) return JSON.parse(v);
  } catch (e) {}
  return fallback;
};

const saveToStorage = async (key, value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
};

// ---------- Parser RSS genérico (usa DOMParser del navegador) ----------
const parseRSS = (xmlString) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, "text/xml");
  const items = [];

  // Atom (YouTube)
  const atomEntries = doc.querySelectorAll("entry");
  if (atomEntries.length > 0) {
    atomEntries.forEach((entry) => {
      const videoId = entry.querySelector("videoId")?.textContent
        || entry.querySelector("id")?.textContent?.split(":").pop();
      const title = entry.querySelector("title")?.textContent || "";
      const published = entry.querySelector("published")?.textContent
        || entry.querySelector("updated")?.textContent || "";
      const link = entry.querySelector("link")?.getAttribute("href") || "";
      const authorName = entry.querySelector("author name")?.textContent || "";
      const thumbnail = entry.getElementsByTagName("media:thumbnail")[0]?.getAttribute("url")
        || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : "");
      const description = entry.getElementsByTagName("media:description")[0]?.textContent
        || entry.querySelector("summary")?.textContent || "";
      items.push({
        id: videoId || link, title, link, date: published,
        author: authorName, thumbnail, description, videoId,
      });
    });
    return items;
  }

  // RSS 2.0 (Fandom, LinkedIn via rss.app, etc.)
  const rssItems = doc.querySelectorAll("item");
  rssItems.forEach((item) => {
    const title = item.querySelector("title")?.textContent || "";
    const link = item.querySelector("link")?.textContent || "";
    const pubDate = item.querySelector("pubDate")?.textContent || "";
    const description = item.querySelector("description")?.textContent || "";
    const creator = item.getElementsByTagName("dc:creator")[0]?.textContent || "";
    // Buscar imagen en enclosure, media:content, media:thumbnail o dentro del HTML
    let image = item.querySelector("enclosure[url]")?.getAttribute("url") || "";
    if (!image) {
      image = item.getElementsByTagName("media:content")[0]?.getAttribute("url") || "";
    }
    if (!image) {
      image = item.getElementsByTagName("media:thumbnail")[0]?.getAttribute("url") || "";
    }
    if (!image) {
      const match = description.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (match) image = match[1];
    }
    items.push({
      id: link, title, link, date: pubDate, description,
      author: creator, thumbnail: image,
    });
  });
  return items;
};

const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
};

const timeAgo = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "hace unos segundos";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 2592000) return `hace ${Math.floor(diff / 86400)} días`;
  return formatDate(dateStr);
};

const stripHtml = (html) => {
  if (typeof document === "undefined") {
    // Fallback SSR: regex básico
    return (html || "").replace(/<[^>]*>/g, "");
  }
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
};

// ---------- Helpers de YouTube (solo formateo, la API va por /api/youtube) ----------
// Convierte duración ISO 8601 (PT1H2M3S) a formato legible (1:02:03)
const parseDuration = (iso) => {
  if (!iso) return "";
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "";
  const h = parseInt(match[1] || 0, 10);
  const m = parseInt(match[2] || 0, 10);
  const s = parseInt(match[3] || 0, 10);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

// Convierte número de vistas a formato compacto (1234567 -> 1,2M)
const formatViews = (n) => {
  const num = parseInt(n, 10);
  if (isNaN(num)) return "";
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1).replace(".", ",")}K`;
  return num.toString();
};

// =======================================================================
// COMPONENTE PRINCIPAL
// =======================================================================
export default function SuperthingsHub() {
  const [activeTab, setActiveTab] = useState("linkedin");
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");

  useEffect(() => {
    (async () => {
      const stored = await loadFromStorage(STORAGE_KEYS.config, DEFAULT_CONFIG);
      // Merge inteligente: DEFAULT_CONFIG como base, storage solo sobrescribe lo que está definido
      const merged = { ...DEFAULT_CONFIG };
      Object.keys(stored).forEach(key => {
        if (stored[key] !== undefined && stored[key] !== null && stored[key] !== "") {
          merged[key] = stored[key];
        }
      });
      // Excepción: darkMode sí puede ser false explícito
      if (typeof stored.darkMode === "boolean") merged.darkMode = stored.darkMode;
      setConfig(merged);
      setConfigLoaded(true);
    })();
  }, []);

  const updateConfig = (patch) => {
    const next = { ...config, ...patch };
    setConfig(next);
    saveToStorage(STORAGE_KEYS.config, next);
  };

  const tabs = [
    { id: "linkedin",  label: "LinkedIn", icon: Linkedin,        accent: "#0a66c2" },
    { id: "youtube",   label: "YouTube",  icon: Youtube,         accent: "#ff0033" },
    { id: "pokedex",   label: "Pokédex",  icon: Grid3x3,         accent: "#fbbf24" },
    { id: "fandom",    label: "Fandom",   icon: MessagesSquare,  accent: "#fa005a" },
    { id: "noticias",  label: "Película", icon: Newspaper,       accent: "#22d3ee" },
  ];

  const bg = config.darkMode
    ? "linear-gradient(135deg, #0a0118 0%, #1a0b2e 50%, #0e0720 100%)"
    : "linear-gradient(135deg, #fef3c7 0%, #fed7aa 50%, #fecaca 100%)";

  const textMain = config.darkMode ? "#f1f5f9" : "#0f172a";
  const textMuted = config.darkMode ? "#94a3b8" : "#475569";
  const cardBg = config.darkMode ? "rgba(15, 10, 35, 0.6)" : "rgba(255,255,255,0.7)";
  const borderCol = config.darkMode ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  if (!configLoaded) {
    return (
      <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={40} className="animate-spin" style={{ color: "#fbbf24" }} />
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: bg,
        color: textMain,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Fondo decorativo - blobs de color */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: config.darkMode ? 0.5 : 0.25,
      }}>
        <div style={{
          position: "absolute", top: "-10%", left: "-10%", width: "40vw", height: "40vw",
          background: "radial-gradient(circle, #ff006e 0%, transparent 70%)", filter: "blur(80px)",
        }}/>
        <div style={{
          position: "absolute", bottom: "-10%", right: "-10%", width: "40vw", height: "40vw",
          background: "radial-gradient(circle, #3a86ff 0%, transparent 70%)", filter: "blur(80px)",
        }}/>
        <div style={{
          position: "absolute", top: "40%", left: "50%", width: "30vw", height: "30vw",
          background: "radial-gradient(circle, #fbbf24 0%, transparent 70%)", filter: "blur(80px)",
        }}/>
      </div>

      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 50,
        backdropFilter: "blur(20px)",
        background: config.darkMode ? "rgba(10,1,24,0.7)" : "rgba(255,255,255,0.7)",
        borderBottom: `1px solid ${borderCol}`,
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", padding: "14px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            {/* Logo */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "linear-gradient(135deg, #ff006e 0%, #fb5607 50%, #ffbe0b 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 6px 20px rgba(255,0,110,0.4)",
              }}>
                <Zap size={24} color="white" strokeWidth={2.5} />
              </div>
              <div>
                <h1 style={{
                  margin: 0, fontSize: 20, fontWeight: 900, letterSpacing: "-0.02em",
                  background: "linear-gradient(90deg, #ff006e, #ffbe0b)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                }}>
                  SUPERTHINGS HUB
                </h1>
                <p style={{ margin: 0, fontSize: 11, color: textMuted, fontWeight: 500 }}>
                  Centro de información en tiempo real
                </p>
              </div>
            </div>

            {/* Search + Controls */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: cardBg, border: `1px solid ${borderCol}`,
                borderRadius: 10, padding: "8px 12px", minWidth: 180,
              }}>
                <Search size={16} color={textMuted} />
                <input
                  type="text"
                  value={globalSearch}
                  onChange={(e) => setGlobalSearch(e.target.value)}
                  placeholder="Buscar..."
                  style={{
                    background: "transparent", border: "none", outline: "none",
                    color: textMain, fontSize: 14, width: "100%", fontFamily: "inherit",
                  }}
                />
              </div>
              <button onClick={() => updateConfig({ darkMode: !config.darkMode })}
                style={iconBtnStyle(config.darkMode)} title={config.darkMode ? "Modo claro" : "Modo oscuro"}>
                {config.darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              <button onClick={() => setShowSettings(true)}
                style={iconBtnStyle(config.darkMode)} title="Ajustes">
                <Settings size={18} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <nav style={{
            display: "flex", gap: 4, marginTop: 14, overflowX: "auto",
            scrollbarWidth: "none", msOverflowStyle: "none",
          }}>
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button key={t.id} onClick={() => setActiveTab(t.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 16px", borderRadius: 10,
                    background: active ? t.accent : "transparent",
                    color: active ? "white" : textMain,
                    border: active ? "none" : `1px solid ${borderCol}`,
                    fontSize: 14, fontWeight: 600, cursor: "pointer",
                    whiteSpace: "nowrap", transition: "all 0.2s",
                    boxShadow: active ? `0 6px 20px ${t.accent}50` : "none",
                    fontFamily: "inherit",
                  }}>
                  <Icon size={16} />
                  {t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 20px 80px", position: "relative", zIndex: 1 }}>
        {activeTab === "linkedin" && <LinkedInTab config={config} search={globalSearch} theme={{ textMain, textMuted, cardBg, borderCol, darkMode: config.darkMode }} />}
        {activeTab === "youtube"  && <YouTubeTab  config={config} search={globalSearch} theme={{ textMain, textMuted, cardBg, borderCol, darkMode: config.darkMode }} />}
        {activeTab === "pokedex"  && <PokedexTab  config={config} search={globalSearch} theme={{ textMain, textMuted, cardBg, borderCol, darkMode: config.darkMode }} />}
        {activeTab === "fandom"   && <FandomTab   config={config} search={globalSearch} theme={{ textMain, textMuted, cardBg, borderCol, darkMode: config.darkMode }} />}
        {activeTab === "noticias" && <NewsTab     config={config} search={globalSearch} theme={{ textMain, textMuted, cardBg, borderCol, darkMode: config.darkMode }} />}
      </main>

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal config={config} updateConfig={updateConfig} onClose={() => setShowSettings(false)} theme={{ textMain, textMuted, cardBg, borderCol, darkMode: config.darkMode }}/>
      )}
    </div>
  );
}

const iconBtnStyle = (dark) => ({
  display: "flex", alignItems: "center", justifyContent: "center",
  width: 38, height: 38, borderRadius: 10,
  background: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
  border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
  color: dark ? "#f1f5f9" : "#0f172a", cursor: "pointer", transition: "all 0.2s",
});

// =======================================================================
// Componentes compartidos
// =======================================================================
const SectionHeader = ({ title, subtitle, onRefresh, loading, theme, extra }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
    <div>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em", color: theme.textMain }}>
        {title}
      </h2>
      {subtitle && <p style={{ margin: "4px 0 0", fontSize: 13, color: theme.textMuted }}>{subtitle}</p>}
    </div>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {extra}
      {onRefresh && (
        <button onClick={onRefresh} disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
            background: theme.cardBg, border: `1px solid ${theme.borderCol}`,
            borderRadius: 10, color: theme.textMain, fontSize: 13, fontWeight: 600,
            cursor: loading ? "wait" : "pointer", fontFamily: "inherit",
          }}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Actualizar
        </button>
      )}
    </div>
  </div>
);

const EmptyState = ({ icon: Icon, title, description, theme, children }) => (
  <div style={{
    background: theme.cardBg, border: `1px dashed ${theme.borderCol}`,
    borderRadius: 16, padding: 48, textAlign: "center",
  }}>
    <div style={{
      width: 64, height: 64, borderRadius: 16, margin: "0 auto 16px",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(135deg, #ff006e20, #ffbe0b20)",
    }}>
      <Icon size={28} style={{ color: theme.textMuted }} />
    </div>
    <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: theme.textMain }}>{title}</h3>
    <p style={{ margin: "0 0 16px", fontSize: 14, color: theme.textMuted, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
      {description}
    </p>
    {children}
  </div>
);

const InfoBanner = ({ children, theme, color = "#fbbf24" }) => (
  <div style={{
    display: "flex", gap: 12, padding: 14,
    background: `${color}12`, border: `1px solid ${color}40`,
    borderRadius: 12, marginBottom: 18,
  }}>
    <Info size={18} color={color} style={{ flexShrink: 0, marginTop: 1 }} />
    <div style={{ fontSize: 13, color: theme.textMain, lineHeight: 1.5 }}>{children}</div>
  </div>
);

// =======================================================================
// PESTAÑA 1 — LINKEDIN
// =======================================================================
function LinkedInTab({ config, search, theme }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPosts = useCallback(async () => {
    if (!config.linkedinRssUrl) {
      setPosts([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { text: xml } = await fetchWithFallback(config.linkedinRssUrl);
      const parsed = parseRSS(xml);
      parsed.sort((a, b) => new Date(b.date) - new Date(a.date));
      setPosts(parsed);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [config.linkedinRssUrl]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const filtered = useMemo(() => {
    if (!search) return posts;
    const q = search.toLowerCase();
    return posts.filter(p => (p.title + " " + p.description).toLowerCase().includes(q));
  }, [posts, search]);

  return (
    <div>
      <SectionHeader
        title="Posts de LinkedIn"
        subtitle={`Página: linkedin.com/company/${config.linkedinCompany}`}
        onRefresh={fetchPosts} loading={loading} theme={theme}
      />

      {!config.linkedinRssUrl && (
        <InfoBanner theme={theme}>
          <strong>LinkedIn no ofrece acceso público gratuito directo a los posts de una empresa.</strong> Para que esta pestaña se actualice automáticamente, necesitas generar un feed RSS usando un servicio gratuito:
          <ol style={{ margin: "8px 0 0 20px", padding: 0 }}>
            <li>Ve a <a href="https://rss.app" target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>rss.app</a> (hay un plan gratuito).</li>
            <li>Pega la URL: <code style={{ background: theme.cardBg, padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>https://www.linkedin.com/company/{config.linkedinCompany}</code></li>
            <li>Copia la URL del feed RSS generado.</li>
            <li>Pégala en <strong>Ajustes → URL del feed RSS de LinkedIn</strong>.</li>
          </ol>
        </InfoBanner>
      )}

      {config.linkedinRssUrl && !error && !loading && posts.length > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
          padding: "10px 14px", borderRadius: 10,
          background: "rgba(10,102,194,0.08)", border: "1px solid rgba(10,102,194,0.2)",
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: "#10b981",
            boxShadow: "0 0 12px rgba(16,185,129,0.6)",
          }}/>
          <div style={{ fontSize: 13, color: theme.textMain }}>
            <strong>{posts.length} posts cargados</strong>
            <span style={{ color: theme.textMuted, marginLeft: 6 }}>
              • Feed actualizado vía RSS.app (refresco ~24h)
            </span>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: 16, marginBottom: 18,
          background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
          borderRadius: 12,
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertCircle size={18} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }}/>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#fca5a5", marginBottom: 4 }}>
                No se pudo cargar el feed
              </div>
              <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 10, lineHeight: 1.5 }}>
                Los servicios de proxy CORS no están respondiendo. Esto es temporal (normalmente se soluciona en minutos). Si persiste, el feed de RSS.app puede haber cambiado de URL.
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={fetchPosts} style={{
                  padding: "6px 12px", borderRadius: 8, border: "none",
                  background: "#ef4444", color: "white", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit",
                }}>Reintentar</button>
                <a href={config.linkedinRssUrl} target="_blank" rel="noreferrer" style={{
                  padding: "6px 12px", borderRadius: 8, textDecoration: "none",
                  background: "rgba(255,255,255,0.08)", color: theme.textMain,
                  fontSize: 12, fontWeight: 600,
                }}>Ver feed directamente</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && posts.length === 0 && <LoadingGrid theme={theme} />}

      {!loading && filtered.length === 0 && config.linkedinRssUrl && (
        <EmptyState icon={Linkedin} title="Aún no hay posts" description="El feed no ha devuelto publicaciones. Verifica la URL o inténtalo de nuevo más tarde." theme={theme}/>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
        {filtered.map((post) => <LinkedInCard key={post.id} post={post} theme={theme} />)}
      </div>
    </div>
  );
}

const LinkedInCard = ({ post, theme }) => {
  const [expanded, setExpanded] = useState(false);

  // Extraer hashtags del HTML original de forma única (respetando el orden)
  const hashtagsSet = new Set();
  const hashtags = [];
  const hashRegex = /#([A-Za-zÀ-ÿ0-9_]+)/g;
  let match;
  const rawText = post.description || "";
  while ((match = hashRegex.exec(rawText)) !== null) {
    const tag = match[1];
    if (!hashtagsSet.has(tag.toLowerCase())) {
      hashtagsSet.add(tag.toLowerCase());
      hashtags.push(tag);
    }
  }

  // Limpiar el texto: quitar HTML y los hashtags del final
  let cleanText = stripHtml(rawText).trim();
  // Quitar hashtags duplicados al final
  cleanText = cleanText.replace(/(#[A-Za-zÀ-ÿ0-9_]+\s*)+$/g, "").trim();

  const SHORT_LIMIT = 260;
  const isLong = cleanText.length > SHORT_LIMIT;
  const displayText = expanded || !isLong ? cleanText : cleanText.slice(0, SHORT_LIMIT) + "…";

  return (
    <article style={{
      background: theme.cardBg, border: `1px solid ${theme.borderCol}`,
      borderRadius: 16, overflow: "hidden",
      display: "flex", flexDirection: "column",
      transition: "transform 0.2s, box-shadow 0.2s",
    }}>
      {/* Cabecera con autor y fecha */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "14px 16px 10px",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: "linear-gradient(135deg, #0a66c2, #0073b1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 12px rgba(10,102,194,0.35)", flexShrink: 0,
        }}>
          <Linkedin size={18} color="white" />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: theme.textMain,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {post.author || "Magicbox"}
          </div>
          <div style={{ fontSize: 11, color: theme.textMuted, display: "flex", gap: 5, alignItems: "center" }}>
            <span>LinkedIn</span>
            <span>•</span>
            <span>{timeAgo(post.date)}</span>
          </div>
        </div>
      </div>

      {/* Imagen si existe */}
      {post.thumbnail && (
        <div style={{
          width: "100%", maxHeight: 360, background: "#000", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <img
            src={post.thumbnail} alt=""
            style={{ width: "100%", height: "auto", objectFit: "cover", display: "block" }}
            onError={(e) => { e.target.parentElement.style.display = "none"; }}
          />
        </div>
      )}

      {/* Cuerpo del post */}
      <div style={{ padding: "14px 16px", flex: 1, display: "flex", flexDirection: "column" }}>
        <p style={{
          margin: 0, fontSize: 14, lineHeight: 1.55, color: theme.textMain,
          whiteSpace: "pre-wrap", wordBreak: "break-word",
        }}>
          {displayText}
        </p>

        {isLong && (
          <button onClick={() => setExpanded(!expanded)} style={{
            alignSelf: "flex-start", marginTop: 6, padding: 0,
            background: "transparent", border: "none", cursor: "pointer",
            color: "#0a66c2", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
          }}>
            {expanded ? "Ver menos" : "Ver más"}
          </button>
        )}

        {/* Hashtags */}
        {hashtags.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
            {hashtags.slice(0, 8).map(tag => (
              <span key={tag} style={{
                fontSize: 11, padding: "3px 8px", borderRadius: 6,
                background: "rgba(10,102,194,0.12)", color: "#60a5fa", fontWeight: 600,
              }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Acción */}
        <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <a href={post.link} target="_blank" rel="noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "8px 14px", borderRadius: 8,
            background: "#0a66c2", color: "white",
            fontSize: 13, fontWeight: 600, textDecoration: "none",
            transition: "background 0.2s",
          }}>
            Ver en LinkedIn <ExternalLink size={13} />
          </a>
          <div style={{ fontSize: 11, color: theme.textMuted }}>
            {formatDate(post.date)}
          </div>
        </div>
      </div>
    </article>
  );
};

// =======================================================================
// PESTAÑA 2 — YOUTUBE
// =======================================================================
function YouTubeTab({ config, search, theme }) {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [visibleCount, setVisibleCount] = useState(12);

  const fetchVideos = useCallback(async () => {
    if (!config.youtubePlaylistId) return;
    setLoading(true);
    setError(null);
    try {
      // Llamamos a nuestra API route interna que tiene la API key en el servidor
      const res = await fetch(`/api/youtube?playlistId=${config.youtubePlaylistId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Error ${res.status}`);
      }
      const data = await res.json();

      // La API route ya devuelve los vídeos en formato limpio, solo falta parsear duración
      const videos = (data.videos || []).map(v => ({
        ...v,
        duration: v.duration ? parseDuration(v.duration) : null,
      }));

      setVideos(videos);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [config.youtubePlaylistId]);

  useEffect(() => { fetchVideos(); }, [fetchVideos]);

  const filtered = useMemo(() => {
    if (!search) return videos;
    const q = search.toLowerCase();
    return videos.filter(v => v.title.toLowerCase().includes(q));
  }, [videos, search]);

  return (
    <div>
      <SectionHeader
        title="Vídeos de YouTube"
        subtitle={videos.length > 0 ? `${videos.length} vídeos (API oficial de YouTube ✓)` : "Cargando..."}
        onRefresh={fetchVideos} loading={loading} theme={theme}
      />

      {error && <InfoBanner theme={theme} color="#ef4444">{error}</InfoBanner>}

      {selected && (
        <div style={{
          background: "#000", borderRadius: 16, overflow: "hidden",
          marginBottom: 24, boxShadow: "0 20px 60px rgba(255,0,51,0.3)",
        }}>
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0 }}>
            <iframe
              src={`https://www.youtube.com/embed/${selected.videoId}?autoplay=1`}
              title={selected.title} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
            />
          </div>
          <div style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f1f5f9" }}>{selected.title}</h3>
            <button onClick={() => setSelected(null)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
              background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8, color: "#f1f5f9", cursor: "pointer", fontSize: 13, fontFamily: "inherit",
            }}>
              <X size={14}/> Cerrar
            </button>
          </div>
        </div>
      )}

      {loading && videos.length === 0 && <LoadingGrid theme={theme} />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {filtered.slice(0, visibleCount).map((v) => (
          <YouTubeCard key={v.id} video={v} onPlay={() => setSelected(v)} theme={theme}/>
        ))}
      </div>

      {filtered.length > visibleCount && (
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <button onClick={() => setVisibleCount(c => c + 12)} style={{
            padding: "12px 24px",
            background: "linear-gradient(135deg, #ff0033 0%, #ff4d6d 100%)",
            border: "none", borderRadius: 10, color: "white", fontWeight: 700,
            cursor: "pointer", fontSize: 14, fontFamily: "inherit",
            boxShadow: "0 6px 20px rgba(255,0,51,0.35)",
          }}>
            Cargar más vídeos ({filtered.length - visibleCount} restantes)
          </button>
        </div>
      )}
    </div>
  );
}

const YouTubeCard = ({ video, onPlay, theme }) => (
  <article style={{
    background: theme.cardBg, border: `1px solid ${theme.borderCol}`,
    borderRadius: 14, overflow: "hidden", cursor: "pointer",
    transition: "transform 0.2s",
  }} onClick={onPlay}>
    <div style={{ position: "relative", aspectRatio: "16/9", background: "#000" }}>
      {video.thumbnail && (
        <img src={video.thumbnail} alt={video.title} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
      )}

      {/* Badge de posición en la playlist */}
      {typeof video.position === "number" && (
        <div style={{
          position: "absolute", top: 8, left: 8,
          padding: "3px 8px", borderRadius: 6,
          background: "rgba(0,0,0,0.85)", color: "white",
          fontSize: 11, fontWeight: 700,
          backdropFilter: "blur(4px)",
        }}>
          #{video.position + 1}
        </div>
      )}

      {/* Badge de duración */}
      {video.duration && (
        <div style={{
          position: "absolute", bottom: 8, right: 8,
          padding: "3px 7px", borderRadius: 6,
          background: "rgba(0,0,0,0.85)", color: "white",
          fontSize: 12, fontWeight: 600,
          fontFamily: "'SF Mono', Consolas, monospace",
          backdropFilter: "blur(4px)",
        }}>
          {video.duration}
        </div>
      )}

      {/* Overlay con botón de play */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.5))",
        opacity: 0.9, transition: "opacity 0.2s",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "rgba(255,0,51,0.95)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 8px 24px rgba(255,0,51,0.5)",
        }}>
          <Play size={24} color="white" fill="white" style={{ marginLeft: 3 }}/>
        </div>
      </div>
    </div>
    <div style={{ padding: 12 }}>
      <h3 style={{
        margin: 0, fontSize: 14, fontWeight: 700, color: theme.textMain,
        lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
        minHeight: 38,
      }}>{video.title}</h3>
      <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: theme.textMuted, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Calendar size={12}/>
          {timeAgo(video.date)}
        </span>
        {video.views && (
          <>
            <span>•</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <Eye size={12}/>
              {formatViews(video.views)}
            </span>
          </>
        )}
      </div>
    </div>
  </article>
);

// =======================================================================
// PESTAÑA 3 — POKÉDEX
// =======================================================================
function PokedexTab({ config, search, theme }) {
  const [seen, setSeen] = useState({});
  const [favorites, setFavorites] = useState({});
  const [seriesData, setSeriesData] = useState({}); // { slug: { loading, error, characters } }
  const [filterSeries, setFilterSeries] = useState("all");
  const [filterSeen, setFilterSeen] = useState("all");
  const [loaded, setLoaded] = useState(false);
  const [expandedSeries, setExpandedSeries] = useState({}); // { slug: true } - series plegadas/desplegadas

  // Cargar progreso desde localStorage
  useEffect(() => {
    (async () => {
      const s = await loadFromStorage(STORAGE_KEYS.seen, {});
      const f = await loadFromStorage(STORAGE_KEYS.favorites, {});
      setSeen(s); setFavorites(f);
      setLoaded(true);
    })();
  }, []);

  // Cargar personajes de una serie desde la API
  const loadSeries = useCallback(async (slug) => {
    setSeriesData(prev => ({ ...prev, [slug]: { loading: true, error: null, characters: [] } }));
    try {
      const res = await fetch(`/api/characters?series=${encodeURIComponent(slug)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || `Error ${res.status}`);
      }
      const data = await res.json();
      setSeriesData(prev => ({ ...prev, [slug]: {
        loading: false,
        error: null,
        characters: (data.characters || []).map(c => ({
          ...c,
          id: `${slug}:${c.slug || c.name}`, // id único combinando serie y personaje
          series: data.seriesName,
          seriesSlug: slug,
        })),
      }}));
    } catch (e) {
      setSeriesData(prev => ({ ...prev, [slug]: { loading: false, error: e.message, characters: [] } }));
    }
  }, []);

  // Al abrir la pestaña, cargar las primeras 2 series y marcar el resto como "por cargar"
  useEffect(() => {
    if (!loaded) return;
    // Carga automática de las dos primeras series para no saturar
    loadSeries(SERIES_LIST[0].slug);
    loadSeries(SERIES_LIST[1].slug);
    setExpandedSeries({ [SERIES_LIST[0].slug]: true, [SERIES_LIST[1].slug]: true });
  }, [loaded, loadSeries]);

  const toggleSeen = (id) => {
    const next = { ...seen };
    if (next[id]) delete next[id]; else next[id] = Date.now();
    setSeen(next);
    saveToStorage(STORAGE_KEYS.seen, next);
  };

  const toggleFav = (id) => {
    const next = { ...favorites };
    if (next[id]) delete next[id]; else next[id] = true;
    setFavorites(next);
    saveToStorage(STORAGE_KEYS.favorites, next);
  };

  const toggleExpand = (slug) => {
    if (!expandedSeries[slug] && !seriesData[slug]) {
      loadSeries(slug);
    }
    setExpandedSeries(prev => ({ ...prev, [slug]: !prev[slug] }));
  };

  // Calcular totales globales
  const totals = useMemo(() => {
    let allChars = [];
    Object.values(seriesData).forEach(s => {
      if (s.characters) allChars = allChars.concat(s.characters);
    });
    const totalSeen = allChars.filter(c => seen[c.id]).length;
    return { total: allChars.length, seen: totalSeen, allChars };
  }, [seriesData, seen]);

  const progress = totals.total > 0 ? (totals.seen / totals.total) * 100 : 0;

  // Series a mostrar según filtro
  const seriesToShow = filterSeries === "all"
    ? SERIES_LIST
    : SERIES_LIST.filter(s => s.slug === filterSeries);

  if (!loaded) return <LoadingGrid theme={theme}/>;

  return (
    <div>
      <SectionHeader
        title="Pokédex de Personajes"
        subtitle="Datos en vivo desde Fandom Wiki · Progreso guardado en este dispositivo"
        theme={theme}
      />

      {/* Progreso global */}
      <div style={{
        background: theme.cardBg, border: `1px solid ${theme.borderCol}`,
        borderRadius: 16, padding: 20, marginBottom: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 2 }}>Progreso (series cargadas)</div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.02em", color: theme.textMain }}>
              Has visto <span style={{ color: "#fbbf24" }}>{totals.seen}</span> de {totals.total} personajes
            </div>
          </div>
          <div style={{
            width: 64, height: 64, borderRadius: "50%",
            background: `conic-gradient(#fbbf24 ${progress}%, rgba(255,255,255,0.08) 0)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: theme.darkMode ? "#1a0b2e" : "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: theme.textMain,
            }}>{Math.round(progress)}%</div>
          </div>
        </div>
        <div style={{ height: 8, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: "linear-gradient(90deg, #ff006e, #fbbf24)",
            borderRadius: 4, transition: "width 0.5s",
          }}/>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <select value={filterSeries} onChange={(e) => setFilterSeries(e.target.value)} style={selectStyle(theme)}>
          <option value="all">Todas las series ({SERIES_LIST.length})</option>
          {SERIES_LIST.map(s => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: "all", label: "Todos", icon: Grid3x3 },
            { id: "seen", label: "Vistos", icon: Eye },
            { id: "unseen", label: "Por ver", icon: EyeOff },
          ].map(f => {
            const active = filterSeen === f.id;
            const Icon = f.icon;
            return (
              <button key={f.id} onClick={() => setFilterSeen(f.id)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 10,
                background: active ? "#fbbf24" : theme.cardBg,
                color: active ? "#78350f" : theme.textMain,
                border: `1px solid ${active ? "#fbbf24" : theme.borderCol}`,
                cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              }}>
                <Icon size={14}/> {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Series (acordeón con lazy loading) */}
      {seriesToShow.map(serie => {
        const data = seriesData[serie.slug];
        const isExpanded = expandedSeries[serie.slug];
        const chars = data?.characters || [];

        // Aplicar filtros de búsqueda/vistos a los personajes ya cargados
        const filteredChars = chars.filter(c => {
          if (filterSeen === "seen" && !seen[c.id]) return false;
          if (filterSeen === "unseen" && seen[c.id]) return false;
          if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
          return true;
        });

        const seenInSeries = chars.filter(c => seen[c.id]).length;

        return (
          <div key={serie.slug} style={{ marginBottom: 16 }}>
            {/* Cabecera de serie (clicable) */}
            <button
              onClick={() => toggleExpand(serie.slug)}
              style={{
                width: "100%", padding: "14px 18px", borderRadius: 14,
                background: theme.cardBg, border: `1px solid ${theme.borderCol}`,
                display: "flex", alignItems: "center", gap: 12,
                cursor: "pointer", fontFamily: "inherit", color: theme.textMain,
                marginBottom: isExpanded ? 12 : 0,
                transition: "all 0.2s",
                textAlign: "left",
              }}
            >
              <div style={{ width: 4, height: 28, background: serie.accent, borderRadius: 2 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: theme.textMain }}>
                  {serie.name}
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                  {data?.loading ? "Cargando personajes..." :
                   data?.error ? `Error: ${data.error}` :
                   chars.length > 0 ? `${seenInSeries} / ${chars.length} vistos` :
                   "Pulsa para cargar"}
                </div>
              </div>
              {chars.length > 0 && (
                <div style={{
                  padding: "3px 10px", borderRadius: 8,
                  background: `${serie.accent}22`, color: serie.accent,
                  fontSize: 12, fontWeight: 700,
                }}>{chars.length}</div>
              )}
              <ChevronDown size={18} style={{
                transition: "transform 0.2s",
                transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                color: theme.textMuted,
              }}/>
            </button>

            {/* Contenido expandido */}
            {isExpanded && (
              <div style={{ padding: "0 4px" }}>
                {data?.loading && <LoadingGrid theme={theme}/>}
                {data?.error && (
                  <div style={{
                    padding: 14, borderRadius: 12,
                    background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                    fontSize: 13, color: "#fca5a5", display: "flex", gap: 10, alignItems: "center",
                  }}>
                    <AlertCircle size={16}/>
                    <div style={{ flex: 1 }}>No se pudieron cargar los personajes: {data.error}</div>
                    <button onClick={() => loadSeries(serie.slug)} style={{
                      padding: "6px 12px", borderRadius: 8, border: "none",
                      background: "#ef4444", color: "white", fontSize: 12, fontWeight: 600,
                      cursor: "pointer", fontFamily: "inherit",
                    }}>Reintentar</button>
                  </div>
                )}
                {data && !data.loading && !data.error && filteredChars.length === 0 && (
                  <div style={{ padding: 20, textAlign: "center", color: theme.textMuted, fontSize: 13 }}>
                    {chars.length === 0 ? "No se encontraron personajes." : "Ninguno coincide con los filtros."}
                  </div>
                )}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: 10,
                }}>
                  {filteredChars.map(c => (
                    <PokedexCard
                      key={c.id}
                      character={c}
                      seriesAccent={serie.accent}
                      seen={!!seen[c.id]}
                      fav={!!favorites[c.id]}
                      onToggleSeen={() => toggleSeen(c.id)}
                      onToggleFav={() => toggleFav(c.id)}
                      theme={theme}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const PokedexCard = ({ character, seriesAccent = "#fbbf24", seen, fav, onToggleSeen, onToggleFav, theme }) => {
  const [imgError, setImgError] = useState(false);
  const initials = character.name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div style={{
      position: "relative",
      background: theme.darkMode
        ? "linear-gradient(160deg, rgba(30,20,60,0.8) 0%, rgba(15,10,35,0.95) 100%)"
        : "linear-gradient(160deg, #fff 0%, #f8fafc 100%)",
      border: `2px solid ${seen ? seriesAccent : theme.borderCol}`,
      borderRadius: 14, padding: 10,
      transition: "all 0.25s",
      boxShadow: seen ? `0 0 18px ${seriesAccent}55` : "none",
      opacity: seen ? 1 : 0.65,
      cursor: "pointer",
    }} onClick={onToggleSeen}>
      {/* Fav button */}
      <button onClick={(e) => { e.stopPropagation(); onToggleFav(); }} style={{
        position: "absolute", top: 6, right: 6, width: 26, height: 26,
        border: "none", borderRadius: 8,
        background: fav ? "#ef4444" : "rgba(0,0,0,0.4)",
        color: "white", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
      }}>
        <Heart size={13} fill={fav ? "white" : "none"}/>
      </button>

      {/* Imagen del personaje (o fallback) */}
      <div style={{
        width: "100%", aspectRatio: "1/1", borderRadius: 10,
        background: theme.darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 10, position: "relative", overflow: "hidden",
        filter: seen ? "none" : "grayscale(80%) brightness(0.6)",
      }}>
        {character.image && !imgError ? (
          <img
            src={character.image}
            alt={character.name}
            onError={() => setImgError(true)}
            style={{
              width: "100%", height: "100%", objectFit: "contain",
              padding: 4,
            }}
          />
        ) : (
          <span style={{
            fontSize: 32, fontWeight: 900, color: seriesAccent,
            textShadow: "0 4px 12px rgba(0,0,0,0.3)",
            fontFamily: "'Impact', sans-serif", letterSpacing: "-0.03em",
          }}>{seen ? initials : "?"}</span>
        )}

        {/* Marca de visto */}
        {seen && (
          <div style={{
            position: "absolute", bottom: 6, right: 6,
            width: 22, height: 22, borderRadius: "50%",
            background: "#10b981", color: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 4px 8px rgba(16,185,129,0.4)",
          }}>
            <Check size={12} strokeWidth={3}/>
          </div>
        )}
      </div>

      <div style={{
        fontSize: 12, fontWeight: 700, color: theme.textMain, textAlign: "center",
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>{character.name}</div>
    </div>
  );
};

const selectStyle = (theme) => ({
  padding: "8px 12px", borderRadius: 10,
  background: theme.cardBg, border: `1px solid ${theme.borderCol}`,
  color: theme.textMain, fontSize: 13, fontWeight: 600, cursor: "pointer",
  fontFamily: "inherit",
});

// =======================================================================
// PESTAÑA 4 — FANDOM
// =======================================================================
function FandomTab({ config, search, theme }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFandom = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // RSS de actividad reciente (nuevos posts/páginas) de la wiki de Superthings
      const rssUrl = `https://${config.fandomWiki}.fandom.com/wiki/Special:RecentChanges?feed=rss`;
      const { text: xml } = await fetchWithFallback(rssUrl);
      const parsed = parseRSS(xml);
      parsed.sort((a, b) => new Date(b.date) - new Date(a.date));
      setItems(parsed);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [config.fandomWiki]);

  useEffect(() => { fetchFandom(); }, [fetchFandom]);

  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(i => (i.title + " " + i.description).toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div>
      <SectionHeader
        title="Feed de Fandom"
        subtitle={`Actividad reciente de ${config.fandomWiki}.fandom.com`}
        onRefresh={fetchFandom} loading={loading} theme={theme}
      />

      {error && <InfoBanner theme={theme} color="#ef4444">{error}</InfoBanner>}

      {loading && items.length === 0 && <LoadingGrid theme={theme}/>}

      {!loading && filtered.length === 0 && !error && (
        <EmptyState icon={MessagesSquare} title="Sin actividad reciente" description="El feed está vacío o no se ha podido cargar." theme={theme}/>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {filtered.map((item, idx) => (
          <article key={item.id + idx} style={{
            background: theme.cardBg, border: `1px solid ${theme.borderCol}`,
            borderRadius: 14, padding: 16,
            display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 14, alignItems: "center",
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10,
              background: "linear-gradient(135deg, #fa005a, #ff4d6d)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <MessagesSquare size={20} color="white"/>
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{
                margin: 0, fontSize: 15, fontWeight: 700, color: theme.textMain,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{item.title}</h3>
              <div style={{ marginTop: 4, fontSize: 12, color: theme.textMuted, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                {item.author && <span>Por {item.author}</span>}
                <span>•</span>
                <span>{timeAgo(item.date)}</span>
              </div>
            </div>
            <a href={item.link} target="_blank" rel="noreferrer" style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
              background: "rgba(250,0,90,0.15)", color: "#fa005a",
              border: "1px solid rgba(250,0,90,0.3)",
              borderRadius: 10, textDecoration: "none", fontSize: 13, fontWeight: 600,
            }}>
              Ver <ExternalLink size={12}/>
            </a>
          </article>
        ))}
      </div>
    </div>
  );
}

// =======================================================================
// PESTAÑA 5 — NOTICIAS DE PELÍCULA (Google News RSS)
// =======================================================================
function NewsTab({ config, search, theme }) {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all"); // all | noticias | rumores | estrenos | trailers

  const fetchNews = useCallback(async () => {
    if (!config.newsQuery) return;
    setLoading(true);
    setError(null);
    try {
      // Google News RSS oficial - gratuito y estable
      const q = encodeURIComponent(config.newsQuery);
      const rssUrl = `https://news.google.com/rss/search?q=${q}&hl=es&gl=ES&ceid=ES:es`;
      const { text: xml } = await fetchWithFallback(rssUrl);
      const parsed = parseRSS(xml);
      parsed.sort((a, b) => new Date(b.date) - new Date(a.date));
      setNews(parsed);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [config.newsQuery]);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  // Auto-categorización por palabras clave
  const categorize = (item) => {
    const txt = (item.title + " " + item.description).toLowerCase();
    if (txt.includes("tráiler") || txt.includes("trailer") || txt.includes("teaser")) return "trailers";
    if (txt.includes("rumor") || txt.includes("filtra") || txt.includes("leak")) return "rumores";
    if (txt.includes("estreno") || txt.includes("release") || txt.includes("premiere")) return "estrenos";
    return "noticias";
  };

  const filtered = useMemo(() => {
    let arr = news;
    if (filter !== "all") arr = arr.filter(n => categorize(n) === filter);
    if (search) {
      const q = search.toLowerCase();
      arr = arr.filter(n => (n.title + " " + n.description).toLowerCase().includes(q));
    }
    return arr;
  }, [news, filter, search]);

  const categories = [
    { id: "all", label: "Todo", icon: Grid3x3, color: "#22d3ee" },
    { id: "noticias", label: "Noticias", icon: Newspaper, color: "#60a5fa" },
    { id: "rumores", label: "Rumores", icon: AlertCircle, color: "#fbbf24" },
    { id: "estrenos", label: "Estrenos", icon: Star, color: "#10b981" },
    { id: "trailers", label: "Tráilers", icon: Play, color: "#ef4444" },
  ];

  return (
    <div>
      <SectionHeader
        title="Noticias de la película"
        subtitle={`Búsqueda: "${config.newsQuery}"`}
        onRefresh={fetchNews} loading={loading} theme={theme}
      />

      {error && <InfoBanner theme={theme} color="#ef4444">{error}</InfoBanner>}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {categories.map(c => {
          const Icon = c.icon;
          const active = filter === c.id;
          const count = c.id === "all" ? news.length : news.filter(n => categorize(n) === c.id).length;
          return (
            <button key={c.id} onClick={() => setFilter(c.id)} style={{
              display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10,
              background: active ? c.color : theme.cardBg,
              color: active ? "white" : theme.textMain,
              border: `1px solid ${active ? c.color : theme.borderCol}`,
              cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            }}>
              <Icon size={14}/> {c.label} <span style={{ opacity: 0.7, fontSize: 11 }}>({count})</span>
            </button>
          );
        })}
      </div>

      {loading && news.length === 0 && <LoadingGrid theme={theme}/>}

      {!loading && filtered.length === 0 && (
        <EmptyState icon={Newspaper} title="Sin noticias" description="Todavía no hemos encontrado noticias con ese filtro." theme={theme}/>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {filtered.map((item, idx) => {
          const cat = categorize(item);
          const catInfo = categories.find(c => c.id === cat);
          return (
            <article key={item.id + idx} style={{
              background: theme.cardBg, border: `1px solid ${theme.borderCol}`,
              borderRadius: 14, padding: 16,
            }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                {catInfo && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: `${catInfo.color}22`, color: catInfo.color, textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}>
                    <catInfo.icon size={10}/>{catInfo.label}
                  </span>
                )}
                <span style={{ fontSize: 12, color: theme.textMuted }}>
                  {item.author || "Google News"} · {timeAgo(item.date)}
                </span>
              </div>
              <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, lineHeight: 1.4, color: theme.textMain }}>
                {item.title}
              </h3>
              {item.description && (
                <p style={{ margin: "0 0 12px", fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>
                  {stripHtml(item.description).slice(0, 220)}…
                </p>
              )}
              <a href={item.link} target="_blank" rel="noreferrer" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontSize: 13, color: "#22d3ee", fontWeight: 600, textDecoration: "none",
              }}>
                Leer noticia original <ExternalLink size={13}/>
              </a>
            </article>
          );
        })}
      </div>
    </div>
  );
}

// =======================================================================
// LOADING GRID
// =======================================================================
const LoadingGrid = ({ theme }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} style={{
        background: theme.cardBg, border: `1px solid ${theme.borderCol}`,
        borderRadius: 14, height: 260, overflow: "hidden", position: "relative",
      }}>
        <div style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(90deg, transparent, ${theme.darkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.04)"}, transparent)`,
          animation: "shimmer 1.5s infinite",
        }}/>
      </div>
    ))}
    <style>{`
      @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
      .animate-spin { animation: spin 1s linear infinite; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `}</style>
  </div>
);

// =======================================================================
// MODAL DE AJUSTES
// =======================================================================
function SettingsModal({ config, updateConfig, onClose, theme }) {
  const [local, setLocal] = useState(config);
  const save = () => { updateConfig(local); onClose(); };

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
      backdropFilter: "blur(8px)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: theme.darkMode ? "#1a0b2e" : "#fff",
        border: `1px solid ${theme.borderCol}`, borderRadius: 18,
        padding: 24, maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: theme.textMain }}>
            Ajustes
          </h2>
          <button onClick={onClose} style={iconBtnStyle(theme.darkMode)}>
            <X size={18}/>
          </button>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          <SettingField label="Empresa de LinkedIn (slug)" hint="Ej: magic-box-int-">
            <input value={local.linkedinCompany} onChange={(e) => setLocal({ ...local, linkedinCompany: e.target.value })} style={inputStyle(theme)}/>
          </SettingField>

          <SettingField label="URL del feed RSS de LinkedIn" hint="Generado en rss.app u otro servicio">
            <input value={local.linkedinRssUrl} onChange={(e) => setLocal({ ...local, linkedinRssUrl: e.target.value })} style={inputStyle(theme)} placeholder="https://rss.app/feeds/..."/>
          </SettingField>

          <SettingField label="ID de la lista de YouTube" hint="Empieza por PL... (se ve en la URL)">
            <input value={local.youtubePlaylistId} onChange={(e) => setLocal({ ...local, youtubePlaylistId: e.target.value })} style={inputStyle(theme)}/>
          </SettingField>

          <SettingField label="Subdominio de la wiki de Fandom" hint="Ej: superthings, harrypotter">
            <input value={local.fandomWiki} onChange={(e) => setLocal({ ...local, fandomWiki: e.target.value })} style={inputStyle(theme)}/>
          </SettingField>

          <SettingField label="Búsqueda de noticias" hint="Término para buscar en Google News">
            <input value={local.newsQuery} onChange={(e) => setLocal({ ...local, newsQuery: e.target.value })} style={inputStyle(theme)}/>
          </SettingField>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 22, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "10px 18px", borderRadius: 10, border: `1px solid ${theme.borderCol}`,
            background: "transparent", color: theme.textMain, cursor: "pointer", fontWeight: 600, fontFamily: "inherit",
          }}>Cancelar</button>
          <button onClick={save} style={{
            padding: "10px 22px", borderRadius: 10, border: "none",
            background: "linear-gradient(135deg, #ff006e, #ffbe0b)",
            color: "white", cursor: "pointer", fontWeight: 700, fontFamily: "inherit",
            boxShadow: "0 6px 20px rgba(255,0,110,0.4)",
          }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

const SettingField = ({ label, hint, children }) => (
  <div>
    <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{label}</label>
    {hint && <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 6 }}>{hint}</div>}
    {children}
  </div>
);

const inputStyle = (theme) => ({
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: `1px solid ${theme.borderCol}`,
  background: theme.cardBg, color: theme.textMain, fontSize: 14,
  fontFamily: "inherit", outline: "none", boxSizing: "border-box",
});
