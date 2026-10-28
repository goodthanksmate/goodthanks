// Backend for goodthanks.org: emoji reactions on blog posts and the guestbook.
// Each post gets its own Durable Object holding one row per browser, so a browser can only
// change its own reaction and every request sees the latest state. The guestbook lives in
// one site-wide Durable Object.
import { DurableObject } from 'cloudflare:workers';

// Keep in sync with `reactions` in the site's _config.yml
const REACTIONS = ['like', 'dislike', 'love', 'applaud', 'laugh', 'sad'];
const ORIGIN = 'https://goodthanks.org';
// Any port on this computer, for previewing the site locally
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;
// Each browser gets one reaction per post. This caps how many browsers on a single internet
// connection can react to one post, so clearing browser data can't farm extra reactions
// but a shared household connection still works
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
    const who = this.sql.exec('SELECT client, reaction FROM reactions ORDER BY rowid').toArray();
    return { counts, mine, who };
  }

  reset() {
    this.sql.exec('DELETE FROM reactions');
    return this.state('');
  }

  // Clicking your current reaction removes it; clicking a different one switches to it
  toggle(client, network, reaction) {
    const current = this.sql.exec('SELECT reaction FROM reactions WHERE client = ?', client).toArray();
    this.sql.exec('DELETE FROM reactions WHERE client = ?', client);
    if (current.some((row) => row.reaction === reaction)) return this.state(client);

    const { n } = this.sql.exec('SELECT COUNT(*) AS n FROM reactions WHERE network = ?', network).one();
    if (current.length > 0 || n < MAX_PER_NETWORK) {
      this.sql.exec('INSERT INTO reactions (client, reaction, network) VALUES (?, ?, ?)', client, reaction, network);
    }
    return this.state(client);
  }
}

// Guestbook icons. Keep in sync with `guestbook_emojis` in the site's _config.yml
const GUESTBOOK_EMOJIS = ['👤', '🌸', '🐶', '🎸', '🦋', '⚽', '🐱', '🌴', '🚀', '🐢', '♟️', '🦆', '🎹', '❄️', '🐴', '🌻', '🛹', '🐠', '🏀', '🐸'];
// Per internet connection per day, so clearing browser data can't flood the guestbook
const MAX_SIGNATURES_PER_NETWORK = 3;

const today = () => new Date().toISOString().slice(0, 10);

