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

import { describe, expect, it } from "vitest"
import {
  currencyFromTokenSymbol,
  getWebhookEventId,
  statusesReplaceableBy,
  toTransactionStatus,
} from "@/lib/circle/webhook-events"

describe("getWebhookEventId", () => {
  it("uses the per-notification id, not the transaction id", () => {
    const tx = { id: "tx-1", state: "CONFIRMED" }
    expect(getWebhookEventId({ notificationId: "n-1", notification: tx })).toBe("n-1")
    expect(getWebhookEventId({ notificationId: "n-2", notification: tx })).toBe("n-2")
  })

  it("falls back to transaction id + state when notificationId is missing", () => {
    expect(
      getWebhookEventId({ notification: { id: "tx-1", state: "CONFIRMED" } })
    ).toBe("tx-1:CONFIRMED")
    expect(
      getWebhookEventId({ notificationId: "", notification: { id: "tx-1", state: "COMPLETE" } })
    ).toBe("tx-1:COMPLETE")
  })
})

describe("toTransactionStatus", () => {
  it("passes tracked states through", () => {
    expect(toTransactionStatus("CONFIRMED")).toBe("CONFIRMED")
    expect(toTransactionStatus("COMPLETE")).toBe("COMPLETE")
    expect(toTransactionStatus("FAILED")).toBe("FAILED")
  })

  it("treats CANCELLED and DENIED as FAILED", () => {
    expect(toTransactionStatus("CANCELLED")).toBe("FAILED")
    expect(toTransactionStatus("DENIED")).toBe("FAILED")
  })

  it("ignores in-flight states", () => {
    for (const state of ["INITIATED", "QUEUED", "SENT", "CLEARED", "STUCK", undefined]) {
      expect(toTransactionStatus(state)).toBeNull()
    }
  })
})

describe("statusesReplaceableBy", () => {
  it("only moves rows forward", () => {
    expect(statusesReplaceableBy("CONFIRMED")).toEqual(["PENDING"])
    expect(statusesReplaceableBy("COMPLETE")).toEqual(["PENDING", "CONFIRMED"])
    expect(statusesReplaceableBy("FAILED")).toEqual(["PENDING", "CONFIRMED"])
  })
})

describe("currencyFromTokenSymbol", () => {
  it("maps the two modelled stablecoins", () => {
    expect(currencyFromTokenSymbol("USDC")).toBe("USDC")
    expect(currencyFromTokenSymbol("EURC")).toBe("EURC")
    expect(currencyFromTokenSymbol("eurc")).toBe("EURC")
  })

  it("returns null for anything else", () => {
    // Earn vault share tokens come back from Circle with an empty symbol.
    expect(currencyFromTokenSymbol("")).toBeNull()
    expect(currencyFromTokenSymbol("WETH")).toBeNull()
    expect(currencyFromTokenSymbol(undefined)).toBeNull()
  })
})
