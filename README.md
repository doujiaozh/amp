[![Conformance Suite](https://github.com/doujiaozh/amp/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/doujiaozh/amp/actions/workflows/test.yml)

> **Naming note**: AMP here stands for **Attestation Memory Protocol**.
> It is **not** the same as "Agent Memory Protocol" (a persistent
> cross-session memory layer). Our focus is **evidence orchestration**:
> every read/write carries verifiable attestation and an immutable
> hash-chained audit trail. We do not store or rank memories; we sit
> in front of any memory store and make access auditable.

# AMP - Attestation Memory Protocol

Your AI's memory should come with a receipt.

AMP is an open protocol that makes every AI memory read/write carry
verifiable source, limitations, authorization and an immutable audit trail.

## The problem
- AI apps silently collect and forget context.
- Users can't see why an AI "knows" something.
- Deletions can't be proven.
- There is no portable evidence of what happened.

## The idea
Every memory must carry an attestation:

    { source, method, confidence, limitations, capturedAt }

Every access appends a hash-chained audit event.
Deletion produces a tombstone that keeps the content hash as proof.

## Quick start

    node reference/daemon.js

    # in another terminal:
    node conformance/run.js

## Verify

    http://127.0.0.1:7717/v1/verify
    http://127.0.0.1:7717/v1/events

## Spec
SPEC.md - v0.2 stable. Includes AES-256-GCM encryption and cross-device sync APIs.

## Compatibility
Any implementation passing conformance/run.js is AMP-compatible.
We want a second implementation. That's what makes it a standard.

## Non-goals (v0.1)
Sync, encryption, cross-device, UI. See rfcs/.

## License
Apache-2.0


## MCP Integration (Cursor / Claude Desktop)

Because AMP is just a local HTTP daemon, you can easily wrap it as an MCP (Model Context Protocol) tool. Add this to your MCP config:

```json
{
  "mcpServers": {
    "amp": {
      "command": "node",
      "args": ["/absolute/path/to/amp/reference/daemon.js"]
    }
  }
}
```

Now your AI agent can securely write memories through AMP, and every operation will be verifiable at `http://127.0.0.1:7717/v1/verify`.