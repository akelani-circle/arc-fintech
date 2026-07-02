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

import type { UseQueryResult } from "@tanstack/react-query"
import { Skeleton } from "@/components/ui/skeleton"
import type { EarnPosition } from "@/lib/earn/types"
import { formatTokenAmount, trimAmount } from "@/lib/earn/format"

/**
 * Compact "your position" block driven by the shared `useEarnPosition` query.
 * Renders the wallet's current balance, P&L (when the provider can compute it),
 * and shares. Used inside the action panel and the vault detail page.
 */
export function EarnPositionSummary({
  query,
  asset,
}: {
  query: UseQueryResult<EarnPosition>
  asset: string
}) {
  const { data, isLoading, isError } = query

  if (isLoading) {
    return <Skeleton className="h-16 w-full" />
  }
  if (isError || !data) {
    return null
  }
  if (!data.hasPosition) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
        No position in this vault yet for the selected wallet.
      </div>
    )
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
        Your position
      </div>
      <div className="flex flex-col gap-1 text-sm">
        <Row
          label="Balance"
          value={formatTokenAmount(data.currentBalance, asset, 6)}
        />
        {data.pnl.status === "available" ? (
          <>
            <Row
              label="Principal"
              value={formatTokenAmount(data.pnl.principalDeposited, asset, 6)}
            />
            <Row
              label="Yield earned"
              value={
                <span
                  className={
                    Number(data.pnl.totalYieldEarned) >= 0
                      ? "text-emerald-600"
                      : "text-red-500"
                  }
                >
                  {formatTokenAmount(data.pnl.totalYieldEarned, asset, 6)}
                </span>
              }
            />
          </>
        ) : data.pnl.status === "pending" ? (
          <Row label="P&L" value={<span className="text-muted-foreground">Calculating...</span>} />
        ) : (
          <Row label="P&L" value={<span className="text-muted-foreground">Unavailable</span>} />
        )}
        <Row label="Shares" value={trimAmount(data.shares, 6)} />
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
