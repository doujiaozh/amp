package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

const genesis = "GENESIS"

type Attestation struct {
	Source      string   `json:"source"`
	Method      string   `json:"method"`
	Confidence  float64  `json:"confidence"`
	Limitations []string `json:"limitations"`
	CapturedAt  int64    `json:"capturedAt"`
}

type Memory struct {
	ID           string      `json:"id"`
	Scope        string      `json:"scope"`
	Content      string      `json:"content"`
	Metadata     interface{} `json:"metadata,omitempty"`
	Attestation  Attestation `json:"attestation"`
	ContentHash  string      `json:"contentHash"`
	State        string      `json:"state"`
	CreatedAt    int64       `json:"createdAt"`
	UpdatedAt    int64       `json:"updatedAt"`
	TombstonedAt *int64      `json:"tombstonedAt,omitempty"`
}

type Grant struct {
	ID        string   `json:"id"`
	AppID     string   `json:"appId"`
	Scopes    []string `json:"scopes"`
	IssuedAt  int64    `json:"issuedAt"`
	ExpiresAt int64    `json:"expiresAt"`
	RevokedAt *int64   `json:"revokedAt,omitempty"`
}

type Event struct {
	Seq         int    `json:"seq"`
	ID          string `json:"id"`
	Actor       string `json:"actor"`
	Action      string `json:"action"`
	Target      string `json:"target"`
	PayloadHash string `json:"payloadHash"`
	At          int64  `json:"at"`
	PrevHash    string `json:"prevHash"`
	Hash        string `json:"hash"`
}

type DB struct {
	mu       sync.Mutex
	memories map[string]*Memory
	grants   map[string]*Grant
	events   []Event
}

var db = &DB{memories: map[string]*Memory{}, grants: map[string]*Grant{}}

