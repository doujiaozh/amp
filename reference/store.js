const fs = require("fs");
const path = require("path");
const dataFile = path.join(__dirname, "../amp_data.json");

function loadData() {
  if (fs.existsSync(dataFile)) {
    try {
      const raw = fs.readFileSync(dataFile, "utf8");
      const parsed = JSON.parse(raw);
      return {
        memories: new Map(parsed.memories),
        grants: new Map(parsed.grants),
        events: parsed.events
      };
    } catch (e) {
      console.error("Failed to load data, starting fresh.");
    }
  }
  return { memories: new Map(), grants: new Map(), events: [] };
}

function saveData(db) {
  const data = {
    memories: Array.from(db.memories.entries()),
    grants: Array.from(db.grants.entries()),
    events: db.events
  };
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf8");
}

const db = loadData();
console.log("💾 Data persistence enabled. Loaded events:", db.events.length);

module.exports = { db, saveData };