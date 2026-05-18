export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { videoId, transcript, previousMsgCount } = req.body;
  const YT_KEY = process.env.YOUTUBE_API_KEY;
  const ANT_KEY = process.env.ANTHROPIC_API_KEY;
  const YT_BASE = 'https://www.googleapis.com/youtube/v3';

  let messages = [];
  let msgCount = 0;
  let viewerCount = 0;

  try {
    const metaRes = await fetch(`${YT_BASE}/videos?part=liveStreamingDetails,statistics&id=${videoId}&key=${YT_KEY}`);
    const metaData = await metaRes.json();
    const item = metaData.items?.[0];
    const chatId = item?.liveStreamingDetails?.activeLiveChatId;
    viewerCount = parseInt(item?.liveStreamingDetails?.concurrentViewers || 0);
    if (chatId) {
      const chatRes = await fetch(`${YT_BASE}/liveChat/messages?part=snippet&liveChatId=${chatId}&maxResults=200&key=${YT_KEY}`);
      const chatData = await chatRes.json();
      messages = (chatData.items || []).map(i => i.snippet?.displayMessage).filter(Boolean);
      msgCount = messages.length;
    }
  } catch(e) {}

  const newMsgs = Math.max(0, msgCount - (previousMsgCount || 0));
  const msgsPerMin = newMsgs * 2;

  const prompt = `Sos el coach en tiempo real de un show de streaming en LATAM. Ciclo cada 30 segundos.

METRICAS:
- Viewers: ${viewerCount}
- Msgs chat total: ${msgCount}
- Msgs nuevos este ciclo: ${newMsgs}
- Tasa: ~${msgsPerMin} msgs/min

CHAT (ultimos 100):
${messages.slice(-100).map(m => `- ${m}`).join('\n') || '(sin mensajes)'}

${transcript ? `HOSTS HABLANDO DE:\n${transcript}` : ''}

Responde SOLO JSON sin texto extra:
{"tag":"HYPE|ALERTA|TEMA","tip":"maximo 2 oraciones accionables para ahora","temas_sugeridos":["tema1","tema2","tema3"],"razon_hype":"que esta generando engagement ahora"}`;

  try {
    const claude = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANT_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
    });
    const d = await claude.json();
    const text = d.content?.[0]?.text || '{}';
    let parsed;
    try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); }
    catch(e) { parsed = { tag: 'TEMA', tip: text, temas_sugeridos: [], razon_hype: '' }; }
    res.json({ ...parsed, msgCount, viewerCount, msgsPerMin });
  } catch(e) {
    res.json({ tag: 'ALERTA', tip: 'Error de conexion.', temas_sugeridos: [], razon_hype: '', msgCount, viewerCount, msgsPerMin: 0 });
  }
}
