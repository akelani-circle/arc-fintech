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
 * App Kit Swap wired to the same Circle Developer-Controlled Wallets adapter
 * the rest of the app already uses for App Kit sends / EarnKit. Swap is
 * currently only supported on Arc Testnet among this app's chains (App Kit's
 * `SwapChain` enum has no entry for Base/Avalanche/Ethereum Sepolia), so
 * every call here is pinned to `SwapChain.Arc_Testnet`.
 *
 * Server-side only: the adapter calls Circle's DCW API with the entity
 * secret, which must never reach the browser bundle.
 */

import "server-only"

import { AppKit, SwapChain, type SwapResult } from "@circle-fin/app-kit"
import {
  createCircleWalletsAdapter,
  type CircleWalletsAdapter,
} from "@circle-fin/adapter-circle-wallets"
import type { Currency } from "@/lib/constants/currency"
import { SWAP_SLIPPAGE_BPS } from "@/lib/constants/swap"
import {
  toSwapTransactionStatus,
  type SwapTransactionStatus,
} from "@/lib/swap/status"

export const SWAP_BLOCKCHAIN = "ARC-TESTNET" as const

let cachedAppKit: AppKit | null = null
let cachedAdapter: CircleWalletsAdapter | null = null

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function getAppKit(): AppKit {
  if (!cachedAppKit) {
    cachedAppKit = new AppKit()
  }
  return cachedAppKit
}

function createAdapter(): CircleWalletsAdapter {
  return createCircleWalletsAdapter({
    apiKey: requireEnv("CIRCLE_API_KEY"),
    entitySecret: requireEnv("CIRCLE_ENTITY_SECRET"),
  })
}

/**
 * Return an adapter whose `getAddress()` resolves to `address`. The Circle
 * Wallets adapter is developer-controlled: one instance fronts every wallet,
 * so operations must name the wallet via the context `address`, and some
 * adapter code paths still probe `adapter.getAddress()` directly - mirrors
 * the same proxy trick used in `lib/circle/app-kit-send.ts` and
 * `lib/circle/earn-kit.ts`.
 */
function withResolvedAddress(
  adapter: CircleWalletsAdapter,
  address: string
): CircleWalletsAdapter {
  const resolved = address.trim()
  if (!resolved) {
    throw new Error("Missing wallet address for swap operation.")
  }
  return new Proxy(adapter as object, {
    get(target, property) {
      if (property === "getAddress") {
        return async () => resolved
      }
      const value = Reflect.get(target, property, target)
      return typeof value === "function" ? value.bind(target) : value
    },
  }) as CircleWalletsAdapter
}

/**
 * Kit Key for permissioned mode, read from the same `KIT_KEY` env var as
 * `earnConfig()` in `lib/circle/earn-kit.ts`.
 *
 * Unlike EarnKit, Swap has no permissionless fallback: the Stablecoin Service
 * rejects an empty `kitKey` with a fatal INPUT_VALIDATION_FAILED, so leaving
 * `KIT_KEY` unset disables the Swap page entirely. Still returns `undefined`
 * rather than an empty string so the SDK's own error names the missing field.
 */
function swapConfig(): { kitKey: string } | undefined {
  const kitKey = process.env.KIT_KEY
  return kitKey ? { kitKey } : undefined
}

function fromContext(walletAddress: string) {
  if (!cachedAdapter) {
    cachedAdapter = createAdapter()
  }
  return {
    adapter: withResolvedAddress(cachedAdapter, walletAddress),
    chain: SwapChain.Arc_Testnet,
    address: walletAddress.trim(),
  }
}

export type SwapQuoteInput = {
  walletAddress: string
  tokenIn: Currency
  tokenOut: Currency
  amountIn: string
}

export type SwapQuoteResult = {
  amountOut: string
  effectiveRate: string
}

export async function estimateSwap({
  walletAddress,
  tokenIn,
  tokenOut,
  amountIn,
}: SwapQuoteInput): Promise<SwapQuoteResult> {
  const result = await getAppKit().estimateSwap({
    from: fromContext(walletAddress),
    tokenIn,
    tokenOut,
    amountIn,
    // Same slippage the execute path will apply, so the quote the user is
    // shown is priced under the same terms the swap actually runs under.
    config: { ...swapConfig(), slippageBps: SWAP_SLIPPAGE_BPS },
  })

  const amountOut = result.estimatedOutput.amount
  const inNum = Number(amountIn)
  const outNum = Number(amountOut)
  const effectiveRate = inNum > 0 ? (outNum / inNum).toString() : "0"

  return { amountOut, effectiveRate }
}

/**
 * Slippage is deliberately absent: it is server policy (`SWAP_SLIPPAGE_BPS`),
 * not a caller-supplied value.
 */
export type SwapExecuteInput = SwapQuoteInput

export type SwapExecuteResult = {
  amountOut?: string
  txHash?: string
  status: SwapTransactionStatus
  statusMessage?: string
}

export async function executeSwap({
  walletAddress,
  tokenIn,
  tokenOut,
  amountIn,
}: SwapExecuteInput): Promise<SwapExecuteResult> {
  const result: SwapResult = await getAppKit().swap({
    from: fromContext(walletAddress),
    tokenIn,
    tokenOut,
    amountIn,
    config: { ...swapConfig(), slippageBps: SWAP_SLIPPAGE_BPS },
  })

  return {
    amountOut: result.amountOut,
    txHash: result.txHash,
    status: toSwapTransactionStatus(result.progress.status),
    statusMessage: result.progress.substatusMessage,
  }
}

export interface AppKitSwapErrorResult {
  status: number
  error: string
  userMessage: string
}

export function getAppKitSwapError(error: unknown): AppKitSwapErrorResult {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? String((error as { message?: unknown }).message ?? "")
        : ""

  if (/insufficient/i.test(message)) {
    return {
      status: 400,
      error: "Insufficient balance",
      userMessage: message || "Not enough balance to complete this swap.",
    }
  }

  return {
    status: 502,
    error: "Swap failed",
    userMessage: message || "Swap failed. Please try again.",
  }
}
