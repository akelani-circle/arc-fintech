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
import { parseBalanceAmount } from "@/lib/balances/fetcher"

describe("parseBalanceAmount", () => {
  it("parses the USDC display strings the balance API returns", () => {
    expect(parseBalanceAmount("$100.00")).toBe(100)
    expect(parseBalanceAmount("$1,234.56 (ARC-TESTNET)")).toBe(1234.56)
    expect(parseBalanceAmount("$0.00 (ARC-TESTNET)")).toBe(0)
  })

  it("parses EURC strings, whose symbol differs from USDC's", () => {
    expect(parseBalanceAmount("€50.25")).toBe(50.25)
    expect(parseBalanceAmount("€1,000.00 (ARC-TESTNET)")).toBe(1000)
  })

  it("treats a missing entry as zero", () => {
    // The swap panel relies on this to disable its sell input on an empty
    // wallet, but checks for `undefined` separately so a not-yet-loaded
    // balance isn't mistaken for an empty one.
    expect(parseBalanceAmount(undefined)).toBe(0)
  })

  it("returns zero rather than NaN for an unparseable entry", () => {
    expect(parseBalanceAmount("")).toBe(0)
    expect(parseBalanceAmount("unavailable")).toBe(0)
  })
})
