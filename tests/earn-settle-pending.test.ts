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

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/circle/developer-controlled-wallets-client", () => ({
  circleDeveloperSdk: {},
}))

const { settlePendingEarnWrites } = await import("@/lib/earn/settle-pending")

type Row = Record<string, unknown>
let rows: Row[] = []

// Just the query shapes settlePendingEarnWrites uses, applied to `rows`.
function fakeSupabase() {
  return {
    from: () => ({
      select: () => {
        const filters: Array<(r: Row) => boolean> = []
        const q = {
          eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), q),
          in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), q),
          not: (col: string) => (filters.push((r) => r[col] != null), q),
          limit: async () => ({ data: rows.filter((r) => filters.every((f) => f(r))), error: null }),
        }
        return q
      },
      update: (values: Row) => {
        const filters: Array<(r: Row) => boolean> = []
        const q = {
          eq: (col: string, v: unknown) => {
            filters.push((r) => r[col] === v)
            if (filters.length === 2) {
              for (const r of rows) if (filters.every((f) => f(r))) Object.assign(r, values)
              return Promise.resolve({ error: null })
            }
            return q
          },
        }
        return q
      },
    }),
  }
}

describe("settlePendingEarnWrites", () => {
  beforeEach(() => {
    rows = [
      { id: "landed", user_id: "u", status: "PENDING", type: "EARN_WITHDRAW", circle_transaction_id: "c-1", tx_hash: null },
      { id: "in-flight", user_id: "u", status: "PENDING", type: "EARN_DEPOSIT", circle_transaction_id: "c-2", tx_hash: null },
      { id: "reverted", user_id: "u", status: "PENDING", type: "EARN_WITHDRAW", circle_transaction_id: "c-3", tx_hash: null },
      { id: "lookup-fails", user_id: "u", status: "PENDING", type: "EARN_WITHDRAW", circle_transaction_id: "c-4", tx_hash: null },
      { id: "other-user", user_id: "x", status: "PENDING", type: "EARN_WITHDRAW", circle_transaction_id: "c-5", tx_hash: null },
      { id: "no-circle-id", user_id: "u", status: "PENDING", type: "EARN_WITHDRAW", circle_transaction_id: null, tx_hash: null },
    ]
  })

  it("settles timed-out Earn writes from Circle, a webhook having been lost", async () => {
    const lookup = vi.fn(async (id: string) => {
      if (id === "c-1") return { state: "COMPLETE", txHash: "0x3281" }
      if (id === "c-2") return { state: "SENT" }
      if (id === "c-3") return { state: "FAILED", txHash: "0xd21d" }
      throw new Error("Circle unavailable")
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await settlePendingEarnWrites(fakeSupabase() as any, "u", lookup)

    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId["landed"]).toMatchObject({ status: "COMPLETE", tx_hash: "0x3281" })
    expect(byId["in-flight"]).toMatchObject({ status: "PENDING", tx_hash: null })
    expect(byId["reverted"]).toMatchObject({ status: "FAILED", tx_hash: "0xd21d" })
    expect(byId["lookup-fails"]).toMatchObject({ status: "PENDING" })
    expect(byId["other-user"]).toMatchObject({ status: "PENDING" })
    expect(lookup).toHaveBeenCalledTimes(4)
  })
})
