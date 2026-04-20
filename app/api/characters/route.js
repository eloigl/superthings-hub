// API route: obtiene los personajes de una serie de SuperThings desde Fandom
// Uso: /api/characters?series=Series_1

export const runtime = "edge";

// Mapa de series disponibles (slug en Fandom → nombre legible)
const SERIES_MAP = {
  "Series_1":                      "Serie 1",
  "Series_2":                      "Serie 2",
  "Series_3":                      "Serie 3",
  "Series_4":                      "Serie 4",
  "Series_5":                      "Serie 5",
  "Secret_Spies_Series":           "Secret Spies",
  "Power_Machines_Series":         "Power Machines",
  "Kazoom_Kids_Series":            "Kazoom Kids",
  "Guardians_of_Kazoom_Series":    "Guardians of Kazoom",
  "Rescue_Force_Series":           "Rescue Force",
  "Neon_Power_Series":             "Neon Power",
  "Mutant_Battle_Series":          "Mutant Battle",
  "Kazoom_Power_Battle_Series":    "Kazoom Power Battle",
  "Kazoom_Power_Mission_Series":   "Kazoom Power Mission",
  "Kazoom_Power_Warriors_Series":  "Kazoom Power Warriors",
  "Evolution_Series":              "Evolution",
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const seriesSlug = searchParams.get("series");

  // Si no piden serie concreta → devolver la lista de series disponibles
  if (!seriesSlug) {
    return json({
      series: Object.entries(SERIES_MAP).map(([slug, name]) => ({ slug, name })),
    });
  }

  if (!SERIES_MAP[seriesSlug]) {
    return json({ error: `Serie desconocida: ${seriesSlug}` }, 400);
  }

  try {
    const characters = await scrapeSeriesPage(seriesSlug);
    return new Response(JSON.stringify({
      series: seriesSlug,
      seriesName: SERIES_MAP[seriesSlug],
      count: characters.length,
      characters,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Cache 24h en el servidor (no se piden datos a Fandom todo el rato)
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

async function scrapeSeriesPage(seriesSlug) {
  const url = `https://superthings.fandom.com/wiki/${seriesSlug}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SuperthingsHub/1.0)",
      "Accept": "text/html,application/xhtml+xml",
    },
    next: { revalidate: 86400 },
  });

  if (!res.ok) throw new Error(`Fandom devolvió ${res.status}`);
  const html = await res.text();

  return extractCharactersFromHtml(html, seriesSlug);
}

// Extrae personajes del HTML de Fandom. Fandom usa varias estructuras según la serie:
// - <gallery> con imágenes y captions
// - Tablas wiki con enlaces a personajes
// - Listas de enlaces con imágenes
function extractCharactersFromHtml(html, seriesSlug) {
  const characters = new Map(); // usamos Map para deduplicar por nombre

  // Patrón 1: imágenes dentro de galerías <gallerybox> o figuras con <img data-src>
  // Fandom suele meter la URL real en data-src (lazy loading)
  const imgPattern = /<a\s+[^>]*href="\/wiki\/([^"#?]+)"[^>]*>\s*<img\s+[^>]*(?:data-src|src)="([^"]+)"[^>]*(?:alt="([^"]*)"|title="([^"]*)")[^>]*>/gi;
  let m;
  while ((m = imgPattern.exec(html)) !== null) {
    const slug = decodeURIComponent(m[1]);
    const imgUrl = m[2];
    const alt = (m[3] || m[4] || "").trim();

    // Filtros: excluimos imágenes que no son personajes
    if (slug.startsWith("Category:") || slug.startsWith("File:") ||
        slug.startsWith("Special:") || slug.startsWith("User:") ||
        slug === seriesSlug) continue;
    // Excluimos URLs de imagen que no sean de personajes
    if (imgUrl.includes("Site-logo") || imgUrl.includes("Wordmark") ||
        imgUrl.includes("favicon")) continue;

    const name = cleanName(alt || slug);
    if (!name || name.length < 2 || name.length > 80) continue;
    // Filtros de texto: descartar "Series", "Logo", etc.
    if (/^(Series|Logo|Checklist|Gallery|Image|File|Icon)/i.test(name)) continue;

    // Limpiar URL de imagen (quitar redimensiones para obtener la original)
    const cleanImg = cleanImageUrl(imgUrl);

    if (!characters.has(name)) {
      characters.set(name, {
        name,
        slug,
        image: cleanImg,
        link: `https://superthings.fandom.com/wiki/${slug}`,
      });
    }
  }

  // Convertir Map a array
  const arr = Array.from(characters.values());

  // Ordenar: primero los que tienen nombre más corto/simple (suelen ser personajes principales)
  return arr;
}

function cleanName(raw) {
  if (!raw) return "";
  return raw
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\.(png|jpg|jpeg|gif|webp)$/i, "")
    .trim();
}

function cleanImageUrl(raw) {
  if (!raw) return "";
  // Fandom usa URLs tipo https://static.wikia.nocookie.net/.../scale-to-width-down/100?cb=...
  // Quitamos la parte de redimensión para obtener la imagen original
  return raw.split("/revision/")[0];
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

