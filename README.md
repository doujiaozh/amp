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
SPEC.md - v0.1 frozen for MVP.

## Compatibility
Any implementation passing conformance/run.js is AMP-compatible.
We want a second implementation. That's what makes it a standard.

## Non-goals (v0.1)
Sync, encryption, cross-device, UI. See rfcs/.

## License
Apache-2.0
