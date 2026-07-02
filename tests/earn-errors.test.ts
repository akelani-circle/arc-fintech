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
import { getEarnError, isNoPositionError } from "@/lib/earn/errors"

describe("getEarnError", () => {
  it("maps insufficient-balance failures to a 400", () => {
    const result = getEarnError(new Error("insufficient funds for transfer"))
    expect(result.status).toBe(400)
    expect(result.error).toBe("Insufficient balance")
    expect(result.userMessage).toContain("insufficient")
  })

  it("maps unknown failures to a 502 with the original message", () => {
    const result = getEarnError(new Error("upstream exploded"))
    expect(result.status).toBe(502)
    expect(result.userMessage).toContain("upstream exploded")
  })

  it("never throws on non-Error input", () => {
    const result = getEarnError("a bare string")
    expect(result.status).toBe(502)
    expect(typeof result.userMessage).toBe("string")
  })
})

describe("isNoPositionError", () => {
  it("detects the Earn Service no-position code", () => {
    const error = { cause: { trace: { earnServiceCode: 380407 } } }
    expect(isNoPositionError(error)).toBe(true)
  })

  it("detects the 'not registered' message as a fallback", () => {
    const error = new Error(
      "EARN_INVALID_INPUT: The requested wallet/vault position is not registered."
    )
    expect(isNoPositionError(error)).toBe(true)
  })

  it("returns false for unrelated failures", () => {
    expect(isNoPositionError(new Error("insufficient funds"))).toBe(false)
    expect(isNoPositionError("nope")).toBe(false)
  })
})
