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
import {
  getEarnDepositQuote,
  getEarnWithdrawalQuote,
  getEarnError,
} from "@/lib/circle/earn-ops"
import { resolveEarnWallet } from "@/lib/earn/resolve-wallet"

const bodySchema = z.object({
  action: z.enum(["deposit", "withdraw"]),
  walletId: z.string().min(1),
  vaultAddress: evmAddressSchema,
  // EarnKit takes the amount as a human-readable decimal string.
  amount: z
    .string()
    .regex(/^\d*\.?\d+$/, "Amount must be a positive decimal")
    .refine((v) => Number(v) > 0, "Amount must be greater than zero"),
})

/**
 * Preview a deposit or withdrawal before executing - expected shares / fees /
 * max withdrawable via `getDepositQuote` / `getWithdrawalQuote`.
 */
export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = await validateJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response
  const { action, walletId, vaultAddress, amount } = parsed.data

  const wallet = await resolveEarnWallet(supabase, user.id, walletId)
  if (!wallet.ok) {
    return NextResponse.json({ error: wallet.error }, { status: wallet.status })
  }

  try {
    const quote =
      action === "deposit"
        ? await getEarnDepositQuote(wallet.address, vaultAddress, amount)
        : await getEarnWithdrawalQuote(wallet.address, vaultAddress, amount)
    return NextResponse.json(quote)
  } catch (error) {
    console.error("Earn quote error:", error)
    const mapped = getEarnError(error)
    return NextResponse.json(
      { error: mapped.error, userMessage: mapped.userMessage },
      { status: mapped.status }
    )
  }
})
