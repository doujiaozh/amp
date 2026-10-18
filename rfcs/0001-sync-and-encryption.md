# RFC-0001: Sync and Encryption for AMP v0.2

Status: DRAFT
Author: (open)
Created: TBD

## Motivation
AMP v0.1 is single-device and unencrypted. Real deployments need:
- Multi-device memory continuity.
- Encryption at rest.
- Verifiable deletion propagated across replicas.

## Scope
1. Cipher suite and key management (proposal: age / X25519 + ChaCha20-Poly1305).
2. Sync transport (proposal: append-only event log + CRDT for grant revocation).
3. Cross-device tombstone propagation proof.
4. How verify works when events are encrypted (proposal: encrypt payload, keep hash chain public).

## Open questions
- Should the hash chain be over plaintext payloadHash or ciphertextHash?
- How to prove deletion on a replica you do not control?
- Key rotation and grant expiry interplay.

## Non-goals
- Real-time collab editing.
- Server-hosted memory.
