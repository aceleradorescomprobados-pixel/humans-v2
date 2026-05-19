export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { videoUrl, notes } = req.body;
  const YT_KEY = process.env.YOUTUBE_API_KEY;
  const ANT_KEY = process.env.ANTHROPIC_API_KEY;

  function extractVideoId(url) {
    try {
      const u = new URL(url);
      return u.searchParams.get('v') || u.pathname.split('/').pop().split('?')[0];
    } catch { return url.split('/').pop().split('?')[0]; }
  }

  try {
    const videoId = extractVideoId(videoUrl);

    const videoRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet,statistics&id=${videoId}&key=${YT_KEY}`);
    const videoData = await videoRes.json();
    const video = videoData.items?.[0];
    if (!video) throw new Error('Video no encontrado');

    const chatId = video.liveStreamingDetails?.activeLiveChatId;
    let messages = [];

    if (chatId) {
      const chatRes = await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${chatId}&part=snippet&maxResults=2000&key=${YT_KEY}`);
      const chatData = await chatRes.json();
      messages = chatData.items?.map(m => m.snippet.displayMessage).filter(Boolean) || [];
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANT_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        system: `Sos un coach experto en entretenimiento en vivo. Generás reportes post-show detallados y accionables para productores de contenido. El reporte debe ser en español, claro, con insights reales y recomendaciones para el próximo episodio.`,
        messages: [{
          role: 'user',
          content: `Generá un reporte post-show completo para: ${video.snippet?.title}
          
Mensajes del chat (${messages.length} total): ${messages.slice(0, 500).join(' | ')}
          
Notas del productor: ${notes || 'ninguna'}
Vistas: ${video.statistics?.viewCount || 'N/A'}
Likes: ${video.statistics?.likeCount || 'N/A'}

El reporte debe incluir:
1. RESUMEN EJECUTIVO (2-3 líneas)
2. TEMAS MÁS COMENTADOS (top 5 con análisis)
3. MOMENTOS DE MAYOR ENGAGEMENT
4. LO QUE FUNCIONÓ
5. OPORTUNIDADES DE MEJORA
6. RECOMENDACIONES PARA EL PRÓXIMO EPISODIO`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const report = claudeData.content?.[0]?.text || 'No se pudo generar el reporte';

    res.status(200).json({ 
      report, 
      showTitle: video.snippet?.title,
      stats: { views: video.statistics?.viewCount, likes: video.statistics?.likeCount, messages: messages.length }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