// One Durable Object for the whole site's guestbook. Guest numbers are each signature's
// position in signing order, so deleting spam doesn't leave gaps.
export class SiteBook extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('DROP TABLE IF EXISTS visitors');
    this.sql.exec(`CREATE TABLE IF NOT EXISTS guestbook (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL,
      network TEXT NOT NULL,
      created TEXT NOT NULL
    )`);
  }

  entries(client) {
    const rows = this.sql.exec(`SELECT id, client, name, emoji, created, ROW_NUMBER() OVER (ORDER BY id) AS number
      FROM guestbook ORDER BY id DESC LIMIT 500`).toArray();
    const mine = rows.find((row) => client && row.client === client);
    return {
      entries: rows.map(({ id, name, emoji, created, number }) => ({ id, name, emoji, created, number })),
      guest: mine ? mine.number : null,
    };
  }

  guestNumber(client) {
    const row = this.sql.exec(`SELECT number FROM (SELECT client, ROW_NUMBER() OVER (ORDER BY id) AS number FROM guestbook)
      WHERE client = ?`, client).toArray()[0];
    return row ? row.number : null;
  }

  // Name, icon and guest number for each of these browsers that has signed
  guests(clients) {
    const unique = [...new Set(clients)].slice(0, 500);
    if (!unique.length) return {};
    const rows = this.sql.exec(`SELECT client, name, emoji, number FROM
      (SELECT client, name, emoji, ROW_NUMBER() OVER (ORDER BY id) AS number FROM guestbook)
      WHERE client IN (${unique.map(() => '?').join(',')})`, ...unique).toArray();
    return Object.fromEntries(rows.map(({ client, ...guest }) => [client, guest]));
  }

  sign(client, network, name, emoji) {
    if (this.sql.exec('SELECT 1 FROM guestbook WHERE client = ?', client).toArray().length) {
      return { error: "You've already signed!" };
    }
    const { n } = this.sql.exec('SELECT COUNT(*) AS n FROM guestbook WHERE network = ? AND created >= ?', network, today()).one();
    if (n >= MAX_SIGNATURES_PER_NETWORK) return { error: 'Too many signatures from your connection today. Try tomorrow!' };
    this.sql.exec('INSERT INTO guestbook (client, name, emoji, network, created) VALUES (?, ?, ?, ?, ?)',
      client, name, emoji, network, new Date().toISOString());
    return this.entries(client);
  }

  remove(id) {
    this.sql.exec('DELETE FROM guestbook WHERE id = ?', id);
    return this.entries('');
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

// Swap the browser IDs in a post's reactions for the guests' names and icons, so IDs never leave the server
async function withNames(state, site) {
  const guests = await site.guests(state.who.map((w) => w.client));
  const who = state.who.filter((w) => guests[w.client]).map((w) => ({ ...guests[w.client], reaction: w.reaction }));
  return { counts: state.counts, mine: state.mine, who };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const headers = {
      'Access-Control-Allow-Origin': origin === ORIGIN || LOCAL_ORIGIN.test(origin || '') ? origin : ORIGIN,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
    };
    const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });

    if (request.method === 'OPTIONS') return new Response(null, { headers });

    const url = new URL(request.url);
    const params = url.searchParams;
    const isAdmin = () => !!env.ADMIN_TOKEN && request.headers.get('Authorization') === 'Bearer ' + env.ADMIN_TOKEN;
    const validClient = (c) => /^[0-9a-f-]{36}$/.test(c || '');
    const networkHash = () => hashNetwork(request.headers.get('CF-Connecting-IP') || '', env.IP_SALT || '');

    if (url.pathname === '/guestbook') {
      const site = env.SITE.get(env.SITE.idFromName('site'));
      const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
      const client = request.method === 'POST' ? body.client : params.get('client');

      if (request.method === 'GET' && params.has('me')) {
        return reply({ guest: validClient(client) ? await site.guestNumber(client) : null });
      }
      if (request.method === 'GET') return reply(await site.entries(validClient(client) ? client : ''));
      if (request.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

      // Delete a signature: POST /guestbook?delete=<id> with "Authorization: Bearer <ADMIN_TOKEN>"
      if (params.has('delete')) {
        if (!isAdmin()) return reply({ error: 'not allowed' }, 403);
        return reply(await site.remove(Number(params.get('delete'))));
      }

      if (!validClient(client)) return reply({ error: 'bad client' }, 400);
      const name = String(body.name || '').replace(/\s+/g, ' ').trim();
      if (!name || name.length > 24) return reply({ error: 'Names need to be 1 to 24 characters.' }, 400);
      if (/[\u0000-\u001f\u007f<>]|https?:|www\.|\.[a-z]{2,}\b/i.test(name)) return reply({ error: 'Just a name please, no links!' }, 400);
      if (!GUESTBOOK_EMOJIS.includes(body.emoji)) return reply({ error: 'Pick one of the icons.' }, 400);
      const result = await site.sign(client, await networkHash(), name, body.emoji);
      return reply(result, result.error ? 400 : 200);
    }

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
      if (!isAdmin()) return reply({ error: 'not allowed' }, 403);
      return reply(await withNames(await env.POSTS.get(env.POSTS.idFromName(post)).reset(), env.SITE.get(env.SITE.idFromName('site'))));
    }

    const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
    const client = request.method === 'POST' ? body.client : params.get('client');
    if (!validClient(client)) return reply({ error: 'bad client' }, 400);

    const stub = env.POSTS.get(env.POSTS.idFromName(post));
    const site = env.SITE.get(env.SITE.idFromName('site'));
    const isGuest = (await site.guestNumber(client)) !== null;

    if (request.method === 'GET') return reply({ ...(await withNames(await stub.state(client), site)), guest: isGuest });
    if (request.method !== 'POST') return reply({ error: 'method not allowed' }, 405);

    if (!REACTIONS.includes(body.reaction)) return reply({ error: 'bad reaction' }, 400);
    // Only people who've signed the guestbook can react
    if (!isGuest) return reply({ error: 'sign the guestbook first' }, 403);
    return reply({ ...(await withNames(await stub.toggle(client, await networkHash(), body.reaction), site)), guest: true });
  },
};
