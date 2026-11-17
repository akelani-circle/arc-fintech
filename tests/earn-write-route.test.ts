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

import { KitError } from "@circle-fin/earn-kit"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getUnconfirmedBatchId } from "@/lib/earn/errors"

const earnWithdraw = vi.fn()
const inserted: Array<Record<string, unknown>> = []

vi.mock("@/lib/circle/earn-ops", async () => {
  const errors = await import("@/lib/earn/errors")
  return { earnDeposit: vi.fn(), earnWithdraw, getEarnError: errors.getEarnError }
})
vi.mock("@/lib/circle/earn-kit", () => ({ EARN_BLOCKCHAIN: "ARC-TESTNET" }))
vi.mock("@/lib/earn/resolve-wallet", () => ({
  resolveEarnWallet: async () => ({ ok: true, address: "0xwallet" }),
}))

const { handleEarnWrite } = await import("@/lib/earn/write-route")

const VAULT = "0xaabbef1d3971c710276ed41ec791bbe14cdb8e88"
const supabase = {
  from: () => ({
    insert: async (rows: Array<Record<string, unknown>>) => {
      inserted.push(...rows)
      return { error: null }
    },
  }),
}

function withdraw(amount: string) {
  return handleEarnWrite(
    "withdraw",
    new NextRequest("http://localhost/api/earn/withdraw", {
      method: "POST",
      body: JSON.stringify({ walletId: "w-1", vaultAddress: VAULT, amount }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { user: { id: "user-1" } as any, supabase: supabase as any }
  )
}

// What EarnKit throws when its wait for the batch gives up (seen live on Arc
// Testnet while the Circle transaction sat in SENT for 8 minutes).
function unconfirmedBatchError(batchId: string) {
  return new KitError({
    code: 3002,
    name: "NETWORK_TIMEOUT",
    type: "NETWORK",
    recoverability: "FATAL",
    message: `Batched earn earn.withdraw was submitted (batch ${batchId}) but its outcome could not be confirmed; check the transaction status before retrying.`,
    cause: { trace: { batchId } },
  })
}

describe("getUnconfirmedBatchId", () => {
  it("returns the batch id of a submitted-but-unconfirmed write", () => {
    expect(getUnconfirmedBatchId(unconfirmedBatchError("batch-1"))).toBe("batch-1")
  })

  it("is null for other errors", () => {
    expect(getUnconfirmedBatchId(new Error("boom"))).toBeNull()
    expect(
      getUnconfirmedBatchId(
        new KitError({
          code: 3002,
          name: "NETWORK_TIMEOUT",
          type: "NETWORK",
          recoverability: "FATAL",
          message: "timed out before submitting",
        })
      )
    ).toBeNull()
  })
})

describe("earn write route", () => {
  beforeEach(() => {
    inserted.length = 0
    earnWithdraw.mockReset()
  })

  it("records an unconfirmed withdrawal as PENDING under its Circle id and answers 202", async () => {
    earnWithdraw.mockRejectedValue(unconfirmedBatchError("d01d297c"))

    const res = await withdraw("0.3")

    expect(res.status).toBe(202)
    expect(await res.json()).toMatchObject({ pending: true, batchId: "d01d297c" })
    expect(inserted).toEqual([
      expect.objectContaining({
        type: "EARN_WITHDRAW",
        status: "PENDING",
        amount: 0.3,
        circle_transaction_id: "d01d297c",
        tx_hash: null,
        sender_address: VAULT,
        recipient_address: "0xwallet",
      }),
    ])
  })

  it("still reports other failures as errors and records nothing", async () => {
    earnWithdraw.mockRejectedValue(new Error("upstream exploded"))

    const res = await withdraw("0.3")

    expect(res.status).toBe(502)
    expect(inserted).toEqual([])
  })
})
