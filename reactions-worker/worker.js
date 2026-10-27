// Counts emoji reactions on goodthanks.org blog posts. Counts live in Cloudflare KV,
// one JSON object per post, e.g. "post:/blog/2026/10/hello-world/" -> {"like": 3, "funny": 1}

// Keep in sync with `reactions` in the site's _config.yml
const REACTIONS = ['like', 'love', 'funny', 'cool', 'dumb', 'sad'];
const ORIGINS = ['https://goodthanks.org', 'http://localhost:4000', 'http://127.0.0.1:4000'];

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
      'Vary': 'Origin',
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

    if (request.method === 'OPTIONS') return new Response(null, { headers });

    const post = new URL(request.url).searchParams.get('post') || '';
    if (!/^\/blog\/[a-z0-9\/_-]{1,150}$/i.test(post)) return reply({ error: 'bad post' }, 400);

    const key = 'post:' + post;
    const counts = (await env.REACTIONS.get(key, 'json')) || {};

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!REACTIONS.includes(body.reaction) || (body.delta !== 1 && body.delta !== -1)) {
        return reply({ error: 'bad reaction' }, 400);
      }
      counts[body.reaction] = Math.max(0, (counts[body.reaction] || 0) + body.delta);
      await env.REACTIONS.put(key, JSON.stringify(counts));
    } else if (request.method !== 'GET') {
      return reply({ error: 'method not allowed' }, 405);
    }

    return reply(counts);
  },
};
