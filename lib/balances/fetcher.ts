/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import {
  ChainBalances,
  EMPTY_CHAIN_BALANCES,
  Wallet,
} from "./types"

type ChainBalanceItem = {
  chain: keyof ChainBalances | string
  balance: number
}

type GatewayBalanceWalletResult = {
  gatewayTotal?: number
  chainBalances?: ChainBalanceItem[]
}

type GatewayBalanceResponse = {
  balances?: GatewayBalanceWalletResult[]
}

export type GatewayBalanceSummary = {
  totals: ChainBalances
  grandTotal: number
}

/**
 * Calls `/api/gateway/balance` and aggregates the per-wallet totals into the
 * shape the UI expects. Returns an empty summary if no wallets are passed.
 */
export async function fetchGatewayBalance(
  wallets: Wallet[]
): Promise<GatewayBalanceSummary> {
  if (!wallets || wallets.length === 0) {
    return { totals: { ...EMPTY_CHAIN_BALANCES }, grandTotal: 0 }
  }

  const addresses = wallets.map((w) => w.address)
  const res = await fetch("/api/gateway/balance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses }),
  })
  if (!res.ok) throw new Error("Failed to fetch gateway balance")

  const data: GatewayBalanceResponse = await res.json()
  const totals: ChainBalances = { ...EMPTY_CHAIN_BALANCES }
  let grandTotal = 0

  if (data.balances && Array.isArray(data.balances)) {
    data.balances.forEach((walletResult) => {
      grandTotal += walletResult.gatewayTotal || 0

      if (walletResult.chainBalances && Array.isArray(walletResult.chainBalances)) {
        walletResult.chainBalances.forEach((cb) => {
          if (totals[cb.chain as keyof ChainBalances] !== undefined) {
            totals[cb.chain as keyof ChainBalances] += cb.balance
          }
        })
      }
    })
  }

  return { totals, grandTotal }
}

/**
 * Calls `/api/wallet/balance` for a set of wallets and returns the raw
 * `{ [walletId]: balanceString }` map. Caller is responsible for merging with
 * any prior balances and computing per-address totals.
 */
export async function fetchWalletBalance(
  wallets: Wallet[]
): Promise<Record<string, string>> {
  if (!wallets || wallets.length === 0) return {}

  const walletIds = wallets.map((w) => w.circle_wallet_id)
  const res = await fetch("/api/wallet/balance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletIds }),
  })
  if (!res.ok) throw new Error("Failed to fetch wallet balance")

  return (await res.json()) as Record<string, string>
}

/**
 * Computes a deduplicated USDC total across wallets given the raw balance
 * map. We collapse to one entry per (address, chain) so the same wallet
 * isn't counted multiple times when several wallet IDs share an address.
 */
export function computeWalletTotal(
  wallets: Wallet[],
  balances: Record<string, string>
): number {
  const walletKey = new Map<string, number>()
  wallets.forEach((wallet) => {
    const balance = balances[wallet.circle_wallet_id]
    if (typeof balance !== "string") return
    const numericPart = balance.split(" ")[0].replace(/[$,]/g, "")
    const num = parseFloat(numericPart)
    if (Number.isNaN(num)) return
    const key = `${wallet.address.toLowerCase()}-${wallet.blockchain}`
    const existing = walletKey.get(key) || 0
    walletKey.set(key, Math.max(existing, num))
  })
  return Array.from(walletKey.values()).reduce((total, bal) => total + bal, 0)
}
