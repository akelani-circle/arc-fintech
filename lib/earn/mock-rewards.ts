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
 * MOCK — client-only. EarnKit's Merkl-based reward incentives do not exist on
 * Arc Testnet: the developer docs state "claimRewards and getClaimRewardsQuote
 * — Merkl reward epochs do not fire on testnet", so `getPosition` never returns
 * accrued rewards and there is nothing to claim on-chain. To demo the reward
 * experience anyway, this module fabricates an accrued-rewards balance from data
 * we *do* have on testnet — the wallet's real vault balance, the vault's real
 * reward APY, and the real deposit timestamp — and fakes the claim as a local
 * reset. It is deliberately self-contained and free of any on-chain / SDK call
 * so it can be deleted wholesale once Arc Mainnet ships real Merkl rewards.
 */

"use client"

import * as React from "react"
import type { EarnPosition, EarnVault } from "@/lib/earn/types"
import type { EarnTx } from "@/lib/earn/use-earn"

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60
const TICK_MS = 5_000

/**
 * Decimals used to render accrued reward amounts. Reward accrual is slow, so
 * this is deliberately fine (micro-unit, matching USDC's smallest unit) to keep
 * the ticking figure visible rather than rounding it to a flat 0.
 */
export const REWARD_DISPLAY_DECIMALS = 6

/**
 * Smallest accrued amount worth claiming: half a display unit — the point at
 * which the rounded display first shows a nonzero value. Deriving the claim
 * threshold from the display precision this way keeps the two in exact lockstep,
 * so the Claim button enables on the same tick the row first reads nonzero
 * (never showing a nonzero amount while still disabled, or vice versa).
 */
export const CLAIM_MIN_ACCRUED = 0.5 * 10 ** -REWARD_DISPLAY_DECIMALS

/**
 * Reward APY used only when a vault advertises no reward incentive at all
 * (no `rewards[]` and `currentApy <= nativeApy`). Keeps the demo showing
 * something plausible rather than an empty reward panel on every testnet vault.
 */
const FALLBACK_REWARD_APY = 0.015
const FALLBACK_REWARD_TOKEN = "ARC"

/**
 * How long a position is assumed to have been earning when we can't find a
 * deposit in the user's activity history (e.g. deposited before this feature,
 * or from a wallet whose rows aren't loaded). A few days of accrual reads as
 * realistic instead of "0.0000".
 */
const DEFAULT_ACCRUAL_DAYS = 3

export interface MockRewardToken {
  token: string
  /** Reward-incentive APY as a decimal (0.015 = 1.5%). */
  apy: number
  /** Fabricated accrued amount in the reward token, since the accrual start. */
  accrued: number
}

export interface MockRewards {
  tokens: MockRewardToken[]
  /** Sum of accrued amounts across reward tokens. */
  totalAccrued: number
  /** True when there is a nonzero balance worth claiming. */
  canClaim: boolean
  /** Fake "claim": resets the accrual clock locally and pops nothing itself. */
  claim: () => void
}

/**
 * Resolve the reward token(s) + APY a vault advertises. Prefers the real
 * `vault.rewards[]` metadata; falls back to the incentive spread
 * (`currentApy - nativeApy`) when the list is empty but the vault clearly pays
 * an incentive; falls back again to a small default so the demo always has a
 * reward to show. Exported for unit testing.
 */
export function resolveRewardApys(
  vault: Pick<EarnVault, "rewards" | "currentApy" | "nativeApy">
): { token: string; apy: number }[] {
  if (vault.rewards.length > 0) {
    return vault.rewards.map((r) => ({ token: r.token, apy: r.apy }))
  }
  const spread = vault.currentApy - vault.nativeApy
  if (spread > 0.0001) {
    return [{ token: FALLBACK_REWARD_TOKEN, apy: spread }]
  }
  return [{ token: FALLBACK_REWARD_TOKEN, apy: FALLBACK_REWARD_APY }]
}

/**
 * Accrued reward amount for one token: `balance × apy × (elapsed / year)`.
 * A flat, non-compounding approximation — enough to look like a live-ticking
 * incentive without pretending to model Merkl epochs. Never negative.
 */
