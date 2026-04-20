// API route: obtiene los personajes de una serie de SuperThings
// Usa la API oficial de MediaWiki (Fandom la expone gratuitamente)
// Uso: /api/characters?series=Series_1

export const runtime = "edge";

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

// Categoría en Fandom para cada serie
const CATEGORY_MAP = {
  "Series_1":                      "Series 1",
  "Series_2":                      "Series 2",
  "Series_3":                      "Series 3",
  "Series_4":                      "Series 4",
  "Series_5":                      "Series 5",
  "Secret_Spies_Series":           "Secret Spies Series",
  "Power_Machines_Series":         "Power Machines Series",
  "Kazoom_Kids_Series":            "Kazoom Kids Series",
  "Guardians_of_Kazoom_Series":    "Guardians of Kazoom Series",
  "Rescue_Force_Series":           "Rescue Force Series",
  "Neon_Power_Series":             "Neon Power Series",
  "Mutant_Battle_Series":          "Mutant Battle Series",
  "Kazoom_Power_Battle_Series":    "Kazoom Power Battle Series",
  "Kazoom_Power_Mission_Series":   "Kazoom Power Mission Series",
  "Kazoom_Power_Warriors_Series":  "Kazoom Power Warriors Series",
  "Evolution_Series":              "Evolution Series",
};

const WIKI_API = "https://superthings.fandom.com/api.php";
const HEADERS = {
  "User-Agent": "SuperthingsHub/1.0 (https://github.com/eloigl/superthings-hub; educational)",
  "Accept": "application/json",
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const seriesSlug = searchParams.get("series");

  if (!seriesSlug) {
    return json({
      series: Object.entries(SERIES_MAP).map(([slug, name]) => ({ slug, name })),
    });
  }

  if (!SERIES_MAP[seriesSlug]) {
    return json({ error: `Serie desconocida: ${seriesSlug}` }, 400);
  }

  try {
    const characters = await fetchCharactersFromCategory(seriesSlug);
    return new Response(JSON.stringify({
      series: seriesSlug,
      seriesName: SERIES_MAP[seriesSlug],
      count: characters.length,
      characters,
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// Paso 1: obtener lista de páginas en la categoría
async function fetchCharactersFromCategory(seriesSlug) {
  const category = CATEGORY_MAP[seriesSlug];
  const pages = await fetchCategoryMembers(category);

  if (pages.length === 0) return [];

  // Paso 2: obtener imágenes de cada página en lotes de 20
  const characters = [];
  const BATCH = 20;
  for (let i = 0; i < pages.length; i += BATCH) {
    const batch = pages.slice(i, i + BATCH);
    const withImages = await fetchPageImages(batch);
    characters.push(...withImages);
  }

  return characters;
}

// Obtiene todos los miembros de una categoría usando la MediaWiki API
async function fetchCategoryMembers(category) {
  const pages = [];
  let cmcontinue = "";
  let safety = 5; // máximo 5 páginas de resultados (500 artículos)

  while (safety-- > 0) {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${category}`,
      cmtype: "page",
      cmlimit: "100",
      format: "json",
      origin: "*",
      ...(cmcontinue ? { cmcontinue } : {}),
    });

    const res = await fetch(`${WIKI_API}?${params}`, { headers: HEADERS, next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`MediaWiki API error ${res.status}`);
    const data = await res.json();

    const members = data?.query?.categorymembers || [];
    pages.push(...members.map(m => ({ id: m.pageid, title: m.title })));

    if (!data.continue?.cmcontinue) break;
    cmcontinue = data.continue.cmcontinue;
  }

  // Filtrar páginas que no son personajes (galerías, subcategorías, listas)
  return pages.filter(p => !p.title.includes("/Gallery") && !p.title.includes("Category:"));
}

// Obtiene la imagen principal de cada página en lotes
async function fetchPageImages(pages) {
  if (pages.length === 0) return [];

  const titles = pages.map(p => p.title).join("|");
  const params = new URLSearchParams({
    action: "query",
    titles,
    prop: "pageimages|info",
    piprop: "thumbnail|original",
    pithumbsize: "200",
    inprop: "url",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${WIKI_API}?${params}`, { headers: HEADERS, next: { revalidate: 86400 } });
  if (!res.ok) return pages.map(p => ({ name: p.title, image: null, link: `https://superthings.fandom.com/wiki/${encodeURIComponent(p.title)}`, slug: p.title }));

  const data = await res.json();
  const pagesData = data?.query?.pages || {};

  return Object.values(pagesData).map(page => ({
    name: page.title,
    slug: page.title.replace(/ /g, "_"),
    image: page.thumbnail?.source || page.original?.source || null,
    link: page.fullurl || `https://superthings.fandom.com/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
  })).filter(p => p.name && !p.name.includes("/Gallery"));
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
