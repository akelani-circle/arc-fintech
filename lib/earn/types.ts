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
 * Client-safe, JSON-serializable shapes for the Earn feature. These mirror the
 * fields the UI consumes from `@circle-fin/earn-kit` results, with every
 * `Amount` already rendered as a human-readable decimal string by the SDK's
 * kit-level (`Earn*`) types. Kept free of any server-only SDK import so client
 * components can reference the types without pulling the adapter into the
 * browser bundle.
 */

export type EarnVaultStatus = "active" | "low_liquidity"
export type EarnWarningLevel = "YELLOW" | "RED"

export interface EarnReward {
  token: string
  apy: number
}

export interface EarnCollateral {
  asset: string
  assetAddress: string
  /** Liquidation loan-to-value ratio, e.g. 0.86 = 86%. */
  lltv: number
  /** Approximate supplied value in USD. */
  supplyUsd: number
}

export interface EarnWarning {
  type: string
  level: EarnWarningLevel
}

/** A vault row, used both in the discovery list and the detail header. */
export interface EarnVault {
  vaultAddress: string
  name: string
  protocol: string
  asset: string
  assetAddress: string
  /** Total APY incl. reward incentives, as a decimal (0.0497 = 4.97%). */
  currentApy: number
  /** Native APY excluding reward incentives. */
  nativeApy: number
  /** Vault fee as a decimal (0.05 = 5%). */
  vaultFee: number
  /** Human-readable decimal string. */
  totalDeposits: string
  /** Human-readable decimal string. */
  liquidity: string
  status: EarnVaultStatus
  /** On Circle's curated Circle-guarded list. */
  circleGuarded: boolean
  rewards: EarnReward[]
  collateral: EarnCollateral[]
  warnings: EarnWarning[]
}

export interface EarnVaultsResponse {
  vaults: EarnVault[]
  pagination: {
    page: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
  /** Whether the server is running EarnKit in permissioned (Kit Key) mode. */
  permissioned: boolean
}

export type EarnPnl =
  | { status: "available"; principalDeposited: string; totalYieldEarned: string }
  | { status: "pending" }
  | { status: "unavailable"; reason: string }

export interface EarnPosition {
  vaultAddress: string
  vaultName: string
  asset: string
  /** Current withdrawable value as a decimal string. */
  currentBalance: string
  currentApy: number
  shares: string
  pnl: EarnPnl
  /** Convenience flag: true when currentBalance parses to > 0. */
  hasPosition: boolean
}

/**
 * A user's summed holdings in a single vault, aggregated across every Arc
 * Testnet wallet they own. Feeds the vaults list's "Your position" column.
 */
export interface EarnVaultHolding {
  /** Summed withdrawable balance as a decimal string (USDC ~ $1). */
  balance: string
  /** True when the summed balance is > 0 in at least one wallet. */
  hasPosition: boolean
}

export interface EarnPositionsResponse {
  /** Keyed by lowercased vault address. Absent keys mean no position. */
  holdings: Record<string, EarnVaultHolding>
}

export interface EarnAmount {
  symbol: string
  amount: string
  /** Fee category tag (e.g. "FORWARD") when present on fee entries. */
  type?: string
}

export interface EarnGasFee {
  /** The earn step being estimated, e.g. "Approve", "Deposit". */
  name: string
  /** Native gas token symbol, e.g. "USDC" on Arc. */
  token: string
  /** Total estimated fee in the token's base units (wei), or null on failure. */
  fee: string | null
  error?: string
}

export interface EarnDepositQuote {
  kind: "deposit"
  vaultName: string
  deposit: EarnAmount
  expectedShares: EarnAmount
  sharePrice: string
  currentApy: number
  fees: EarnAmount[]
  gasFees: EarnGasFee[]
}

export interface EarnWithdrawalQuote {
  kind: "withdraw"
  vaultName: string
  withdrawal: EarnAmount
  sharesToRedeem: EarnAmount
  sharePrice: string
  maxWithdrawable: EarnAmount
  fees: EarnAmount[]
  gasFees: EarnGasFee[]
}

export type EarnQuote = EarnDepositQuote | EarnWithdrawalQuote

export interface EarnWriteResult {
  txHash: string
  explorerUrl: string
  vaultAddress: string
  amount: string
}
