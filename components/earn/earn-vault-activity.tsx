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

"use client"

import { useQuery } from "@tanstack/react-query"
import { IconArrowDownLeft, IconArrowUpRight } from "@tabler/icons-react"

import { createClient } from "@/lib/supabase/client"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { earnKeys } from "@/lib/earn/use-earn"
import { getExplorerUrl } from "@/lib/utils/data-formatters"
import { formatTokenAmount } from "@/lib/earn/format"
import { formatDate } from "@/lib/utils/data-formatters"

type EarnTx = {
  id: string
  amount: number
  type: "EARN_DEPOSIT" | "EARN_WITHDRAW"
  tx_hash: string | null
  created_at: string
}

/**
 * The authenticated user's own deposit/withdraw history for a single vault,
 * read from Supabase (RLS scopes rows to the user). Deposits are logged with
 * the vault as the recipient and withdrawals with the vault as the sender, so
 * we match either side.
 */
export function EarnVaultActivity({
  vaultAddress,
  asset,
}: {
  vaultAddress: string
  asset: string
}) {
  // react-query caches the result by vault address, so switching away from the
  // Activity tab and back (Radix unmounts inactive panels) reads the cache
  // instead of re-querying Supabase and flashing skeletons each time.
  const { data: rows } = useQuery({
    queryKey: earnKeys.activity(vaultAddress),
    queryFn: async (): Promise<EarnTx[]> => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("transactions")
        .select("id, amount, type, tx_hash, created_at")
        .in("type", ["EARN_DEPOSIT", "EARN_WITHDRAW"])
        .or(
          `sender_address.ilike.${vaultAddress},recipient_address.ilike.${vaultAddress}`
        )
        .order("created_at", { ascending: false })
        .limit(25)

      if (error) throw error
      return (data ?? []) as EarnTx[]
    },
  })

  if (rows === undefined) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        You have no deposits or withdrawals in this vault yet.
      </div>
    )
  }

  return (
    <div className="rounded-xl border divide-y">
      {rows.map((tx) => {
        const isDeposit = tx.type === "EARN_DEPOSIT"
        return (
          <div key={tx.id} className="flex items-center justify-between gap-4 p-3">
            <div className="flex items-center gap-3">
              <div className="bg-muted flex size-9 items-center justify-center rounded-lg">
                {isDeposit ? (
                  <IconArrowDownLeft className="size-4 text-emerald-600" />
                ) : (
                  <IconArrowUpRight className="size-4 text-blue-600" />
                )}
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {isDeposit ? "Deposit" : "Withdraw"}
                </span>
                <span className="text-muted-foreground text-xs">
                  {formatDate(tx.created_at)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">
                {formatTokenAmount(tx.amount, asset, 2)}
              </span>
              {tx.tx_hash ? (
                <a
                  href={getExplorerUrl("ARC-TESTNET", tx.tx_hash, "tx")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary text-xs underline"
                >
                  tx
                </a>
              ) : (
                <Badge variant="outline" className="font-normal">
                  pending
                </Badge>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