func sha(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func uuid() string { b := make([]byte, 16); rand.Read(b); return hex.EncodeToString(b) }
func now() int64 { return time.Now().UnixMilli() }
func lastHash() string {
	if len(db.events) == 0 { return genesis }
	return db.events[len(db.events)-1].Hash
}

func appendEvent(actor, action, target string, payload interface{}) {
	p, _ := json.Marshal(payload)
	prev := lastHash()
	ev := Event{
		Seq: len(db.events), ID: uuid(), Actor: actor, Action: action,
		Target: target, PayloadHash: sha(string(p)), At: now(), PrevHash: prev,
	}
	ev.Hash = sha(fmt.Sprintf("%d|%s|%s|%s|%s|%s|%d|%s",
		ev.Seq, ev.ID, ev.Actor, ev.Action, ev.Target, ev.PayloadHash, ev.At, ev.PrevHash))
	db.events = append(db.events, ev)
}

func verifyChain() (bool, int) {
	prev := genesis
	for i, e := range db.events {
		if e.Seq != i || e.PrevHash != prev { return false, i }
		h := sha(fmt.Sprintf("%d|%s|%s|%s|%s|%s|%d|%s",
			e.Seq, e.ID, e.Actor, e.Action, e.Target, e.PayloadHash, e.At, e.PrevHash))
		if h != e.Hash { return false, i }
		prev = e.Hash
	}
	return true, -1
}

func findGrant(appID, scope string) *Grant {
	for _, g := range db.grants {
		if g.AppID != appID || g.RevokedAt != nil || g.ExpiresAt <= now() { continue }
		for _, s := range g.Scopes { if s == scope { return g } }
	}
	return nil
}

func validateAtt(a Attestation) string {
	valid := map[string]bool{"user": true, "app": true, "model": true, "import": true}
	if !valid[a.Source] { return "attestation.source invalid" }
	if a.Method == "" { return "attestation.method required" }
	if a.Confidence < 0 || a.Confidence > 1 { return "attestation.confidence must be 0..1" }
	if a.Limitations == nil { return "attestation.limitations must be array" }
	if a.CapturedAt == 0 { return "attestation.capturedAt required" }
	return ""
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func handler(w http.ResponseWriter, r *http.Request) {
	db.mu.Lock()
	defer db.mu.Unlock()
	path := strings.TrimSuffix(r.URL.Path, "/")
	q := r.URL.Query()

	switch {
	case r.Method == "POST" && path == "/v1/memories":
		var body struct {
			AppID       string      `json:"appId"`
			Scope       string      `json:"scope"`
			Content     string      `json:"content"`
			Metadata    interface{} `json:"metadata"`
			Attestation Attestation `json:"attestation"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		if err := validateAtt(body.Attestation); err != "" {
			writeJSON(w, 400, map[string]string{"error": "invalid_attestation", "detail": err})
			return
		}
		if findGrant(body.AppID, body.Scope) == nil {
			writeJSON(w, 403, map[string]string{"error": "forbidden"})
			return
		}
		id := uuid()
		t := now()
		db.memories[id] = &Memory{ID: id, Scope: body.Scope, Content: body.Content,
			Metadata: body.Metadata, Attestation: body.Attestation,
			ContentHash: sha(body.Content), State: "active", CreatedAt: t, UpdatedAt: t}
		appendEvent(body.AppID, "memory.write", "memory:"+id,
			map[string]string{"scope": body.Scope, "contentHash": sha(body.Content)})
		writeJSON(w, 201, map[string]string{"id": id})

	case r.Method == "GET" && path == "/v1/memories":
		appID, scope := q.Get("appId"), q.Get("scope")
		if findGrant(appID, scope) == nil {
			writeJSON(w, 403, map[string]string{"error": "forbidden"})
			return
		}
		out := []*Memory{}
		for _, m := range db.memories {
			if m.Scope == scope && m.State == "active" { out = append(out, m) }
		}
		appendEvent(appID, "memory.read", "scope:"+scope, map[string]int{"count": len(out)})
		writeJSON(w, 200, out)

	case r.Method == "POST" && path == "/v1/grants":
		var body struct {
			AppID  string   `json:"appId"`
			Scopes []string `json:"scopes"`
			TTLMs  int64    `json:"ttlMs"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		if body.AppID == "" || len(body.Scopes) == 0 || body.TTLMs == 0 {
			writeJSON(w, 400, map[string]string{"error": "bad_request"})
			return
		}
		id := uuid()
		db.grants[id] = &Grant{ID: id, AppID: body.AppID, Scopes: body.Scopes, IssuedAt: now(), ExpiresAt: now() + body.TTLMs}
		appendEvent("user", "grant.create", "grant:"+id, map[string]interface{}{"appId": body.AppID, "scopes": body.Scopes})
		writeJSON(w, 201, map[string]string{"id": id})

	case r.Method == "DELETE" && strings.HasPrefix(path, "/v1/grants/"):
		id := strings.TrimPrefix(path, "/v1/grants/")
		g, ok := db.grants[id]
		if !ok {
			writeJSON(w, 404, map[string]string{"error": "not_found"})
			return
		}
		if g.RevokedAt == nil {
			t := now()
			g.RevokedAt = &t
			appendEvent("user", "grant.revoke", "grant:"+id, map[string]string{"appId": g.AppID})
		}
		writeJSON(w, 200, map[string]bool{"ok": true})

	case r.Method == "DELETE" && strings.HasPrefix(path, "/v1/memories/"):
		id := strings.TrimPrefix(path, "/v1/memories/")
		appID := q.Get("appId")
		m, ok := db.memories[id]
		if !ok {
			writeJSON(w, 404, map[string]string{"error": "not_found"})
			return
		}
		if m.State == "tombstoned" {
			writeJSON(w, 409, map[string]string{"error": "already_tombstoned"})
			return
		}
		if findGrant(appID, m.Scope) == nil {
			writeJSON(w, 403, map[string]string{"error": "forbidden"})
			return
		}
		m.State = "tombstoned"
		m.Content = ""
		t := now()
		m.TombstonedAt = &t
		m.UpdatedAt = t
		appendEvent(appID, "memory.tombstone", "memory:"+id, map[string]string{"scope": m.Scope, "contentHash": m.ContentHash})
		writeJSON(w, 200, map[string]interface{}{"id": id, "contentHash": m.ContentHash, "tombstonedAt": m.TombstonedAt})

	case r.Method == "GET" && path == "/v1/verify":
		ok, broken := verifyChain()
		if ok { appendEvent("system", "chain.verify", "chain", map[string]bool{"ok": true}) }
		resp := map[string]interface{}{"ok": ok, "events": len(db.events)}
		if !ok { resp["brokenAt"] = broken }
		writeJSON(w, 200, resp)
		
	case r.Method == "GET" && path == "/v1/events":
		writeJSON(w, 200, db.events)

	default:
		writeJSON(w, 404, map[string]string{"error": "not_found"})
	}
}

func main() {
	http.HandleFunc("/", handler)
	log.Println("AMP Go daemon listening on http://127.0.0.1:7717")
	log.Fatal(http.ListenAndServe("127.0.0.1:7717", nil))
}