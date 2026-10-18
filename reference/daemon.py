import http.server
import json
import hashlib
import uuid
import time
import urllib.parse

PORT = 7717
GENESIS = "GENESIS"

db = {"memories": {}, "grants": {}, "events": []}

def sha(s): return hashlib.sha256(s.encode('utf-8')).hexdigest()
def now(): return int(time.time() * 1000)

def last_hash():
    return db["events"][-1]["hash"] if db["events"] else GENESIS

def append_event(actor, action, target, payload):
    prev = last_hash()
    seq = len(db["events"])
    ev = {"seq": seq, "id": str(uuid.uuid4()), "actor": actor, "action": action,
          "target": target, "payloadHash": sha(json.dumps(payload)), "at": now(), "prevHash": prev}
    ev["hash"] = sha(f"{ev['seq']}|{ev['id']}|{ev['actor']}|{ev['action']}|{ev['target']}|{ev['payloadHash']}|{ev['at']}|{ev['prevHash']}")
    db["events"].append(ev)

def find_grant(app_id, scope):
    for g in db["grants"].values():
        if g["appId"] == app_id and not g.get("revokedAt") and g["expiresAt"] > now() and scope in g["scopes"]:
            return g
    return None

def verify_chain():
    prev = GENESIS
    for i, e in enumerate(db["events"]):
        if e["seq"] != i or e["prevHash"] != prev: return False, i
        h = sha(f"{e['seq']}|{e['id']}|{e['actor']}|{e['action']}|{e['target']}|{e['payloadHash']}|{e['at']}|{e['prevHash']}")
        if h != e["hash"]: return False, i
        prev = e["hash"]
    return True, -1

class Handler(http.server.BaseHTTPRequestHandler):
    def _send(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*') # 允许跨域，给 Web UI 用
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self): self._send(200, {})

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path, query = parsed.path, urllib.parse.parse_qs(parsed.query)
        
        if path == "/v1/memories":
            app_id, scope = query.get("appId", [""])[0], query.get("scope", [""])[0]
            if not find_grant(app_id, scope): return self._send(403, {"error": "forbidden"})
            items = [m for m in db["memories"].values() if m["scope"] == scope and m["state"] == "active"]
            append_event(app_id, "memory.read", f"scope:{scope}", {"count": len(items)})
            return self._send(200, items)

        elif path == "/v1/verify":
            ok, broken = verify_chain()
            if ok: append_event("system", "chain.verify", "chain", {"ok": True})
            res = {"ok": ok, "events": len(db["events"])}
            if not ok: res["brokenAt"] = broken
            return self._send(200, res)

        elif path == "/v1/events":
            return self._send(200, db["events"])
            
        self._send(404, {"error": "not_found"})

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        
        if self.path == "/v1/grants":
            app_id, scopes, ttl = body.get("appId"), body.get("scopes"), body.get("ttlMs")
            if not app_id or not scopes or not ttl: return self._send(400, {"error": "bad_request"})
            gid = str(uuid.uuid4())
            db["grants"][gid] = {"id": gid, "appId": app_id, "scopes": scopes, "issuedAt": now(), "expiresAt": now() + ttl}
            append_event("user", "grant.create", f"grant:{gid}", {"appId": app_id, "scopes": scopes})
            return self._send(201, {"id": gid})

        elif self.path == "/v1/memories":
            app_id, scope, content, att = body.get("appId"), body.get("scope"), body.get("content"), body.get("attestation")
            if not att or not att.get("source") or not att.get("method") or not isinstance(att.get("confidence"), (int, float)) or not isinstance(att.get("limitations"), list) or not att.get("capturedAt"):
                return self._send(400, {"error": "invalid_attestation"})
            if not find_grant(app_id, scope): return self._send(403, {"error": "forbidden"})
            
            mid = str(uuid.uuid4())
            db["memories"][mid] = {"id": mid, "scope": scope, "content": content, "attestation": att,
                "contentHash": sha(content), "state": "active", "createdAt": now(), "updatedAt": now()}
            append_event(app_id, "memory.write", f"memory:{mid}", {"scope": scope, "contentHash": sha(content)})
            return self._send(201, {"id": mid})

        self._send(404, {"error": "not_found"})

    def do_DELETE(self):
        path = self.path.split('?')[0]
        if path.startswith("/v1/grants/"):
            gid = path.split("/")[-1]
            g = db["grants"].get(gid)
            if not g: return self._send(404, {"error": "not_found"})
            if not g.get("revokedAt"):
                g["revokedAt"] = now()
                append_event("user", "grant.revoke", f"grant:{gid}", {"appId": g["appId"]})
            return self._send(200, {"ok": True})
        self._send(404, {"error": "not_found"})

if __name__ == "__main__":
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"AMP Python daemon listening on http://127.0.0.1:{PORT}")
    server.serve_forever()