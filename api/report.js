export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { urls, notes } = req.body;
  const YT_KEY = process.env.YOUTUBE_API_KEY;
  const ANT_KEY = process.env.ANTHROPIC_API_KEY;
  const YT_BASE = 'https://www.googleapis.com/youtube/v3';

  function extractId(url) {
    try { return new URL(url).searchParams.get('v') || url.split('/').pop().split('?')[0]; }
    catch { return null; }
  }

  const episodes = [];
  for (const url of urls) {
    const id = extractId(url);
    if (!id) continue;
    try {
      const metaRes = await fetch(`${YT_BASE}/videos?part=snippet,statistics&id=${id}&key=${YT_KEY}`);
      const meta = await metaRes.json();
      if (!meta.items?.length) continue;
      const v = meta.items[0];
      const commRes = await fetch(`${YT_BASE}/commentThreads?part=snippet&videoId=${id}&maxResults=100&order=relevance&key=${YT_KEY}`);
      const comm = await commRes.json();
      const comments = (comm.items || []).map(i => {
        const s = i.snippet.topLevelComment.snippet;
        return { text: s.textDisplay, likes: s.likeCount };
      });
      episodes.push({
        title: v.snippet.title,
        date: v.snippet.publishedAt?.slice(0,10),
        views: v.statistics.viewCount,
        likes: v.statistics.likeCount,
        commentCount: v.statistics.commentCount,
        comments
      });
    } catch(e) {}
  }

  if (!episodes.length) return res.status(400).json({ error: 'No se pudo obtener data.' });

  const epContext = episodes.map(ep => {
    const top = ep.comments.sort((a,b) => b.likes - a.likes).slice(0,60)
      .map(c => `- [${c.likes} likes] ${c.text}`).join('\n');
    return `=== ${ep.title} ===\nFecha: ${ep.date} | Views: ${ep.views} | Likes: ${ep.likes} | Comentarios: ${ep.commentCount}\n\nCOMENTARIOS:\n${top}`;
  }).join('\n\n---\n\n');

  const prompt = `Sos el coach de performance de un show de streaming en LATAM. El show acaba de terminar.

${epContext}

${notes ? `NOTAS DEL PRODUCER:\n${notes}` : ''}

Generá un POST-SHOW REPORT completo. Incluí:

1. QUÉ FUNCIONÓ — momentos y temas que generaron más respuesta (con evidencia de comentarios)
2. QUÉ NO FUNCIONÓ — qué cayó el engagement, qué ignoró la audiencia
3. MOMENTOS VIRALES — fragmentos con potencial de clip
4. LO QUE LA AUDIENCIA PIDE PARA EL PRÓXIMO — temas repetidos, preguntas sin responder
5. 3 CAMBIOS CONCRETOS para el próximo episodio
6. FRASE RESUMEN DEL EPISODIO — una línea que capture qué fue este show

Este reporte alimenta el próximo Pre-Show Brief. Sé específico y accionable.`;

  const claude = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANT_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
  });
  const d = await claude.json();
  res.json({ report: d.content?.[0]?.text || '' });
}
