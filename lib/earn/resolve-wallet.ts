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

import type { SupabaseClient } from "@supabase/supabase-js"
import { EARN_BLOCKCHAIN } from "@/lib/circle/earn-kit"

export type ResolvedEarnWallet =
  | { ok: true; address: string }
  | { ok: false; status: number; error: string }

/**
 * Resolve a Circle wallet the authenticated user owns by its
 * `circle_wallet_id`, enforcing that it lives on the only chain EarnKit's
 * alpha supports (Arc Testnet). Centralised so every Earn write/position route
 * applies the same ownership + chain guard before touching the SDK.
 */
export async function resolveEarnWallet(
  supabase: SupabaseClient,
  userId: string,
  circleWalletId: string
): Promise<ResolvedEarnWallet> {
  const { data, error } = await supabase
    .from("wallets")
    .select("address, blockchain")
    .eq("user_id", userId)
    .eq("circle_wallet_id", circleWalletId)
    .single()

  if (error || !data) {
    return { ok: false, status: 404, error: "Wallet not found" }
  }
  if (data.blockchain !== EARN_BLOCKCHAIN) {
    return {
      ok: false,
      status: 400,
      error: "Earn vaults are only available for Arc Testnet wallets",
    }
  }
  return { ok: true, address: data.address }
}

/**
 * Resolve every Arc Testnet wallet address the authenticated user owns. Used by
 * the vaults list's "Your position" column, which sums a user's holdings in
 * each vault across all their Arc wallets. Addresses are deduplicated (Circle
 * SCA wallets can share an address) so a vault position is never double-counted.
 */
export async function resolveEarnWalletAddresses(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("wallets")
    .select("address")
    .eq("user_id", userId)
    .eq("blockchain", EARN_BLOCKCHAIN)

  if (error || !data) return []
  return [...new Set(data.map((w) => w.address as string))]
}
