// API route de Next.js que hace proxy de feeds RSS/XML
// Se ejecuta en el servidor de Vercel, donde NO hay restricciones CORS
// Uso desde el cliente: fetch('/api/rss?url=...')

export const runtime = "edge"; // más rápido y dentro del free tier de Vercel

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: "Falta el parámetro ?url=" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Lista blanca de dominios permitidos por seguridad
  // (evita que alguien use nuestra API como proxy abierto)
  const allowedHosts = [
    "rss.app",
    "youtube.com",
    "www.youtube.com",
    "news.google.com",
    "fandom.com",
  ];
  let host;
  try {
    host = new URL(targetUrl).hostname;
  } catch {
    return new Response(JSON.stringify({ error: "URL inválida" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const allowed = allowedHosts.some(h => host === h || host.endsWith("." + h));
  if (!allowed) {
    return new Response(JSON.stringify({ error: `Dominio no permitido: ${host}` }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const res = await fetch(targetUrl, {
      headers: {
        // Algunos servicios requieren un User-Agent válido
        "User-Agent": "Mozilla/5.0 (compatible; SuperthingsHub/1.0; +https://vercel.com)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      // Cache 5 minutos en el servidor para no agotar rate limits
      next: { revalidate: 300 },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Upstream error ${res.status}` }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const text = await res.text();
    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
