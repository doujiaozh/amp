const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE = process.env.AMP_BASE || 'http://127.0.0.1:7717';
const casesPath = path.join(__dirname, 'cases.json');
const cases = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
const ctx = {};
let pass = 0, fail = 0;

function subst(s) {
  if (typeof s !== 'string') return s;
  return s.replace(/\{\{(\w+)\}\}/g, function (_, k) { return ctx[k]; });
}

function getPath(obj, p) {
  const parts = p.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length; i++) {
    if (cur == null) return undefined;
    cur = cur[parts[i]];
  }
  return cur;
}

function request(method, fullPath, body) {
  return new Promise(function (resolve, reject) {
    const url = new URL(fullPath, BASE);
    const data = body ? JSON.stringify(body) : null;
    const headers = {};
    if (data) {
      headers['content-type'] = 'application/json';
      headers['content-length'] = Buffer.byteLength(data);
    }
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: headers
    }, function (res) {
      let raw = '';
      res.on('data', function (c) { raw += c; });
      res.on('end', function () {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) {}
        resolve({ status: res.statusCode, json: json, text: raw });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async function () {
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const p = subst(c.request.path);
    let body;
    if (c.request.body) body = JSON.parse(subst(JSON.stringify(c.request.body)));
    const res = await request(c.request.method, p, body);

    let ok = true, why = '';
    if (res.status !== c.expect.status) {
      ok = false; why = 'status ' + res.status + ' != ' + c.expect.status;
    }
    if (ok && c.expect.body) {
      for (const k in c.expect.body) {
        if (getPath(res.json, k) !== c.expect.body[k]) {
          ok = false; why = 'body.' + k + ' != ' + c.expect.body[k]; break;
        }
      }
    }
    if (ok && c.expect.bodyArrayFirstHas) {
      if (!Array.isArray(res.json) || !res.json[0]) { ok = false; why = 'expected non-empty array'; }
      else for (let j = 0; j < c.expect.bodyArrayFirstHas.length; j++) {
        const k = c.expect.bodyArrayFirstHas[j];
        if (!(k in res.json[0])) { ok = false; why = 'array[0].' + k + ' missing'; break; }
      }
    }
    if (ok && c.save && res.json) {
      for (const k in c.save) ctx[k] = getPath({ body: res.json }, c.save[k]);
    }

    if (ok) { pass++; console.log('PASS ' + c.name); }
    else { fail++; console.log('FAIL ' + c.name + ' ¡ª ' + why); }
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();