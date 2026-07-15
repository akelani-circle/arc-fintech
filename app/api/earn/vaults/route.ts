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
import { validateQuery } from "@/lib/api/validate"
import { withAuth } from "@/lib/api/with-auth"
import { exploreEarnVaults, getEarnError } from "@/lib/circle/earn-ops"
import { earnConfig } from "@/lib/circle/earn-kit"
import type { EarnVaultsResponse } from "@/lib/earn/types"

const querySchema = z.object({
  protocol: z.string().min(1).optional(),
  asset: z.string().min(1).optional(),
  minApy: z.string().regex(/^\d*\.?\d+$/, "minApy must be a decimal").optional(),
  minTvl: z.string().regex(/^\d+$/, "minTvl must be an integer").optional(),
  sortBy: z.enum(["apy", "tvl", "name"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(100).max(500).optional(),
})

/** Discover USDC vaults on Arc Testnet via EarnKit's `exploreVaults`. */
export const GET = withAuth(async (req) => {
  const parsed = validateQuery(new URL(req.url), querySchema)
  if (!parsed.ok) return parsed.response

  try {
    const { vaults, pagination } = await exploreEarnVaults(parsed.data)
    const body: EarnVaultsResponse = {
      vaults,
      pagination,
      permissioned: earnConfig() !== undefined,
    }
    return NextResponse.json(body)
  } catch (error) {
    console.error("Earn vaults error:", error)
    const mapped = getEarnError(error)
    return NextResponse.json(
      { error: mapped.error, userMessage: mapped.userMessage },
      { status: mapped.status }
    )
  }
})
