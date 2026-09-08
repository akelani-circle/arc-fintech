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
 * Server-side EarnKit operations. Each function wraps a `@circle-fin/earn-kit`
 * call, threads the optional Kit Key (`earnConfig`) for permissioned mode, and
 * maps the SDK's `Earn*` result types - whose amounts are already decimal
 * strings - into the client-safe shapes in `lib/earn/types`.
 *
 * Read ops (`exploreEarnVaults`, `getEarnVault`) need no wallet. Position and
 * write ops take a Circle wallet address and run through the address-bound
 * adapter context from `earn-kit.ts`.
 */

import "server-only"

import {
  isRetryableError,
  type EarnVaultInfo,
  type EarnPositionInfo,
  type EarnDepositQuoteInfo,
  type EarnWithdrawalQuoteInfo,
  type EarnAssetAmount,
  type EarnGasFeeEstimate,
} from "@circle-fin/earn-kit"
import { isNoPositionError } from "@/lib/earn/errors"
import {
  getEarnKit,
  earnFromContext,
  earnConfig,
  EARN_CHAIN,
} from "@/lib/circle/earn-kit"
import type {
  EarnVault,
  EarnPosition,
  EarnVaultHolding,
  EarnDepositQuote,
  EarnWithdrawalQuote,
  EarnAmount,
  EarnGasFee,
  EarnWriteResult,
} from "@/lib/earn/types"
import {
  createPublicClient,
  http,
  formatUnits,
  getAddress,
  type Address,
} from "viem"
import { arcTestnet, withRetry as withRpcRetry } from "@/lib/circle/gateway-sdk"

export interface ExploreFilters {
  protocol?: string
  asset?: string
  minApy?: string
  minTvl?: string
  sortBy?: "apy" | "tvl" | "name"
  page?: number
  pageSize?: number
}

// --- mappers --------------------------------------------------------------

function mapVault(v: EarnVaultInfo): EarnVault {
  return {
    vaultAddress: v.vaultAddress,
    name: v.name,
    protocol: v.protocol,
    asset: v.asset,
    assetAddress: v.assetAddress,
    currentApy: v.currentApy,
    nativeApy: v.nativeApy,
    vaultFee: v.vaultFee,
    totalDeposits: v.totalDeposits,
    liquidity: v.liquidity,
    status: v.status,
    circleGuarded: v.circleGuarded,
    rewards: v.rewards.map((r) => ({ token: r.token, apy: r.apy })),
    collateral: v.collateral.map((c) => ({
      asset: c.asset,
      assetAddress: c.assetAddress,
      lltv: c.lltv,
      supplyUsd: c.supplyUsd,
    })),
    warnings: (v.warnings ?? []).map((w) => ({ type: w.type, level: w.level })),
  }
}

/** Arc USDC (the vaults' underlying asset) has 6 decimals. */
const USDC_DECIMALS = 6

const ERC4626_TOTAL_ASSETS_ABI = [
  {
    type: "function",
    name: "totalAssets",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const

/**
 * The mock Arc Testnet vaults report a hardcoded `totalDeposits: "0"` from
 * EarnService even though they hold real USDC on-chain, so when the SDK value
 * is 0 we fall back to the vault's ERC-4626 `totalAssets()`. Real vaults report
 * a non-zero figure and are left untouched. Best-effort: a failed read keeps
 * the SDK value rather than breaking the page.
 */
async function withOnChainTotalDeposits(vault: EarnVault): Promise<EarnVault> {
  if (Number(vault.totalDeposits) > 0) return vault
  try {
    const client = createPublicClient({ chain: arcTestnet, transport: http() })
    const raw = await client.readContract({
      address: vault.vaultAddress as Address,
      abi: ERC4626_TOTAL_ASSETS_ABI,
      functionName: "totalAssets",
    })
    return { ...vault, totalDeposits: formatUnits(raw, USDC_DECIMALS) }
  } catch {
    return vault
  }
}

function mapAmount(a: EarnAssetAmount): EarnAmount {
  return { symbol: a.symbol, amount: a.amount, type: a.type }
}

const ERC4626_POSITION_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "convertToAssets",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const

/**
 * viem client for Arc Testnet reads with transport-level batching: every
 * `eth_call` fired within one tick is coalesced into a single JSON-RPC HTTP
 * request. Lets the positions summary read many balances in one round trip.
 */
function arcBatchReadClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(undefined, { batch: true }),
  })
}

/** One (vault, wallet) position to read on-chain. */
export interface EarnHoldingPair {
  vaultAddress: string
  walletAddress: string
}

