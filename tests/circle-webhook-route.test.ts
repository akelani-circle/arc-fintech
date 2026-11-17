/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "node:crypto"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}

// Just enough of the supabase-js query builder for the webhook route, over
// in-memory tables. Unique columns mirror the real schema.
const UNIQUE: Record<string, string[]> = {
  webhook_events: ["notification_id"],
  transactions: ["circle_transaction_id"],
}

function query(table: string) {
  const filters: Array<(row: Row) => boolean> = []
  let op: "select" | "update" | "delete" = "select"
  let patch: Row = {}
  const rows = () => (tables[table] ??= [])
  const matching = () => rows().filter((r) => filters.every((f) => f(r)))

  const run = () => {
    const hit = matching()
    if (op === "update") hit.forEach((r) => Object.assign(r, patch))
    if (op === "delete") tables[table] = rows().filter((r) => !hit.includes(r))
    return { data: hit.map((r) => ({ ...r })), error: null }
  }

  const builder = {
    select: () => builder,
    update: (values: Row) => ((op = "update"), (patch = values), builder),
    delete: () => ((op = "delete"), builder),
    eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), builder),
    in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), builder),
    ilike: (col: string, val: string) =>
      (filters.push((r) => String(r[col]).toLowerCase() === val.toLowerCase()), builder),
    limit: () => builder,
    maybeSingle: async () => ({ data: matching()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve(run()),
  }
  return builder
}

function insertRows(table: string, input: Row | Row[], ignoreDuplicates = false) {
  const list = (tables[table] ??= [])
  const inserted: Row[] = []
  for (const row of Array.isArray(input) ? input : [input]) {
    const clash = (UNIQUE[table] ?? []).some(
      (col) => row[col] != null && list.some((r) => r[col] === row[col])
    )
    if (clash) {
      if (ignoreDuplicates) continue
      return { data: null, error: { code: "23505", message: "duplicate key" } }
    }
    const stored = { status: "PENDING", currency: "USDC", ...row }
    list.push(stored)
    inserted.push(stored)
  }
  return { data: inserted, error: null }
}

const supabase = {
  from: (table: string) => ({
    ...query(table),
    insert: async (rows: Row | Row[]) => insertRows(table, rows),
    upsert: (rows: Row | Row[], opts?: { ignoreDuplicates?: boolean }) => {
      const result = insertRows(table, rows, opts?.ignoreDuplicates)
      return { select: async () => result }
    },
  }),
}

vi.mock("@supabase/supabase-js", () => ({ createClient: () => supabase }))

// A real key pair, so the route's signature check runs for real.
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
})
const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64")

const TOKENS: Record<string, string> = {
  "token-usdc": "USDC",
  "token-eurc": "EURC",
  "token-vault-share": "",
}

const fetchMock = vi.fn(async (url: string) => {
  if (url.includes("/v2/notifications/publicKey/")) {
    return Response.json({ data: { publicKey: publicKeyBase64 } })
  }
  const token = url.match(/\/v1\/w3s\/tokens\/(.+)$/)?.[1]
  if (token && token in TOKENS) {
    return Response.json({ data: { token: { id: token, symbol: TOKENS[token] } } })
  }
  return new Response("not found", { status: 404 })
})
vi.stubGlobal("fetch", fetchMock)

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test"
process.env.SUPABASE_SECRET_KEY = "secret"
process.env.CIRCLE_API_KEY = "TEST_API_KEY:id:secret"

const { POST } = await import("@/app/api/circle/webhook/route")

function deliver(body: Row) {
  const raw = JSON.stringify(body)
  const signature = crypto.sign("sha256", Buffer.from(raw), privateKey).toString("base64")
  return POST(
    new NextRequest("http://localhost/api/circle/webhook", {
      method: "POST",
      body: raw,
      headers: { "x-circle-signature": signature, "x-circle-key-id": "key-1" },
    })
  )
}

function txEvent(notificationId: string, type: string, notification: Row) {
  return { notificationId, notificationType: type, notification }
}

