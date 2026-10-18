const http = require('http');
const crypto = require('crypto');

const PORT = 7717;
const HOST = '127.0.0.1';

const db = { memories: new Map(), grants: new Map(), events: [] };
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const now = () => Date.now();
const GENESIS = 'GENESIS';

function uuid() {
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}

const lastHash = () => db.events.length ? db.events[db.events.length - 1].hash : GENESIS;

function appendEvent(actor, action, target, payload) {
  payload = payload || {};
  const prevHash = lastHash();
  const seq = db.events.length;
  const ev = { seq, id: uuid(), actor, action, target,
    payloadHash: sha(JSON.stringify(payload)), at: now(), prevHash };
  ev.hash = sha([ev.seq, ev.id, ev.actor, ev.action, ev.target,
    ev.payloadHash, ev.at, ev.prevHash].join('|'));
  db.events.push(ev);
  return ev;
}

function verifyChain() {
  let prev = GENESIS;
  for (let i = 0; i < db.events.length; i++) {
    const e = db.events[i];
    if (e.seq !== i || e.prevHash !== prev) return { ok: false, brokenAt: i };
    const h = sha([e.seq, e.id, e.actor, e.action, e.target,
      e.payloadHash, e.at, e.prevHash].join('|'));
    if (h !== e.hash) return { ok: false, brokenAt: i };
    prev = e.hash;
  }
  return { ok: true, events: db.events.length };
}

function findGrant(appId, scope) {
  for (const g of db.grants.values()) {
    if (g.appId !== appId || g.revokedAt) continue;
    if (g.expiresAt <= now()) continue;
    if (g.scopes.indexOf(scope) !== -1) return g;
  }
  return null;
}

function validateAttestation(a) {
  if (!a || typeof a !== 'object') return 'attestation required';
  if (['user','app','model','import'].indexOf(a.source) === -1) return 'attestation.source invalid';
  if (typeof a.method !== 'string' || !a.method) return 'attestation.method required';
  if (typeof a.confidence !== 'number' || a.confidence < 0 || a.confidence > 1)
    return 'attestation.confidence must be 0..1';
  if (!Array.isArray(a.limitations)) return 'attestation.limitations must be array';
  if (typeof a.capturedAt !== 'number') return 'attestation.capturedAt required';
  return null;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => raw += c);
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { resolve({ __parseError: true }); }
    });
  });
}

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
}

function qs(url) {
  const q = {};
  const s = url.indexOf('?');
  if (s === -1) return q;
  const parts = url.slice(s + 1).split('&');
  for (let i = 0; i < parts.length; i++) {
    const kv = parts[i].split('=');
    if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || '');
  }
  return q;
}

const server = http.createServer(function (req, res) {
  const p = req.url.split('?')[0];
  const q = qs(req.url);

  (async function () {
    const body = (req.method === 'POST' || req.method === 'PUT') ? await readBody(req) : {};

    try {
      if (req.method === 'POST' && p === '/v1/memories') {
        const appId = body.appId, scope = body.scope, content = body.content;
        const attestation = body.attestation, metadata = body.metadata || {};
        const err = validateAttestation(attestation);
        if (err) return send(res, 400, { error: 'invalid_attestation', detail: err });
        if (!findGrant(appId, scope)) return send(res, 403, { error: 'forbidden' });
        if (typeof content !== 'string' || !content) return send(res, 400, { error: 'content required' });
        const id = uuid();
        const t = now();
        db.memories.set(id, { id: id, scope: scope, content: content, metadata: metadata, attestation: attestation,
          contentHash: sha(content), state: 'active', createdAt: t, updatedAt: t, tombstonedAt: null });
        appendEvent(appId, 'memory.write', 'memory:' + id, { scope: scope, contentHash: sha(content) });
        return send(res, 201, { id: id });
      }

      if (req.method === 'GET' && p === '/v1/memories') {
        const appId = q.appId, scope = q.scope, query = q.q;
        if (!findGrant(appId, scope)) return send(res, 403, { error: 'forbidden' });
        const items = [];
        db.memories.forEach(function (m) {
          if (m.scope === scope && m.state === 'active' && (!query || m.content.indexOf(query) !== -1))
            items.push(m);
        });
        appendEvent(appId, 'memory.read', 'scope:' + scope, { count: items.length });
        return send(res, 200, items);
      }

      if (req.method === 'DELETE' && p.indexOf('/v1/memories/') === 0) {
        const id = p.split('/').pop();
        const appId = q.appId;
        const m = db.memories.get(id);
        if (!m) return send(res, 404, { error: 'not_found' });
        if (m.state === 'tombstoned') return send(res, 409, { error: 'already_tombstoned' });
        if (!findGrant(appId, m.scope)) return send(res, 403, { error: 'forbidden' });
        m.state = 'tombstoned';
        m.content = '';
        m.tombstonedAt = now();
        m.updatedAt = m.tombstonedAt;
        appendEvent(appId, 'memory.tombstone', 'memory:' + id, { scope: m.scope, contentHash: m.contentHash });
        return send(res, 200, { id: id, contentHash: m.contentHash, tombstonedAt: m.tombstonedAt });
      }

      if (req.method === 'POST' && p === '/v1/grants') {
        const appId = body.appId, scopes = body.scopes, ttlMs = body.ttlMs;
        if (!appId || !Array.isArray(scopes) || !scopes.length || typeof ttlMs !== 'number')
          return send(res, 400, { error: 'bad_request' });
        const id = uuid();
        db.grants.set(id, { id: id, appId: appId, scopes: scopes, issuedAt: now(), expiresAt: now() + ttlMs, revokedAt: null });
        appendEvent('user', 'grant.create', 'grant:' + id, { appId: appId, scopes: scopes, ttlMs: ttlMs });
        return send(res, 201, { id: id });
      }

      if (req.method === 'DELETE' && p.indexOf('/v1/grants/') === 0) {
        const id = p.split('/').pop();
        const g = db.grants.get(id);
        if (!g) return send(res, 404, { error: 'not_found' });
        if (!g.revokedAt) {
          g.revokedAt = now();
          appendEvent('user', 'grant.revoke', 'grant:' + id, { appId: g.appId });
        }
        return send(res, 200, { ok: true });
      }

      if (req.method === 'GET' && p === '/v1/events') {
        const since = Number(q.since || 0);
        const out = db.events.filter(function (e) { return e.seq >= since; });
        return send(res, 200, out);
      }

      if (req.method === 'GET' && p === '/v1/verify') {
        const r = verifyChain();
        appendEvent('system', 'chain.verify', 'chain', { ok: r.ok });
        return send(res, 200, r);
      }

      return send(res, 404, { error: 'not_found' });
    } catch (e) {
      return send(res, 500, { error: 'internal', detail: String(e) });
    }
  })();
});

server.listen(PORT, HOST, function () {
  console.log('AMP daemon listening on http://' + HOST + ':' + PORT);
});