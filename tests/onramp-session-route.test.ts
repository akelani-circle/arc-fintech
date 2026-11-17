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

// Literals, not imports from onramp-environment: that module reads the env at
// import time, which would run before the stubs below.
const SANDBOX_API_BASE_URL = "https://api-test.circle.com"
const SANDBOX_WIDGET_BASE_URL = "https://onramp-sandbox.arc.io"

const createSession = vi.fn(async () => ({
  sessionToken: "token",
  expiresAt: "2099-01-01T00:00:00Z",
}))
const createOnrampServerKit = vi.fn(() => ({ createSession }))

vi.mock("@circle-fin/onramp-kit/server", () => ({ createOnrampServerKit }))

const wallet = { address: "0xwallet", blockchain: "ARC-TESTNET" }
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: wallet, error: null }),
      }
      return q
    },
  }),
}))

vi.stubEnv("CIRCLE_API_KEY", "TEST_API_KEY:id:secret")
vi.stubEnv("ONRAMP_API_BASE_URL", SANDBOX_API_BASE_URL)
vi.stubEnv("NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL", SANDBOX_WIDGET_BASE_URL)
vi.stubEnv("WEBHOOK_ENDPOINT_URL", "https://app.example.com/api/circle/webhook")

const { POST } = await import("@/app/api/onramp/session/route")

describe("POST /api/onramp/session", () => {
  it("mints with the public kit's option names", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/onramp/session", {
        method: "POST",
        body: JSON.stringify({ walletId: "wallet-1" }),
      })
    )

    expect(res.status).toBe(200)
    // @circle-fin/onramp-kit takes `apiKey` (a Circle API key) and the
    // referrer domain at construction; the canary took `kitKey` and a
    // per-session `referrerDomain`.
    expect(createOnrampServerKit).toHaveBeenCalledWith({
      apiKey: "TEST_API_KEY:id:secret",
      baseUrl: SANDBOX_API_BASE_URL,
      widgetBaseUrl: SANDBOX_WIDGET_BASE_URL,
      referrerDomain: "app.example.com",
    })
    expect(createSession).toHaveBeenCalledWith({
      appUserId: "user-1",
      destinationAddress: "0xwallet",
      destinationChain: "Arc_Testnet",
    })
  })
})
