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
import { validateQuery, evmAddressSchema } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { getEarnPosition, getEarnError } from "@/lib/circle/earn-ops"
import { resolveEarnWallet } from "@/lib/earn/resolve-wallet"

const querySchema = z.object({
  walletId: z.string().min(1),
  vaultAddress: evmAddressSchema,
})

/** Read a wallet's position (balance, P&L, shares) in a vault via `getPosition`. */
export const GET = withAuth(async (req, { user, supabase }) => {
  const parsed = validateQuery(new URL(req.url), querySchema)
  if (!parsed.ok) return parsed.response
  const { walletId, vaultAddress } = parsed.data

  const wallet = await resolveEarnWallet(supabase, user.id, walletId)
  if (!wallet.ok) {
    return NextResponse.json({ error: wallet.error }, { status: wallet.status })
  }

  try {
    const position = await getEarnPosition(wallet.address, vaultAddress)
    return NextResponse.json(position)
  } catch (error) {
    console.error("Earn position error:", error)
    const mapped = getEarnError(error)
    return NextResponse.json(
      { error: mapped.error, userMessage: mapped.userMessage },
      { status: mapped.status }
    )
  }
})
