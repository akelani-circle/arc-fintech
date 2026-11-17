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
import { circleDeveloperSdk } from "@/lib/circle/developer-controlled-wallets-client"
import { toTransactionStatus } from "@/lib/circle/webhook-events"

/** Circle's view of one transaction: just what settling a row needs. */
export type CircleTransactionLookup = (
  id: string
) => Promise<{ state?: string; txHash?: string } | undefined>

const lookupCircleTransaction: CircleTransactionLookup = async (id) => {
  const response = await circleDeveloperSdk.getTransaction({ id })
  return response.data?.transaction
}

/** Rows settled per call, so a backlog can't stall the page that triggers it. */
const MAX_ROWS_PER_CALL = 10

/**
 * Settle the user's Earn writes that are still PENDING under a Circle
 * transaction id (written when EarnKit gave up waiting, see write-route.ts) by
 * asking Circle for their state.
 *
 * The transactions.* webhook normally does this, but deliveries can be lost
 * (endpoint down, subscription disabled) and Circle has no way to re-send
 * them, so without this such a row stayed PENDING forever. Run from the Earn
 * read routes; a no-op (one indexed query) when nothing is pending. Never
 * throws: a failed lookup leaves the row for the next call.
 */
export async function settlePendingEarnWrites(
  supabase: SupabaseClient,
  userId: string,
  lookup: CircleTransactionLookup = lookupCircleTransaction
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("transactions")
    .select("id, circle_transaction_id")
    .eq("user_id", userId)
    .eq("status", "PENDING")
    .in("type", ["EARN_DEPOSIT", "EARN_WITHDRAW"])
    .not("circle_transaction_id", "is", null)
    .limit(MAX_ROWS_PER_CALL)

  if (error) {
    console.error("Failed to read pending Earn writes:", error)
    return
  }

  for (const row of rows ?? []) {
    try {
      const tx = await lookup(row.circle_transaction_id as string)
      const status = toTransactionStatus(tx?.state)
      if (!status) continue // still in flight

      const { error: updateError } = await supabase
        .from("transactions")
        .update({
          status,
          ...(tx?.txHash ? { tx_hash: tx.txHash } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "PENDING")
      if (updateError) {
        console.error(`Failed to settle Earn write ${row.id}:`, updateError)
      }
    } catch (lookupError) {
      console.error(
        `Failed to look up Circle transaction ${row.circle_transaction_id}:`,
        lookupError
      )
    }
  }
}