export function computeAccrued(
  balance: number,
  apy: number,
  startMs: number,
  nowMs: number
): number {
  if (!Number.isFinite(balance) || balance <= 0 || apy <= 0) return 0
  const elapsedSeconds = Math.max(0, (nowMs - startMs) / 1000)
  return balance * apy * (elapsedSeconds / SECONDS_PER_YEAR)
}

/** Earliest EARN_DEPOSIT timestamp (ms) for a vault, or null if none found. */
function earliestDepositMs(rows: EarnTx[] | undefined): number | null {
  if (!rows || rows.length === 0) return null
  const deposits = rows.filter((r) => r.type === "EARN_DEPOSIT")
  if (deposits.length === 0) return null
  return Math.min(...deposits.map((r) => new Date(r.created_at).getTime()))
}

function claimStorageKey(walletId: string, vaultAddress: string): string {
  return `earn:mock-rewards:claimed:${walletId}:${vaultAddress.toLowerCase()}`
}

function readClaimedAt(key: string): number | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/**
 * Fabricate a live-ticking accrued-rewards balance for a wallet's position in a
 * vault, plus a fake `claim()` that resets the accrual clock. Returns zeroed
 * rewards (and `canClaim: false`) whenever there is no active position.
 *
 * The accrual clock starts at the later of the wallet's first deposit and the
 * last local claim, so claiming visibly zeroes the balance and it starts
 * climbing again from ~0. Balance and reward APY are always the current real
 * values, so the number stays anchored to what the user actually holds.
 */
export function useMockRewards({
  vault,
  position,
  walletId,
  activity,
}: {
  vault: EarnVault
  position: EarnPosition | undefined
  walletId: string | null
  activity: EarnTx[] | undefined
}): MockRewards {
  const key = walletId ? claimStorageKey(walletId, vault.vaultAddress) : null

  // Local claim state, keyed by wallet+vault. Re-read from localStorage during
  // render whenever the key changes (the render-phase state-sync pattern this
  // codebase uses instead of setState-in-effect); a claim overwrites it in
  // place. Reads null on the server (no `window`), which is fine — the reward
  // rows only render once the client-side position query resolves.
  const [claimState, setClaimState] = React.useState<{
    key: string | null
    at: number | null
  }>({ key: null, at: null })
  if (claimState.key !== key) {
    setClaimState({ key, at: key ? readClaimedAt(key) : null })
  }
  const claimedAt = claimState.at

  // A ticking clock so the accrued figure visibly grows while the panel is open.
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [])

  const balance = Number(position?.currentBalance ?? 0)
  const hasPosition = !!position?.hasPosition && balance > 0

  const depositMs = earliestDepositMs(activity)
  const defaultStart = now - DEFAULT_ACCRUAL_DAYS * 24 * 60 * 60 * 1000
  // Start accruing from the first deposit (or a sensible default), but never
  // before the last local claim.
  const startMs = Math.max(depositMs ?? defaultStart, claimedAt ?? 0)

  const apys = React.useMemo(() => resolveRewardApys(vault), [vault])

  const tokens: MockRewardToken[] = hasPosition
    ? apys.map(({ token, apy }) => ({
        token,
        apy,
        accrued: computeAccrued(balance, apy, startMs, now),
      }))
    : apys.map(({ token, apy }) => ({ token, apy, accrued: 0 }))

  const totalAccrued = tokens.reduce((sum, t) => sum + t.accrued, 0)

  // Plain function — the React Compiler memoizes it; a manual useCallback here
  // conflicts with the compiler's preserved-memoization check.
  const claim = () => {
    const ts = Date.now()
    if (key && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(key, String(ts))
      } catch {
        // Ignore quota / disabled-storage failures; the reset is best-effort.
      }
    }
    setClaimState({ key, at: ts })
  }

  return {
    tokens,
    totalAccrued,
    // Enable only once at least one displayable unit has accrued, so the button
    // never goes live for an amount that still renders as 0.
    canClaim: hasPosition && totalAccrued >= CLAIM_MIN_ACCRUED,
    claim,
  }
}
