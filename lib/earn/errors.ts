/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EarnKit error -> HTTP-result mapping. Kept in its own module (free of the
 * `server-only` adapter imports in `earn-ops.ts`) so it can be unit-tested and
 * reused without pulling the Circle Wallets adapter into the test runner.
 */

import {
  getErrorCode,
  getErrorMessage,
  isInputError,
  isRetryableError,
} from "@circle-fin/earn-kit"

export interface EarnErrorResult {
  status: number
  error: string
  userMessage: string
}

/** Earn Service code for "this wallet has no position in this vault yet". */
const NO_POSITION_SERVICE_CODE = 380407

/**
 * True when `getPosition` failed only because the wallet has never deposited
 * into the vault - a normal "empty position" state, not a real error. Matched
 * by the Earn Service code, with the human message as a fallback.
 */
export function isNoPositionError(error: unknown): boolean {
  const serviceCode =
    typeof error === "object" && error !== null
      ? (error as { cause?: { trace?: { earnServiceCode?: unknown } } }).cause
          ?.trace?.earnServiceCode
      : undefined
  if (serviceCode === NO_POSITION_SERVICE_CODE) return true
  return getErrorMessage(error).toLowerCase().includes("not registered")
}

/**
 * Map an EarnKit failure to an HTTP-friendly result. Input errors (bad
 * address/amount, unsupported chain) surface as 400 with the SDK's own
 * message; insufficient-funds failures are also 400; everything else is a 502
 * upstream failure. Never throws.
 */
export function getEarnError(error: unknown): EarnErrorResult {
  const message = getErrorMessage(error)
  if (isInputError(error)) {
    return {
      status: 400,
      error: "Invalid Earn request",
      userMessage: message || "The request was rejected by EarnKit.",
    }
  }
  const code = getErrorCode(error)
  if (message.toLowerCase().includes("insufficient")) {
    return {
      status: 400,
      error: "Insufficient balance",
      userMessage: message,
    }
  }
  // Transient upstream/RPC failures that survived the bounded retry. Surface a
  // 503 so the client treats it as "try again" rather than a hard failure.
  if (isRetryableError(error)) {
    return {
      status: 503,
      error: "Temporarily unavailable",
      userMessage:
        "Arc Testnet had a transient error. Please try again in a moment.",
    }
  }
  return {
    status: 502,
    error: "Earn operation failed",
    userMessage:
      message || `EarnKit request failed${code !== null ? ` (code ${code})` : ""}.`,
  }
}
