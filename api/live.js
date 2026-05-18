export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { videoId, transcript } = req.body;
  const YT_KEY = process.env.YOUTUBE_API_KEY;
  const ANT_KEY = process.env.ANTHROPIC_API_KEY;
  const YT_BASE = 'https://www.googleapis.com/youtube/v3';

  let messages = [];
  let msgCount = 0;
  try {
    const meta = await fetch(`${YT_BASE}/videos?part=liveStreamingDetails&id=${videoId}&key=${YT_KEY}`);
    const d = await meta.json();
    const chatId = d.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
    if (chatId) {
      const chat = await fetch(`${YT_BASE}/liveChat/messages?part=snippet&liveChatId=${chatId}&maxResults=200&key=${YT_KEY}`);
      const cd = await chat.json();
      messages = (cd.items || []).map(i => i.snippet?.displayMessage).filter(Boolean);
      msgCount = messages.length;
    }
  } catch(e) {}

  const prompt = `Sos el coach en tiempo real de un show de streaming en LATAM. Estás monitoreando el show AHORA.

MENSAJES DEL CHAT EN VIVO (últimos ${messages.length}):
${messages.slice(-100).map(m => `- ${m}`).join('\n') || '(sin mensajes de chat en vivo aún)'}

${transcript ? `LO QUE ESTÁN HABLANDO LOS HOSTS:\n${transcript}` : ''}

Generá UN tip accionable para el producer ahora mismo. El tip tiene que ser:
- Específico y urgente (para aplicar en los próximos 3 minutos)
- Basado en lo que el chat está pidiendo o respondiendo
- En máximo 3 oraciones
- Con una etiqueta al inicio: [HYPE] si el chat está muy activo, [ALERTA] si cae el engagement, [TEMA] si hay algo nuevo que la gente pide

Solo el tip, sin introducción ni formato extra.`;

  const claude = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANT_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 200, messages: [{ role: 'user', content: prompt }] })
  });
  const d = await claude.json();
  res.json({ tip: d.content?.[0]?.text || '', msgCount });
}
