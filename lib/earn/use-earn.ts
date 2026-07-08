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

"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/lib/supabase/client"
import type {
  EarnVault,
  EarnVaultsResponse,
  EarnPosition,
  EarnPositionsResponse,
  EarnQuote,
} from "@/lib/earn/types"

/** A user's own deposit/withdraw row for a vault, from the transactions table. */
export interface EarnTx {
  id: string
  amount: number
  type: "EARN_DEPOSIT" | "EARN_WITHDRAW"
  tx_hash: string | null
  created_at: string
}

export interface EarnVaultFilters {
  protocol?: string
  asset?: string
  minApy?: string
  sortBy?: "apy" | "tvl" | "name"
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.userMessage || data.error || "Request failed")
  }
  return data as T
}

/** Query keys for the Earn feature, so mutations can target invalidations. */
export const earnKeys = {
  all: ["earn"] as const,
  vaults: (filters: EarnVaultFilters) => ["earn", "vaults", filters] as const,
  vault: (vaultAddress: string) => ["earn", "vault", vaultAddress] as const,
  position: (walletId: string | null, vaultAddress: string) =>
    ["earn", "position", walletId, vaultAddress] as const,
  positions: (vaultAddresses: string[]) =>
    ["earn", "positions", vaultAddresses] as const,
  activity: (vaultAddress: string) =>
    ["earn", "activity", vaultAddress] as const,
}

export function useEarnVaults(filters: EarnVaultFilters) {
  return useQuery({
    queryKey: earnKeys.vaults(filters),
    queryFn: () => {
      const params = new URLSearchParams()
      if (filters.protocol) params.set("protocol", filters.protocol)
      if (filters.asset) params.set("asset", filters.asset)
      if (filters.minApy) params.set("minApy", filters.minApy)
      if (filters.sortBy) params.set("sortBy", filters.sortBy)
      const qs = params.toString()
      return getJson<EarnVaultsResponse>(`/api/earn/vaults${qs ? `?${qs}` : ""}`)
    },
  })
}

/**
 * Summed "Your position" balances for a set of vaults, aggregated server-side
 * across all the user's Arc wallets. Keyed by lowercased vault address; a
 * missing key means no position. Sorted address list keeps the query key
 * stable regardless of the vaults' incoming order.
 */
export function useEarnPositions(vaultAddresses: string[]) {
  const sorted = [...vaultAddresses].sort()
  return useQuery({
    queryKey: earnKeys.positions(sorted),
    queryFn: async () => {
      const res = await fetch("/api/earn/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaults: sorted }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.userMessage || data.error || "Request failed")
      }
      return data as EarnPositionsResponse
    },
    enabled: sorted.length > 0,
    // Positions move per block; keep fresh but not chatty, matching useEarnPosition.
    staleTime: 15_000,
  })
}

export function useEarnVault(vaultAddress: string) {
  return useQuery({
    queryKey: earnKeys.vault(vaultAddress),
    queryFn: () => getJson<EarnVault>(`/api/earn/vaults/${vaultAddress}`),
    enabled: /^0x[a-fA-F0-9]{40}$/.test(vaultAddress),
  })
}

export function useEarnPosition(
  walletId: string | null,
  vaultAddress: string
) {
  return useQuery({
    queryKey: earnKeys.position(walletId, vaultAddress),
    queryFn: () =>
      getJson<EarnPosition>(
        `/api/earn/position?walletId=${encodeURIComponent(
          walletId as string
        )}&vaultAddress=${vaultAddress}`
      ),
    enabled: !!walletId && /^0x[a-fA-F0-9]{40}$/.test(vaultAddress),
    // A position can move on every block; keep it fresh but not chatty.
    staleTime: 15_000,
  })
}

/**
 * The authenticated user's own deposit/withdraw history for a single vault,
 * read from Supabase (RLS scopes rows to the user). Deposits log the vault as
 * recipient and withdrawals log it as sender, so we match either side. Shared
 * by the Activity tab and the mock-rewards accrual clock, keyed so both read
 * one cached result.
 */
export function useEarnActivity(vaultAddress: string) {
  return useQuery({
    queryKey: earnKeys.activity(vaultAddress),
    queryFn: async (): Promise<EarnTx[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("transactions")
        .select("id, amount, type, tx_hash, created_at")
        .in("type", ["EARN_DEPOSIT", "EARN_WITHDRAW"])
        .or(
          `sender_address.ilike.${vaultAddress},recipient_address.ilike.${vaultAddress}`
        )
        .order("created_at", { ascending: false })
        .limit(25)

      if (error) throw error
      return (data ?? []) as EarnTx[]
    },
  })
}

/** One-shot quote fetch used by the action panel's debounced effect. */
export async function fetchEarnQuote(body: {
  action: "deposit" | "withdraw"
  walletId: string
  vaultAddress: string
  amount: string
}): Promise<EarnQuote> {
  const res = await fetch("/api/earn/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.userMessage || data.error || "Quote failed")
  }
  return data as EarnQuote
}
