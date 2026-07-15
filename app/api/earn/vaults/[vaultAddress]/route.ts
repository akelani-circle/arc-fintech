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
import { createClient } from "@/lib/supabase/server"
import { getEarnVault, getEarnError } from "@/lib/circle/earn-ops"

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/

/**
 * Fetch a single vault's live metadata via EarnKit's `getVaults` batch lookup.
 * Auth is inline (not the `withAuth` wrapper) because this route needs Next.js
 * dynamic-segment `params`, which the wrapper does not forward.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ vaultAddress: string }> }
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { vaultAddress } = await params
  if (!ADDRESS_RE.test(vaultAddress)) {
    return NextResponse.json({ error: "Invalid vault address" }, { status: 400 })
  }

  try {
    const vault = await getEarnVault(vaultAddress)
    if (!vault) {
      return NextResponse.json({ error: "Vault not found" }, { status: 404 })
    }
    return NextResponse.json(vault)
  } catch (error) {
    console.error("Earn vault detail error:", error)
    const mapped = getEarnError(error)
    return NextResponse.json(
      { error: mapped.error, userMessage: mapped.userMessage },
      { status: mapped.status }
    )
  }
}
