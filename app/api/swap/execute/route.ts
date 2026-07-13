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
import { validateJsonBody } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { CURRENCIES } from "@/lib/constants/currency"
import {
  executeSwap,
  getAppKitSwapError,
  SWAP_BLOCKCHAIN,
} from "@/lib/circle/app-kit-swap"
import { resolveSwapWallet } from "@/lib/swap/resolve-wallet"

const bodySchema = z
  .object({
    walletId: z.string().min(1),
    tokenIn: z.enum(CURRENCIES),
    tokenOut: z.enum(CURRENCIES),
    amountIn: z
      .string()
      .regex(/^\d*\.?\d+$/, "Amount must be a positive decimal")
      .refine((v) => Number(v) > 0, "Amount must be greater than zero"),
    slippageBps: z.number().int().min(0).max(10_000).default(300),
  })
  .refine((v) => v.tokenIn !== v.tokenOut, {
    message: "tokenIn and tokenOut must differ",
    path: ["tokenOut"],
  })

export const POST = withAuth(async (req, { user, supabase }) => {
  const parsed = await validateJsonBody(req, bodySchema)
  if (!parsed.ok) return parsed.response
  const { walletId, tokenIn, tokenOut, amountIn, slippageBps } = parsed.data

  const wallet = await resolveSwapWallet(supabase, user.id, walletId)
  if (!wallet.ok) {
    return NextResponse.json({ error: wallet.error }, { status: wallet.status })
  }

  try {
    const result = await executeSwap({
      walletAddress: wallet.address,
      tokenIn,
      tokenOut,
      amountIn,
      slippageBps,
    })

    const { error: insertError } = await supabase.from("transactions").insert([
      {
        user_id: user.id,
        amount: Number(amountIn),
        sender_address: wallet.address,
        recipient_address: wallet.address,
        tx_hash: result.txHash ?? null,
        blockchain: SWAP_BLOCKCHAIN,
        type: "SWAP",
        currency: tokenIn,
        status: result.txHash ? "CONFIRMED" : "PENDING",
      },
    ])
    if (insertError) {
      console.error("Failed to log swap transaction to Supabase:", insertError)
    }

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error("Swap execute error:", error)
    const mapped = getAppKitSwapError(error)
    return NextResponse.json(
      { error: mapped.error, userMessage: mapped.userMessage },
      { status: mapped.status }
    )
  }
})
