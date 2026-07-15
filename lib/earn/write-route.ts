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

import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import type { SupabaseClient, User } from "@supabase/supabase-js"
import { validateJsonBody, evmAddressSchema } from "@/lib/api/validate"
import { earnDeposit, earnWithdraw, getEarnError } from "@/lib/circle/earn-ops"
import { resolveEarnWallet } from "@/lib/earn/resolve-wallet"
import { EARN_BLOCKCHAIN } from "@/lib/circle/earn-kit"

const bodySchema = z.object({
  walletId: z.string().min(1),
  vaultAddress: evmAddressSchema,
  amount: z
    .string()
    .regex(/^\d*\.?\d+$/, "Amount must be a positive decimal")
    .refine((v) => Number(v) > 0, "Amount must be greater than zero"),
})

/**
 * Shared body for the deposit and withdraw routes. Both validate the same
 * input, resolve + chain-guard the Circle wallet, run the EarnKit write, then
 * log the confirmed transaction to the activity feed. The only differences are
 * which SDK op runs and how the sender/recipient/type columns are oriented:
 * a deposit moves USDC wallet -> vault, a withdrawal moves it vault -> wallet.
 */
export async function handleEarnWrite(
  action: "deposit" | "withdraw",
  req: NextRequest,
  { user, supabase }: { user: User; supabase: SupabaseClient }
) {
  const parsed = await validateJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response
  const { walletId, vaultAddress, amount } = parsed.data

  const wallet = await resolveEarnWallet(supabase, user.id, walletId)
  if (!wallet.ok) {
    return NextResponse.json({ error: wallet.error }, { status: wallet.status })
  }

  try {
    const result =
      action === "deposit"
        ? await earnDeposit(wallet.address, vaultAddress, amount)
        : await earnWithdraw(wallet.address, vaultAddress, amount)

    const isDeposit = action === "deposit"
    const { error: insertError } = await supabase.from("transactions").insert([
      {
        user_id: user.id,
        amount: Number(result.amount),
        sender_address: isDeposit ? wallet.address : vaultAddress,
        recipient_address: isDeposit ? vaultAddress : wallet.address,
        tx_hash: result.txHash,
        blockchain: EARN_BLOCKCHAIN,
        type: isDeposit ? "EARN_DEPOSIT" : "EARN_WITHDRAW",
        // EarnKit resolves same-chain writes to a confirmed on-chain tx, so the
        // row is logged as CONFIRMED rather than waiting on a webhook.
        status: "CONFIRMED",
      },
    ])
    if (insertError) {
      console.error("Failed to log earn transaction to Supabase:", insertError)
    }

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error(`Earn ${action} error:`, error)
    const mapped = getEarnError(error)
    return NextResponse.json(
      { error: mapped.error, userMessage: mapped.userMessage },
      { status: mapped.status }
    )
  }
}
