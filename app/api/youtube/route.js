// API route para llamar a YouTube Data API v3 desde el servidor
// La API key queda protegida en variables de entorno de Vercel

export const runtime = "edge";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const playlistId = searchParams.get("playlistId");

  if (!playlistId) {
    return json({ error: "Falta el parámetro ?playlistId=" }, 400);
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return json({ error: "YOUTUBE_API_KEY no está configurada en el servidor" }, 500);
  }

  try {
    // 1) Obtener todos los items de la playlist con paginación automática
    const items = [];
    let pageToken = "";
    let safety = 10;

    while (safety-- > 0) {
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${playlistId}&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const res = await fetch(url, { next: { revalidate: 600 } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return json({ error: err?.error?.message || `YouTube API error ${res.status}` }, res.status);
      }
      const data = await res.json();
      items.push(...(data.items || []));
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }

    // 2) Obtener detalles (duración, vistas) en lotes de 50
    const videoIds = items.map(i => i.contentDetails?.videoId).filter(Boolean);
    const details = {};

    for (let i = 0; i < videoIds.length; i += 50) {
      const batch = videoIds.slice(i, i + 50).join(",");
      const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics&id=${batch}&key=${apiKey}`;
      const res = await fetch(url, { next: { revalidate: 600 } });
      if (!res.ok) continue;
      const data = await res.json();
      (data.items || []).forEach(v => {
        details[v.id] = {
          duration: v.contentDetails?.duration,
          views: v.statistics?.viewCount,
          likes: v.statistics?.likeCount,
        };
      });
    }

    // 3) Combinar en formato limpio
    const videos = items
      .map(item => {
        const videoId = item.contentDetails?.videoId;
        const s = item.snippet || {};
        const det = details[videoId] || {};
        const t = s.thumbnails || {};
        return {
          id: videoId,
          videoId,
          title: s.title || "",
          description: s.description || "",
          date: item.contentDetails?.videoPublishedAt || s.publishedAt,
          thumbnail: t.maxres?.url || t.standard?.url || t.high?.url || t.medium?.url || t.default?.url,
          link: `https://www.youtube.com/watch?v=${videoId}`,
          author: s.videoOwnerChannelTitle || s.channelTitle || "",
          duration: det.duration,
          views: det.views,
          likes: det.likes,
          position: s.position,
        };
      })
      .filter(v => v.videoId && v.title !== "Private video" && v.title !== "Deleted video");

    return new Response(JSON.stringify({ videos, count: videos.length }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=600, s-maxage=600",
      },
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
