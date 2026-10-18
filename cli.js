const http = require("http");
const BASE = "http://127.0.0.1:7717";

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(BASE + path, { method, headers: data ? { "Content-Type": "application/json" } : {} }, (res) => {
      let raw = ""; res.on("data", c => raw += c);
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch(e) { resolve(raw); } });
    });
    req.on("error", reject); if (data) req.write(data); req.end();
  });
}

const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === "write") {
  const [appId, scope, content] = args.slice(1);
  req("POST", "/v1/memories", { appId, scope, content, attestation: { source: "user", method: "cli", confidence: 1.0, limitations: [], capturedAt: Date.now() } }).then(res => console.log("✅ Written:", res));
} else if (cmd === "grant") {
  const [appId, scopes] = args.slice(1);
  req("POST", "/v1/grants", { appId, scopes: scopes.split(","), ttlMs: 3600000 }).then(res => console.log("✅ Granted:", res));
} else if (cmd === "read") {
  const [appId, scope] = args.slice(1);
  req("GET", `/v1/memories?appId=${appId}&scope=${scope}`).then(res => console.log(JSON.stringify(res, null, 2)));
} else {
  console.log("AMP CLI v0.3\nUsage:\n  node cli.js write [appId] [scope] [content]\n  node cli.js grant [appId] [scope1,scope2]\n  node cli.js read [appId] [scope]");
}