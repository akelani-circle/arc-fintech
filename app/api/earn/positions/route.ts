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

import { NextResponse } from "next/server"
import { z } from "zod"
import { validateJsonBody, evmAddressSchema } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { sumEarnHoldingsOnChain, type EarnHoldingPair } from "@/lib/circle/earn-ops"
import { resolveEarnWalletAddresses } from "@/lib/earn/resolve-wallet"
import { EARN_BLOCKCHAIN } from "@/lib/circle/earn-kit"
import type { EarnPositionsResponse } from "@/lib/earn/types"

// Bounded so a caller cannot fan reads out over an unbounded vault list; the
// list page fetches a single page of vaults, well under this cap.
const bodySchema = z.object({
  vaults: z.array(evmAddressSchema).min(1).max(100),
})

/**
 * Summed "Your position" balances for the vaults list.
 *
 * Cost is proportional to the user's *real* activity, not vaults x wallets:
 *  1. Prune (DB) - every earn deposit/withdraw is logged to `transactions` with
 *     the vault on one side and the funding wallet on the other, so one query
 *     yields the exact (vault, wallet) pairs the user has ever transacted.
 *  2. Read (on-chain) - `sumEarnHoldingsOnChain` reads those pairs' ERC-4626
 *     share balances directly, batched into a single RPC round trip. This never
 *     touches EarnKit's metered API, so it cannot burn its rate limit.
 *
 * Blind spot: positions opened outside this app aren't in `transactions`, so
 * they won't show a balance here - an acceptable trade for a summary column,
 * and the on-chain read is exact for everything the app did create.
 */
export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = await validateJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response

  const vaultSet = new Set(parsed.data.vaults.map((v) => v.toLowerCase()))
  const walletSet = new Set(
    (await resolveEarnWalletAddresses(supabase, user.id)).map((a) =>
      a.toLowerCase()
    )
  )

  const empty: EarnPositionsResponse = { holdings: {} }
  if (walletSet.size === 0) return NextResponse.json(empty)

  const { data: txns, error } = await supabase
    .from("transactions")
    .select("sender_address, recipient_address")
    .eq("user_id", user.id)
    .eq("blockchain", EARN_BLOCKCHAIN)
    .in("type", ["EARN_DEPOSIT", "EARN_WITHDRAW"])

  if (error) {
    console.error("Earn positions: failed to read transactions:", error)
    return NextResponse.json(empty)
  }

  // Build the deduplicated (vault, wallet) pair set. Either address can be the
  // vault depending on deposit vs. withdraw, so we key off set membership rather
  // than the row's type: the side in the requested vaults is the vault, the side
  // the user owns is the wallet.
  const pairs = new Map<string, EarnHoldingPair>()
  for (const t of txns ?? []) {
    const a = (t.sender_address ?? "").toLowerCase()
    const b = (t.recipient_address ?? "").toLowerCase()
    let vaultAddress: string | null = null
    let walletAddress: string | null = null
    if (vaultSet.has(a) && walletSet.has(b)) {
      vaultAddress = a
      walletAddress = b
    } else if (vaultSet.has(b) && walletSet.has(a)) {
      vaultAddress = b
      walletAddress = a
    }
    if (vaultAddress && walletAddress) {
      pairs.set(`${vaultAddress}|${walletAddress}`, {
        vaultAddress,
        walletAddress,
      })
    }
  }

  const holdings = await sumEarnHoldingsOnChain([...pairs.values()])
  return NextResponse.json({ holdings } satisfies EarnPositionsResponse)
})
