# Naming Note: Why AMP?

AMP stands for **Attestation Memory Protocol**.

## The Conflict
The acronym "AMP" has already been used in the AI space to refer to **Agent Memory Protocol** (a cross-session persistent memory layer for AI agents).

## Our Distinction
While Agent Memory Protocol focuses on *where* memories are stored and *how long* they persist, our AMP focuses on **Evidence Orchestration**.
- We do **not** store memories.
- We sit in front of a memory store (like SQLite, Redis, or a Vector DB).
- We enforce that every read/write action carries an `Attestation` (source, confidence, limitations).
- We log everything to an immutable hash chain.

## Why keep the name?
Because our core contribution is the **Attestation** primitive, and AMP is the most natural acronym. We will continuously clarify this difference in our README and documentation.