/**
 * Sum a user's current position value per vault by reading ERC-4626 share
 * balances directly on-chain, bypassing EarnKit's metered API entirely (the
 * same reason `withOnChainTotalDeposits` reads the chain: it is the source of
 * truth and off the rate-limited path). All `balanceOf` reads are fired
 * together so transport batching sends them as one request; per vault we sum
 * shares across the user's wallets and convert once, since ERC-4626
 * `convertToAssets` is linear. Best-effort: a failed read counts as 0 for that
 * pair rather than failing the whole column.
 */
export async function sumEarnHoldingsOnChain(
  pairs: EarnHoldingPair[]
): Promise<Record<string, EarnVaultHolding>> {
  if (pairs.length === 0) return {}
  const client = arcBatchReadClient()

  // Accumulate share balances keyed by lowercased vault address.
  const sharesByVault = new Map<string, bigint>()
  await Promise.all(
    pairs.map(async ({ vaultAddress, walletAddress }) => {
      try {
        const shares = await withRpcRetry(() =>
          client.readContract({
            address: getAddress(vaultAddress),
            abi: ERC4626_POSITION_ABI,
            functionName: "balanceOf",
            args: [getAddress(walletAddress)],
          })
        )
        const key = vaultAddress.toLowerCase()
        sharesByVault.set(key, (sharesByVault.get(key) ?? BigInt(0)) + shares)
      } catch (error) {
        console.error(
          `Earn on-chain balanceOf failed for ${walletAddress} / ${vaultAddress}:`,
          error
        )
      }
    })
  )

  const holdings: Record<string, EarnVaultHolding> = {}
  await Promise.all(
    [...sharesByVault.entries()].map(async ([vaultKey, totalShares]) => {
      if (totalShares === BigInt(0)) return
      try {
        const assets = await withRpcRetry(() =>
          client.readContract({
            address: getAddress(vaultKey),
            abi: ERC4626_POSITION_ABI,
            functionName: "convertToAssets",
            args: [totalShares],
          })
        )
        if (assets > BigInt(0)) {
          holdings[vaultKey] = {
            balance: formatUnits(assets, USDC_DECIMALS),
            hasPosition: true,
          }
        }
      } catch (error) {
        console.error(
          `Earn on-chain convertToAssets failed for ${vaultKey}:`,
          error
        )
      }
    })
  )
  return holdings
}

function mapGasFees(
  fees: readonly EarnGasFeeEstimate[] | undefined
): EarnGasFee[] {
  if (!fees) return []
  return fees.map((f) =>
    f.fees === null
      ? { name: f.name, token: f.token, fee: null, error: f.error }
      : { name: f.name, token: f.token, fee: f.fees.fee }
  )
}

function mapPosition(p: EarnPositionInfo): EarnPosition {
  const balance = Number(p.currentBalance)
  return {
    vaultAddress: p.vaultAddress,
    vaultName: p.vaultName,
    asset: p.asset,
    currentBalance: p.currentBalance,
    currentApy: p.currentApy,
    shares: p.shares,
    pnl:
      p.pnl.status === "available"
        ? {
            status: "available",
            principalDeposited: p.pnl.principalDeposited,
            totalYieldEarned: p.pnl.totalYieldEarned,
          }
        : p.pnl.status === "pending"
          ? { status: "pending" }
          : { status: "unavailable", reason: p.pnl.reason },
    hasPosition: Number.isFinite(balance) && balance > 0,
  }
}

// --- operations -----------------------------------------------------------

const RETRY_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 600

