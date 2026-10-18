# AMP vs. Other Memory Protocols

To avoid confusion, here is how AMP (Attestation Memory Protocol) differs from existing solutions in the AI memory ecosystem.

| Dimension | **AMP (This Project)** | **Agent Memory Protocol** | **Procheiron** | **Heartwood Memory** |
|---|---|---|---|---|
| **Goal** | Evidence orchestration (audit layer) | Cross-session persistence | Review-gated trust | Governed storage |
| **Stores Memory?** | **No** (sits in front of any store) | Yes | No | Yes |
| **Core Mechanism** | Attestation + Hash Chain + Tombstone | Persistent context graph | Independent review lifecycle | Signed audit + Policy-gated recall |
| **Dependencies** | **Zero** (Node.js native) | Varies | Zero | Python library |
| **License** | **Apache-2.0** | Varies | - | BSL 1.1 (Not OSI) |
| **MCP Integration** | Yes (via local HTTP daemon) | Yes | Yes | Yes |

## Addressing Common Criticisms

**1. "Procheiron already does hash-chain auditing. Why duplicate?"**
> Procheiron is a *review-gated* layer (propose -> review -> promote) focusing on human-in-the-loop approval. AMP makes attestation a **mandatory required field** at the moment of write, solving the "why does the AI know this?" problem at the API level. They compose well together.

**2. "Heartwood has signed audit and key destruction proofs, which is stronger."**
> Heartwood is a governed storage engine with a BSL 1.1 license (not fully open source). AMP is a zero-dependency, Apache-2.0 orchestration layer that does not own the data, only verifies the evidence. Different layers, different guarantees.

**3. "Agent Memory Protocol already has implementations and MCP."**
> Agent Memory Protocol solves *persistence* (memory surviving across sessions). AMP solves *verifiability* (who wrote it, how confident they were, and proof of deletion). An AI agent can use both.