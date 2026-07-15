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

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { useBalanceContext } from "@/lib/contexts/balance-context"
import { shortenAddress, getExplorerUrl } from "@/lib/utils/data-formatters"
import { otherCurrency } from "@/lib/constants/currency"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  PENDING: "secondary",
  CONFIRMED: "default",
  COMPLETE: "default",
  FAILED: "destructive",
}

export function SwapHistory() {
  // SwapHistory only ever renders on /dashboard/swap, which is always
  // wrapped by BalanceProviderWrapper (see app/dashboard/layout.tsx).
  const { transactions } = useBalanceContext()

  const swaps = transactions
    .filter((tx) => tx.type === "SWAP")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="w-full max-w-2xl rounded-xl border bg-card">
      <div className="border-b p-4">
        <h2 className="text-lg font-semibold">Swap history</h2>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pair</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Wallet</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {swaps.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">
                No swaps yet.
              </TableCell>
            </TableRow>
          ) : (
            swaps.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="font-medium">
                  {tx.currency} → {otherCurrency(tx.currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {tx.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                  {tx.currency}
                </TableCell>
                <TableCell>
                  {tx.tx_hash ? (
                    <a
                      href={getExplorerUrl(tx.blockchain, tx.tx_hash, "tx")}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs text-muted-foreground hover:underline"
                    >
                      {shortenAddress(tx.sender_address, 4)}
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {shortenAddress(tx.sender_address, 4)}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[tx.status] ?? "secondary"} className="font-normal">
                    {tx.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {new Date(tx.created_at).toLocaleString()}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
