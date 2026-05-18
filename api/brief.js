export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { urls, context } = req.body;
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
        comment
