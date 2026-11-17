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
import { describe, expect, it, vi } from "vitest"

const screenAddress = vi.fn()

vi.mock("@/lib/compliance/utils", () => ({
  screenAddress,
  formatComplianceResponse: () => ({}),
  mapComplianceResult: () => "PASS",
}))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => ({ insert: async () => ({ error: null }) }),
  }),
}))

const { POST } = await import("@/app/api/compliance/screen/route")

function screen(body: unknown) {
  return POST(
    new NextRequest("http://localhost/api/compliance/screen", {
      method: "POST",
      body: JSON.stringify(body),
    })
  )
}

describe("POST /api/compliance/screen", () => {
  it.each([
    [{ address: "not-an-address", chain: "ARC-TESTNET" }],
    [{ address: "0x1234", chain: "ARC-TESTNET" }],
    [{ address: "0x68ff69abc98cf1ab1c46810ca0a2f044c764d5d7", chain: "NOT-A-CHAIN" }],
    [{ address: "0x68ff69abc98cf1ab1c46810ca0a2f044c764d5d7" }],
  ])("rejects %j before calling Circle", async (body) => {
    const res = await screen(body)
    expect(res.status).toBe(400)
    expect(screenAddress).not.toHaveBeenCalled()
  })

  it("screens a valid EVM address on a supported chain", async () => {
    screenAddress.mockResolvedValueOnce({ decision: {} })
    const res = await screen({
      address: "0x68ff69abc98cf1ab1c46810ca0a2f044c764d5d7",
      chain: "ARC-TESTNET",
    })
    expect(res.status).toBe(200)
    expect(screenAddress).toHaveBeenCalledWith(
      "0x68ff69abc98cf1ab1c46810ca0a2f044c764d5d7",
      "ARC-TESTNET"
    )
  })
})
