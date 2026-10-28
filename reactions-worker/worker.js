// Counts emoji reactions on goodthanks.org blog posts. Each post gets its own Durable Object
// holding one row per (browser, reaction), so a browser can only toggle its own reactions
// and every request sees the latest state.
import { DurableObject } from 'cloudflare:workers';

// Keep in sync with `reactions` in the site's _config.yml
const REACTIONS = ['like', 'love', 'funny', 'cool', 'dumb', 'sad'];
const ORIGINS = ['https://goodthanks.org', 'http://localhost:4000', 'http://127.0.0.1:4000'];
// Most reactions of one kind on one post from a single internet connection, so clearing
// browser data can't farm extra reactions but a shared household connection still works
const MAX_PER_NETWORK = 3;

export class PostReactions extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS reactions (
      client TEXT NOT NULL,
      reaction TEXT NOT NULL,
      network TEXT NOT NULL,
      PRIMARY KEY (client, reaction)
    )`);
  }

  counts() {
    const counts = {};
    for (const row of this.sql.exec('SELECT reaction, COUNT(*) AS n FROM reactions GROUP BY reaction')) {
      counts[row.reaction] = row.n;
    }
    return counts;
  }

  state(client) {
    const counts = this.counts();
    const mine = this.sql.exec('SELECT reaction FROM reactions WHERE client = ?', client)
      .toArray().map((row) => row.reaction);
    return { counts, mine };
  }

  reset() {
    this.sql.exec('DELETE FROM reactions');
    return this.state('');
  }

  toggle(client, network, reaction) {
    const had = this.sql.exec('SELECT 1 FROM reactions WHERE client = ? AND reaction = ?', client, reaction).toArray().length > 0;
    if (had) {
      this.sql.exec('DELETE FROM reactions WHERE client = ? AND reaction = ?', client, reaction);
    } else {
      const { n } = this.sql.exec('SELECT COUNT(*) AS n FROM reactions WHERE network = ? AND reaction = ?', network, reaction).one();
      if (n < MAX_PER_NETWORK) {
        this.sql.exec('INSERT INTO reactions (client, reaction, network) VALUES (?, ?, ?)', client, reaction, network);
      }
    }
    return this.state(client);
  }
}

// IPv6 users usually get a whole /64 block, so treat the block as one connection
function networkOf(ip) {
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const groups = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return groups.slice(0, 4).join(':');
}

// Only a salted hash of the connection is stored, never the address itself
async function hashNetwork(ip, salt) {
  const data = new TextEncoder().encode(salt + networkOf(ip));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

    if (request.method === 'OPTIONS') return new Response(null, { headers });

    const params = new URL(request.url).searchParams;
    const validPost = (p) => /^\/blog\/[a-z0-9\/_-]{1,150}$/i.test(p);

    // Counts for many posts at once, for the blog list: ?posts=/blog/a/,/blog/b/
    if (request.method === 'GET' && params.has('posts')) {
      const posts = params.get('posts').split(',').slice(0, 50);
      if (!posts.every(validPost)) return reply({ error: 'bad post' }, 400);
      const all = await Promise.all(posts.map((p) => env.POSTS.get(env.POSTS.idFromName(p)).counts()));
      return reply(Object.fromEntries(posts.map((p, i) => [p, all[i]])));
    }

    const post = params.get('post') || '';
    if (!validPost(post)) return reply({ error: 'bad post' }, 400);

    // Wipe a post's reactions: POST ?post=...&reset with "Authorization: Bearer <ADMIN_TOKEN>"
    if (request.method === 'POST' && params.has('reset')) {
      if (!env.ADMIN_TOKEN || request.headers.get('Authorization') !== 'Bearer ' + env.ADMIN_TOKEN) {
        return reply({ error: 'not allowed' }, 403);
      }
      return reply(await env.POSTS.get(env.POSTS.idFromName(post)).reset());
    }

    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const client = request.method === 'POST' ? body.client : params.get('client');
    if (!/^[0-9a-f-]{36}$/.test(client || '')) return reply({ error: 'bad client' }, 400);

    const stub = env.POSTS.get(env.POSTS.idFromName(post));

    if (request.method === 'GET') return reply(await stub.state(client));
    if (request.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

    if (!REACTIONS.includes(body.reaction)) return reply({ error: 'bad reaction' }, 400);
    const network = await hashNetwork(request.headers.get('CF-Connecting-IP') || '', env.IP_SALT || '');
    return reply(await stub.toggle(client, network, body.reaction));
  },
};
