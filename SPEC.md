# AMP — Attestation Memory Protocol v0.1

Status: DRAFT (MVP frozen)
License: Apache-2.0

## 0. 一句话
AMP 不拥有记忆。AMP 让 AI 对记忆的每一次读写都带上
可验证的来源、局限、授权和审计轨迹。

## 1. 核心原则
1. Memory 必须携带 Attestation，否则拒收。
2. 每次读写授权都产生不可篡改的审计事件。
3. 删除产生 Tombstone，保留内容哈希以证明删除已发生。
4. 审计事件通过 hash chain 串联，任何实现都可独立验证。

## 2. 对象

### 2.1 Memory
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| id | string | 服务端生成 | UUID |
| scope | string | 是 | 命名空间，如 work / health |
| content | string | 是 | 记忆正文 |
| metadata | object | 否 | 任意键值 |
| attestation | Attestation | 是 | 见 2.2 |
| contentHash | string | 服务端生成 | sha256(content) |
| state | "active" \| "tombstoned" | 服务端 | 删除后为 tombstoned |
| createdAt / updatedAt | number | 服务端 | epoch ms |
| tombstonedAt | number \| null | 服务端 | 删除时间 |

### 2.2 Attestation（本协议的核心）
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| source | "user" \| "app" \| "model" \| "import" | 是 | 谁产生的 |
| method | string | 是 | 如何获得的，如 "user typed" |
| confidence | number 0..1 | 是 | 置信度 |
| limitations | string[] | 是 | 明确不知道什么，可为空数组但不能缺 |
| capturedAt | number | 是 | 采集时间 epoch ms |

缺任一字段 → `400 invalid_attestation`。

### 2.3 Grant
`{ id, appId, scopes[], issuedAt, expiresAt, revokedAt|null }`

### 2.4 Event（审计事件）