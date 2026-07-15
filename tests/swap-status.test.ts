/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, expect, it } from "vitest"
import { toSwapTransactionStatus } from "@/lib/swap/status"

describe("toSwapTransactionStatus", () => {
  it("confirms only a settled swap", () => {
    expect(toSwapTransactionStatus("DONE")).toBe("CONFIRMED")
  })

  it("records a failed swap as FAILED, not CONFIRMED", () => {
    // The regression this guards: App Kit's swap() *resolves* on an on-chain
    // failure, and SwapResult.txHash is always populated, so deriving the
    // status from the txHash marked every failed swap as CONFIRMED forever.
    expect(toSwapTransactionStatus("FAILED")).toBe("FAILED")
  })

  it("leaves an unsettled swap PENDING for the webhook to reconcile", () => {
    expect(toSwapTransactionStatus("PENDING")).toBe("PENDING")
    // Submitted, but the Stablecoin Service has not indexed it yet.
    expect(toSwapTransactionStatus("NOT_FOUND")).toBe("PENDING")
  })

  it("never optimistically confirms an unrecognised status", () => {
    expect(toSwapTransactionStatus("SOMETHING_NEW")).toBe("PENDING")
    expect(toSwapTransactionStatus("")).toBe("PENDING")
  })
})
