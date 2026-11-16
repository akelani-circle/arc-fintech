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

import { randomUUID } from "node:crypto"
import { AppKit } from "@circle-fin/app-kit"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

type Handler = (payload: unknown) => unknown
type BridgeArgs = { amount: string; invocationMeta?: { traceId?: string } }

// A real AppKit, so kit.on/kit.off are the SDK's own. Only bridge() and
// estimateBridge() are faked, since they need live chains. The fake mirrors
// the SDK: each bridge() call picks up every handler registered on the kit at
// that moment, and tags its events with invocationMeta.traceId (or a random
// one when none is given).
const kit = new AppKit()
const kitContext = (kit as unknown as {
  context: { actions: { bridge: Record<string, Handler[] | undefined> } }
}).context
const storedHandlers = (action: string) =>
  kitContext.actions.bridge[action]?.length ?? 0

const gates = new Map<string, Promise<void>>()

async function fakeBridge(params: BridgeArgs) {
  const burnHandlers = [...(kitContext.actions.bridge["bridge.burn"] ?? [])]
  const mintHandlers = [...(kitContext.actions.bridge["bridge.mint"] ?? [])]
  const traceId = params.invocationMeta?.traceId ?? randomUUID()
  await gates.get(params.amount)
  const burn = { name: "burn", state: "success", txHash: `0xburn-${params.amount}` }
  const mint = { name: "mint", state: "success", txHash: `0xmint-${params.amount}` }
  for (const h of burnHandlers) {
    await h({ protocol: "cctp", version: "v2", traceId, method: "burn", values: burn })
  }
  for (const h of mintHandlers) {
    await h({ protocol: "cctp", version: "v2", traceId, method: "mint", values: mint })
  }
  return { state: "success", steps: [burn, mint] }
}

Object.assign(kit, {
  bridge: vi.fn(fakeBridge),
  estimateBridge: vi.fn(async () => ({ fees: [] })),
})

// Every update the route makes to a transactions row, by row id.
const rowUpdates = new Map<string, Array<Record<string, unknown>>>()
let nextRowId = 0

const supabase = {
  auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
  from: () => ({
    insert: (rows: Array<{ amount: number }>) => ({
      select: () => ({
        single: async () => ({
          data: { id: `row-${rows[0].amount}-${nextRowId++}` },
          error: null,
        }),
      }),
    }),
    update: (values: Record<string, unknown>) => ({
      eq: async (_col: string, id: string) => {
        rowUpdates.set(id, [...(rowUpdates.get(id) ?? []), values])
        return { error: null }
      },
    }),
  }),
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => supabase }))
vi.mock("@/lib/api/ownership", () => ({
  assertWalletsOwnedByUser: async (_s: unknown, _u: string, ids: string[]) =>
    ids.map((id) => ({ circle_wallet_id: id, address: `0x${id}` })),
}))
vi.mock("@/lib/circle/app-kit", () => ({
  getAppKit: () => kit,
  getCircleWalletsAdapter: () => ({}),
}))

const { POST } = await import("@/app/api/bridge/rebalance/route")

function rebalance(amount: number) {
  return POST(
    new NextRequest("http://localhost/api/bridge/rebalance", {
      method: "POST",
      body: JSON.stringify({
        sourceWalletId: "src",
        sourceChain: "ARC-TESTNET",
        destinationWalletId: "dst",
        destinationChain: "BASE-SEPOLIA",
        amount,
      }),
    })
  )
}

function burnHashesFor(amount: number) {
  const hashes = new Set<unknown>()
  for (const [id, updates] of rowUpdates) {
    if (!id.startsWith(`row-${amount}-`)) continue
    for (const u of updates) if (u.tx_hash) hashes.add(u.tx_hash)
  }
  return [...hashes]
}

describe("bridge rebalance event listeners", () => {
  beforeEach(() => {
    rowUpdates.clear()
    gates.clear()
  })

  it("removes its listeners once each transfer settles", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await rebalance(10)
      expect(res.ok).toBe(true)
    }
    // The route can answer as soon as the burn lands, and the bridge keeps
    // running in the background, so wait for it to settle.
    await vi.waitFor(() => {
      expect(storedHandlers("bridge.burn")).toBe(0)
      expect(storedHandlers("bridge.mint")).toBe(0)
    })
  })

  it("never writes another transfer's burn hash to a row", async () => {
    // Transfer A (10 USDC) waits until transfer B (20 USDC) has burned.
    let releaseA!: () => void
    gates.set("10.000000", new Promise<void>((r) => (releaseA = r)))

    const a = rebalance(10)
    await vi.waitFor(() => expect(storedHandlers("bridge.burn")).toBe(1))
    const b = await rebalance(20)
    expect(b.ok).toBe(true)
    releaseA()
    expect((await a).ok).toBe(true)

    expect(burnHashesFor(10)).toEqual(["0xburn-10.000000"])
    expect(burnHashesFor(20)).toEqual(["0xburn-20.000000"])
  })
})
