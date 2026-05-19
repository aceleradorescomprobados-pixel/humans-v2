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

    // Get live chat ID
    const videoRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails,snippet&id=${videoId}&key=${YT_KEY}`);
    const videoData = await videoRes.json();
    const video = videoData.items?.[0];
    if (!video) throw new Error('Video no encontrado');

    const chatId = video.liveStreamingDetails?.activeLiveChatId;
    if (!chatId) throw new Error('No hay chat en vivo activo para este video');

    // Get recent chat messages
    const chatRes = await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${chatId}&part=snippet,authorDetails&maxResults=200&key=${YT_KEY}`);
    const chatData = await chatRes.json();
    const messages = chatData.items?.map(m => m.snippet.displayMessage).filter(Boolean) || [];

    if (messages.length === 0) throw new Error('No hay mensajes en el chat aún');

    // Analyze with Claude
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANT_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: `Sos un coach experto en entretenimiento en vivo. Analizás el chat de YouTube en tiempo real y dás recomendaciones cortas y accionables al conductor y al productor del show. 
        
        Tus tips para el conductor deben ser breves (máx 15 palabras), en segunda persona informal, amigables, no directivos.
        Tus tips para el productor pueden tener más contexto (máx 30 palabras) e incluir datos si los hay.
        
        Respondé SIEMPRE en JSON con este formato exacto:
        {
          "conductor": "tip corto para el conductor",
          "productor": "tip con contexto para el productor",
          "temas": ["tema1", "tema2", "tema3"],
          "intensidad": "alta|media|baja"
        }`,
        messages: [{
          role: 'user',
          content: `Analizá estos ${messages.length} mensajes del chat en vivo:\n\n${messages.slice(-100).join('\n')}\n\nNotas del productor: ${notes || 'ninguna'}\n\nDá una recomendación accionable ahora mismo.`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const text = claudeData.content?.[0]?.text || '{}';
    
    let result;
    try {
      result = JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      result = match ? JSON.parse(match[0]) : { conductor: text, productor: text, temas: [], intensidad: 'media' };
    }

    res.status(200).json({ 
      ...result, 
      mensajesAnalizados: messages.length,
      showTitle: video.snippet?.title || 'Show en vivo'
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
