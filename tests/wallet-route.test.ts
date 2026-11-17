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

import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const createWallets = vi.fn()
const initiateDepositFromCustodialWallet = vi.fn()
const inserted: Array<Record<string, unknown>> = []

// Just enough of the Supabase query builder for the route: the wallet-set
// lookup (no existing wallets), the gateway-signer lookup (one exists) and
// the wallets insert.
function query(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    neq: () => chain,
    not: () => chain,
    limit: async () => ({ data: [], error: null }),
    single: async () => ({ data: { address: "0xsigner" }, error: null }),
    insert: async (row: Record<string, unknown>) => {
      inserted.push({ table, ...row })
      return { error: null }
    },
  }
  return chain
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: query,
  }),
}))
vi.mock("@/lib/circle/developer-controlled-wallets-client", () => ({
  circleDeveloperSdk: {
    createWalletSet: async () => ({ data: { walletSet: { id: "set-1" } } }),
    createWallets,
  },
}))
vi.mock("@/lib/circle/gateway-sdk", () => ({ initiateDepositFromCustodialWallet }))
vi.mock("@/lib/circle/gateway-webhooks", () => ({
  syncGatewayWebhookSubscription: async () => ({ status: "ok" }),
}))

const { POST } = await import("@/app/api/wallet/route")

function createWallet(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/wallet", {
      method: "POST",
      body: JSON.stringify(body),
    })
  )
}

describe("POST /api/wallet", () => {
  beforeEach(() => {
    inserted.length = 0
    createWallets.mockReset().mockResolvedValue({
      data: { wallets: [{ id: "w-1", address: "0xabc" }] },
    })
    initiateDepositFromCustodialWallet.mockReset()
  })

  it("saves the wallet row before the slow delegate step", async () => {
    // The delegate step waits on-chain; never let it finish here, as when the
    // browser goes away mid-request.
    initiateDepositFromCustodialWallet.mockReturnValue(new Promise(() => {}))

    void createWallet({ name: "Ops", blockchain: "AVAX-FUJI", type: "payout" })

    await vi.waitFor(() => expect(initiateDepositFromCustodialWallet).toHaveBeenCalled())
    expect(inserted).toEqual([
      {
        table: "wallets",
        user_id: "user-1",
        name: "Ops",
        circle_wallet_id: "w-1",
        address: "0xabc",
        blockchain: "AVAX-FUJI",
        type: "payout",
      },
    ])
  })

  it("rejects wallet types users can't create, before calling Circle", async () => {
    const res = await createWallet({ name: "x", blockchain: "AVAX-FUJI", type: "gateway_signer" })

    expect(res.status).toBe(400)
    expect(createWallets).not.toHaveBeenCalled()
    expect(inserted).toEqual([])
  })
})
