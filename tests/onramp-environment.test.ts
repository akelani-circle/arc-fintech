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
  PRODUCTION_API_BASE_URL,
  PRODUCTION_WIDGET_BASE_URL,
  SANDBOX_API_BASE_URL,
  SANDBOX_WIDGET_BASE_URL,
  readUrl,
  resolveEnvironment,
} from "@/lib/circle/onramp-environment"

describe("readUrl", () => {
  // The failure this guards: `.env.local` files carry `ONRAMP_API_BASE_URL=`
  // far more often than they omit the line, and an empty string is not a
  // usable base URL — it has to collapse to the same "unset" the kit sees.
  it.each([undefined, "", "   ", "\t\n"])("collapses %j to undefined", (value) => {
    expect(readUrl(value)).toBeUndefined()
  })

  it("trims a real value", () => {
    expect(readUrl(`  ${SANDBOX_API_BASE_URL}  `)).toBe(SANDBOX_API_BASE_URL)
  })
})

describe("resolveEnvironment", () => {
  const asApi = (url: string | undefined) =>
    resolveEnvironment(url, PRODUCTION_API_BASE_URL, "ONRAMP_API_BASE_URL")
  const asWidget = (url: string | undefined) =>
    resolveEnvironment(url, PRODUCTION_WIDGET_BASE_URL, "NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL")

  it("treats unset as production, matching the kit's own default", () => {
    expect(asApi(undefined)).toBe("production")
    expect(asWidget(undefined)).toBe("production")
  })

  it("recognises the production endpoints when named explicitly", () => {
    expect(asApi(PRODUCTION_API_BASE_URL)).toBe("production")
    expect(asWidget(PRODUCTION_WIDGET_BASE_URL)).toBe("production")
  })

  it("recognises the sandbox endpoints", () => {
    expect(asApi(SANDBOX_API_BASE_URL)).toBe("sandbox")
    expect(asWidget(SANDBOX_WIDGET_BASE_URL)).toBe("sandbox")
  })

  // The widget URL is written both ways in the wild, so a path must not change
  // the verdict — otherwise a trailing `/launch/onramp/v1` reads as sandbox on
  // a production origin and the mismatch guard fires on a correct config.
  it("compares origins, ignoring any path", () => {
    expect(asWidget(`${PRODUCTION_WIDGET_BASE_URL}/launch/onramp/v1`)).toBe("production")
    expect(asWidget(`${SANDBOX_WIDGET_BASE_URL}/launch/onramp/v1`)).toBe("sandbox")
  })

  it("classifies anything unrecognised as non-production", () => {
    expect(asApi("https://api-staging.circle.com")).toBe("sandbox")
    expect(asWidget("http://localhost:3001")).toBe("sandbox")
  })

  it("rejects a malformed URL by name rather than defaulting", () => {
    expect(() => asApi("not-a-url")).toThrow(/ONRAMP_API_BASE_URL is not a valid URL/)
  })
})
