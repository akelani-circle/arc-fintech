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
import { computeAccrued, resolveRewardApys } from "@/lib/earn/mock-rewards"

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

describe("resolveRewardApys", () => {
  it("prefers the vault's advertised reward list", () => {
    const result = resolveRewardApys({
      rewards: [{ token: "MORPHO", apy: 0.02 }],
      currentApy: 0.06,
      nativeApy: 0.04,
    })
    expect(result).toEqual([{ token: "MORPHO", apy: 0.02 }])
  })

  it("falls back to the current-vs-native APY spread when no rewards listed", () => {
    const result = resolveRewardApys({
      rewards: [],
      currentApy: 0.061,
      nativeApy: 0.05,
    })
    expect(result).toHaveLength(1)
    expect(result[0].apy).toBeCloseTo(0.011, 6)
  })

  it("falls back to a default reward when there is no incentive spread", () => {
    const result = resolveRewardApys({
      rewards: [],
      currentApy: 0.05,
      nativeApy: 0.05,
    })
    expect(result).toHaveLength(1)
    expect(result[0].apy).toBeGreaterThan(0)
  })
})

describe("computeAccrued", () => {
  it("accrues balance * apy over a full year", () => {
    const start = 0
    expect(computeAccrued(1000, 0.02, start, YEAR_MS)).toBeCloseTo(20, 6)
  })

  it("scales linearly with elapsed time", () => {
    const half = computeAccrued(1000, 0.02, 0, YEAR_MS / 2)
    expect(half).toBeCloseTo(10, 6)
  })

  it("returns 0 for a non-positive balance or apy", () => {
    expect(computeAccrued(0, 0.02, 0, YEAR_MS)).toBe(0)
    expect(computeAccrued(1000, 0, 0, YEAR_MS)).toBe(0)
  })

  it("never goes negative when the clock is ahead of now", () => {
    expect(computeAccrued(1000, 0.02, YEAR_MS, 0)).toBe(0)
  })
})