/**
 * Run an EarnKit call with a small bounded retry. Arc Testnet's RPC nodes
 * occasionally return transient `SERVICE` errors (e.g. "RPC endpoint error");
 * the SDK tags those `RETRYABLE`, meaning re-running from scratch is safe (no
 * on-chain work was committed). Only retryable failures are retried - input,
 * fatal, and partially-applied (`RESUMABLE`) errors propagate immediately.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isRetryableError(error) || attempt === RETRY_ATTEMPTS - 1)
        throw error
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_BASE_DELAY_MS * (attempt + 1))
      )
    }
  }
  throw lastError
}

export async function exploreEarnVaults(filters: ExploreFilters): Promise<{
  vaults: EarnVault[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
}> {
  const result = await withRetry(() =>
    getEarnKit().exploreVaults({
      chain: EARN_CHAIN,
      protocol: filters.protocol,
      asset: filters.asset,
      minApy: filters.minApy,
      minTvl: filters.minTvl,
      sortBy: filters.sortBy,
      page: filters.page,
      pageSize: filters.pageSize,
      config: earnConfig(),
    })
  )
  return {
    vaults: await Promise.all(
      result.vaults.map((v) => withOnChainTotalDeposits(mapVault(v)))
    ),
    pagination: result.pagination,
  }
}

export async function getEarnVault(
  vaultAddress: string
): Promise<EarnVault | null> {
  const result = await withRetry(() =>
    getEarnKit().getVaults({
      vaults: [{ chain: EARN_CHAIN, vaultAddress }],
      config: earnConfig(),
    })
  )
  const vault = result.vaults[0]
  return vault ? await withOnChainTotalDeposits(mapVault(vault)) : null
}

export async function getEarnPosition(
  address: string,
  vaultAddress: string
): Promise<EarnPosition> {
  try {
    const position = await withRetry(() =>
      getEarnKit().getPosition({
        from: earnFromContext(address),
        vaultAddress,
        config: earnConfig(),
      })
    )
    return mapPosition(position)
  } catch (error) {
    // A wallet that has never deposited has no registered position - that is an
    // empty state, not an error. Return a zeroed position so the UI can show
    // "no position yet" instead of surfacing a 400.
    if (isNoPositionError(error)) {
      return {
        vaultAddress,
        vaultName: "",
        asset: "USDC",
        currentBalance: "0",
        currentApy: 0,
        shares: "0",
        pnl: { status: "unavailable", reason: "No position yet" },
        hasPosition: false,
      }
    }
    throw error
  }
}

export async function getEarnDepositQuote(
  address: string,
  vaultAddress: string,
  amount: string
): Promise<EarnDepositQuote> {
  const q: EarnDepositQuoteInfo = await withRetry(() =>
    getEarnKit().getDepositQuote({
      from: earnFromContext(address),
      vaultAddress,
      amount,
      config: earnConfig(),
    })
  )
  return {
    kind: "deposit",
    vaultName: q.vaultName,
    deposit: mapAmount(q.deposit),
    expectedShares: mapAmount(q.expectedShares),
    sharePrice: q.sharePrice,
    currentApy: q.currentApy,
    fees: q.fees.map(mapAmount),
    gasFees: mapGasFees(q.gasFees),
  }
}

export async function getEarnWithdrawalQuote(
  address: string,
  vaultAddress: string,
  amount: string
): Promise<EarnWithdrawalQuote> {
  const q: EarnWithdrawalQuoteInfo = await withRetry(() =>
    getEarnKit().getWithdrawalQuote({
      from: earnFromContext(address),
      vaultAddress,
      amount,
      config: earnConfig(),
    })
  )
  return {
    kind: "withdraw",
    vaultName: q.vaultName,
    withdrawal: mapAmount(q.withdrawal),
    sharesToRedeem: mapAmount(q.sharesToRedeem),
    sharePrice: q.sharePrice,
    maxWithdrawable: mapAmount(q.maxWithdrawable),
    fees: q.fees.map(mapAmount),
    gasFees: mapGasFees(q.gasFees),
  }
}

export async function earnDeposit(
  address: string,
  vaultAddress: string,
  amount: string
): Promise<EarnWriteResult> {
  const result = await withRetry(() =>
    getEarnKit().deposit({
      from: earnFromContext(address),
      vaultAddress,
      amount,
      config: earnConfig(),
    })
  )
  // Same-chain deposits resolve to a confirmed on-chain result.
  if (!("txHash" in result)) {
    throw new Error("Cross-chain deposit is not supported on the Earn page.")
  }
  return {
    txHash: result.txHash,
    explorerUrl: result.explorerUrl,
    vaultAddress: result.vaultAddress,
    amount: result.amount,
  }
}

export async function earnWithdraw(
  address: string,
  vaultAddress: string,
  amount: string
): Promise<EarnWriteResult> {
  const result = await withRetry(() =>
    getEarnKit().withdraw({
      from: earnFromContext(address),
      vaultAddress,
      amount,
      config: earnConfig(),
    })
  )
  return {
    txHash: result.txHash,
    explorerUrl: result.explorerUrl,
    vaultAddress: result.vaultAddress,
    amount: result.amount,
  }
}

// Error mapping lives in `lib/earn/errors.ts` (no server-only imports, so it is
// unit-testable); re-exported here so route handlers import it alongside ops.
export { getEarnError, type EarnErrorResult } from "@/lib/earn/errors"
