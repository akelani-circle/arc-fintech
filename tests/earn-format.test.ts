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
import {
  formatApy,
  formatCompactUsd,
  formatTokenAmount,
  trimAmount,
} from "@/lib/earn/format"

describe("formatApy", () => {
  it("renders a decimal rate as a percentage", () => {
    expect(formatApy(0.0497)).toBe("4.97%")
    expect(formatApy(0.025, 1)).toBe("2.5%")
    expect(formatApy(0.86, 0)).toBe("86%")
  })

  it("guards non-finite input", () => {
    expect(formatApy(Number.NaN)).toBe("-")
  })
})

describe("formatCompactUsd", () => {
  it("compacts large vault figures Morpho-style", () => {
    expect(formatCompactUsd("326730000")).toBe("$326.73M")
    expect(formatCompactUsd(0)).toBe("$0")
  })

  it("falls back to $0 on bad input", () => {
    expect(formatCompactUsd("not-a-number")).toBe("$0")
  })
})

describe("formatTokenAmount", () => {
  it("appends the symbol and trims excess precision", () => {
    expect(formatTokenAmount("12.5", "USDC")).toBe("12.5 USDC")
    expect(formatTokenAmount("1.2345678", "USDC", 4)).toBe("1.2346 USDC")
  })
})

describe("trimAmount", () => {
  it("drops trailing zeros and grouping", () => {
    expect(trimAmount("1000.5000")).toBe("1000.5")
    expect(trimAmount(Number.NaN)).toBe("0")
  })
})
