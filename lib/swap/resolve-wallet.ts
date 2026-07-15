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
import { SWAP_BLOCKCHAIN } from "@/lib/circle/app-kit-swap"

export type ResolvedSwapWallet =
  | { ok: true; address: string }
  | { ok: false; status: number; error: string }

/**
 * Resolve a Circle wallet the authenticated user owns by its
 * `circle_wallet_id`, enforcing the same guards Earn's `resolveEarnWallet`
 * applies: the wallet must live on Arc Testnet (the only chain App Kit's
 * `SwapChain` supports among this app's chains), and it must not be a
 * `gateway_signer` wallet — those are signing-only EOAs, never a user-facing
 * balance to swap from.
 */
export async function resolveSwapWallet(
  supabase: SupabaseClient,
  userId: string,
  circleWalletId: string
): Promise<ResolvedSwapWallet> {
  const { data, error } = await supabase
    .from("wallets")
    .select("address, blockchain, type")
    .eq("user_id", userId)
    .eq("circle_wallet_id", circleWalletId)
    .single()

  if (error || !data) {
    return { ok: false, status: 404, error: "Wallet not found" }
  }
  if (data.type === "gateway_signer") {
    return {
      ok: false,
      status: 400,
      error: "Gateway signer wallets cannot be used for swaps",
    }
  }
  if (data.blockchain !== SWAP_BLOCKCHAIN) {
    return {
      ok: false,
      status: 400,
      error: "Swaps are only available for Arc Testnet wallets",
    }
  }
  return { ok: true, address: data.address }
}
