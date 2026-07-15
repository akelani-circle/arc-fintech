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
import { formatMoney } from "@/lib/utils/data-formatters"

describe("formatMoney", () => {
  it("renders USDC with a dollar sign", () => {
    expect(formatMoney(1234.5, "USDC")).toBe("$1,234.50")
    expect(formatMoney(0, "USDC")).toBe("$0.00")
  })

  it("suffixes the EURC ticker rather than rendering a euro sign", () => {
    // The token is EURC, not euros, so Intl's `EUR` style (which would print
    // "€1,234.50") would misname it.
    expect(formatMoney(1234.5, "EURC")).toBe("1,234.50 EURC")
    expect(formatMoney(0, "EURC")).toBe("0.00 EURC")
  })

  it("defaults to USDC, so pre-swap rows keep their meaning", () => {
    // Mirrors the transactions.currency column default: rows written before
    // the swap migration carry no explicit currency.
    expect(formatMoney(10)).toBe("$10.00")
  })

  it("accepts the string amounts the balance API returns", () => {
    expect(formatMoney("1234.5", "USDC")).toBe("$1,234.50")
    expect(formatMoney("1234.5", "EURC")).toBe("1,234.50 EURC")
  })

  it("falls back to zero on a non-finite amount instead of printing NaN", () => {
    expect(formatMoney("not-a-number", "USDC")).toBe("$0.00")
    expect(formatMoney("not-a-number", "EURC")).toBe("0.00 EURC")
  })
})