describe("Circle webhook route", () => {
  beforeEach(() => {
    for (const key of Object.keys(tables)) delete tables[key]
    tables.wallets = [{ user_id: "user-1", address: "0xmine" }]
  })

  it("applies every state change for one transaction, not just the first", async () => {
    tables.transactions = [
      { id: "row-1", type: "OUTBOUND", status: "PENDING", tx_hash: "0xhash", circle_transaction_id: null },
    ]

    for (const [id, state] of [["n-1", "SENT"], ["n-2", "CONFIRMED"], ["n-3", "COMPLETE"]]) {
      const res = await deliver(
        txEvent(id, "transactions.outbound", { id: "tx-1", state, txHash: "0xhash" })
      )
      expect(res.status).toBe(200)
    }

    expect(tables.transactions[0].status).toBe("COMPLETE")
    expect(tables.webhook_events.map((e) => e.notification_id)).toEqual(["n-1", "n-2", "n-3"])
    expect(tables.webhook_events.every((e) => e.circle_transaction_id === "tx-1")).toBe(true)
  })

  it("acks a redelivered notification without applying it twice", async () => {
    const event = txEvent("n-1", "transactions.outbound", { id: "tx-1", state: "COMPLETE" })
    expect((await deliver(event)).status).toBe(200)
    const res = await deliver(event)
    expect(await res.json()).toEqual({ received: true, duplicate: true })
  })

  it("never moves a row backwards when updates arrive out of order", async () => {
    tables.transactions = [
      { id: "row-1", type: "OUTBOUND", status: "PENDING", circle_transaction_id: "tx-1" },
    ]
    await deliver(txEvent("n-2", "transactions.outbound", { id: "tx-1", state: "COMPLETE" }))
    await deliver(txEvent("n-1", "transactions.outbound", { id: "tx-1", state: "CONFIRMED" }))
    expect(tables.transactions[0].status).toBe("COMPLETE")
  })

  it("settles an Earn withdrawal from its inbound USDC instead of recording it twice", async () => {
    tables.transactions = [
      { id: "row-1", type: "EARN_WITHDRAW", status: "CONFIRMED", tx_hash: "0xwithdraw", circle_transaction_id: null },
    ]
    await deliver(
      txEvent("n-1", "transactions.inbound", {
        id: "tx-in",
        state: "COMPLETE",
        txHash: "0xwithdraw",
        blockchain: "ARC-TESTNET",
        destinationAddress: "0xmine",
        amounts: ["0.2"],
        tokenId: "token-usdc",
      })
    )
    expect(tables.transactions).toHaveLength(1)
    expect(tables.transactions[0]).toMatchObject({ type: "EARN_WITHDRAW", status: "COMPLETE" })
  })

  it("settles a timed-out Earn write by its Circle transaction id", async () => {
    tables.transactions = [
      { id: "row-1", type: "EARN_WITHDRAW", status: "PENDING", tx_hash: null, circle_transaction_id: "batch-1" },
    ]
    await deliver(
      txEvent("n-1", "transactions.outbound", { id: "batch-1", state: "COMPLETE", txHash: "0xlanded" })
    )
    expect(tables.transactions[0]).toMatchObject({ status: "COMPLETE", tx_hash: "0xlanded" })
  })

  it("labels an external inbound deposit with its token's currency", async () => {
    await deliver(
      txEvent("n-1", "transactions.inbound", {
        id: "tx-in",
        state: "COMPLETE",
        blockchain: "ARC-TESTNET",
        destinationAddress: "0xMINE",
        sourceAddress: "0xexternal",
        amounts: ["3"],
        tokenId: "token-eurc",
      })
    )
    expect(tables.transactions).toHaveLength(1)
    expect(tables.transactions[0]).toMatchObject({
      type: "INBOUND",
      currency: "EURC",
      amount: 3,
      status: "COMPLETE",
      user_id: "user-1",
    })
  })

  it("records no row for tokens the app doesn't model", async () => {
    await deliver(
      txEvent("n-1", "transactions.inbound", {
        id: "tx-in",
        state: "COMPLETE",
        blockchain: "ARC-TESTNET",
        destinationAddress: "0xmine",
        amounts: ["0.99"],
        tokenId: "token-vault-share",
      })
    )
    expect(tables.transactions ?? []).toHaveLength(0)
  })

  it("advances an inbound row on a later state instead of duplicating it", async () => {
    const inbound = {
      id: "tx-in",
      blockchain: "ARC-TESTNET",
      destinationAddress: "0xmine",
      amounts: ["1"],
      tokenId: "token-usdc",
    }
    await deliver(txEvent("n-1", "transactions.inbound", { ...inbound, state: "CONFIRMED" }))
    await deliver(txEvent("n-2", "transactions.inbound", { ...inbound, state: "COMPLETE" }))
    expect(tables.transactions).toHaveLength(1)
    expect(tables.transactions[0]).toMatchObject({ status: "COMPLETE", currency: "USDC" })
  })

  it("releases the dedupe row and 500s when the token lookup fails, so Circle retries", async () => {
    const res = await deliver(
      txEvent("n-1", "transactions.inbound", {
        id: "tx-in",
        state: "COMPLETE",
        blockchain: "ARC-TESTNET",
        destinationAddress: "0xmine",
        amounts: ["1"],
        tokenId: "token-unknown",
      })
    )
    expect(res.status).toBe(500)
    expect(tables.webhook_events).toHaveLength(0)
  })
})
