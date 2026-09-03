/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { afterEach, describe, expect, it, vi } from "vitest"
import {
  SANDBOX_API_BASE_URL,
  SANDBOX_WIDGET_BASE_URL,
} from "@/lib/circle/onramp-environment"

/**
 * Both modules read their env at import time, so each case needs a fresh
 * module graph. Outside Next there is no build-time inlining of
 * `NEXT_PUBLIC_*`, so stubbing the variable is enough.
 */
async function loadWith(api: string | undefined, widget: string | undefined) {
  vi.resetModules()
  vi.stubEnv("ONRAMP_API_BASE_URL", api as string)
  vi.stubEnv("NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL", widget as string)
  return import("@/lib/circle/onramp-server-environment")
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe("assertOnrampSandbox", () => {
  it("passes when both halves point at sandbox", async () => {
    const { assertOnrampSandbox, ONRAMP_SERVER_ENVIRONMENT } = await loadWith(
      SANDBOX_API_BASE_URL,
      SANDBOX_WIDGET_BASE_URL
    )
    expect(ONRAMP_SERVER_ENVIRONMENT).toBe("sandbox")
    expect(() => assertOnrampSandbox()).not.toThrow()
  })

  // The state a fresh `cp .env.example .env.local` used to land in, and the
  // one a half-deleted config lands in: the kit reads unset as production.
  it("refuses when both are unset, rather than falling through to mainnet", async () => {
    const { assertOnrampSandbox } = await loadWith(undefined, undefined)
    expect(() => assertOnrampSandbox()).toThrow(/configured against production/)
  })

  it("refuses when both are present but empty", async () => {
    const { assertOnrampSandbox } = await loadWith("", "   ")
    expect(() => assertOnrampSandbox()).toThrow(/configured against production/)
  })

  // A kit key belongs to one environment, so a half-switched config mints in
  // one and loads the widget from the other, and the two silently ignore each
  // other. That has to fail loudly, not at the first confusing symptom.
  it("refuses a sandbox API with a production widget", async () => {
    const { assertOnrampSandbox } = await loadWith(SANDBOX_API_BASE_URL, undefined)
    expect(() => assertOnrampSandbox()).toThrow(/environment mismatch/)
  })

  it("refuses a production API with a sandbox widget", async () => {
    const { assertOnrampSandbox } = await loadWith(undefined, SANDBOX_WIDGET_BASE_URL)
    expect(() => assertOnrampSandbox()).toThrow(/environment mismatch/)
  })

  // The widget origin is written both ways in the wild; a path must not read
  // as a different environment and trip the mismatch check on a valid config.
  it("accepts the widget origin written with its launch path", async () => {
    const { assertOnrampSandbox } = await loadWith(
      SANDBOX_API_BASE_URL,
      `${SANDBOX_WIDGET_BASE_URL}/launch/onramp/v1`
    )
    expect(() => assertOnrampSandbox()).not.toThrow()
  })

  it("names both variables and the sandbox values it wants", async () => {
    const { assertOnrampSandbox } = await loadWith(undefined, undefined)
    expect(() => assertOnrampSandbox()).toThrow(
      new RegExp(`ONRAMP_API_BASE_URL=${SANDBOX_API_BASE_URL}`)
    )
  })
})
