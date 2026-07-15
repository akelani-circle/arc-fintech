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

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  IconSearch,
  IconShieldCheck,
  IconSparkles,
  IconAlertTriangle,
  IconArrowUp,
  IconArrowDown,
  IconArrowsSort,
} from "@tabler/icons-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useEarnVaults, useEarnPositions } from "@/lib/earn/use-earn"
import { useHeaderContent } from "@/lib/contexts/header-title-context"
import { formatApy, formatCompactUsd } from "@/lib/earn/format"
import { shortenAddress } from "@/lib/utils/data-formatters"

// Sortable columns. Sorting is client-side over the fetched page so the arrows
// can cycle asc -> desc -> none; "none" falls back to the server's default order
// (EarnKit's `exploreVaults` sorts by TVL and exposes no direction control).
type SortKey = "name" | "deposits" | "position" | "liquidity" | "apy"
type SortConfig = { key: SortKey | null; direction: "asc" | "desc" | null }

export default function EarnVaultsPage() {
  const router = useRouter()
  const [search, setSearch] = React.useState("")
  const [sortConfig, setSortConfig] = React.useState<SortConfig>({
    key: null,
    direction: null,
  })

  // Asset is fixed to USDC - the only deposit asset this app funds wallets in.
  const { data, isLoading, isError, error } = useEarnVaults({ asset: "USDC" })

  // "Your position" per vault, summed across the user's Arc wallets server-side.
  // Keyed off the full fetched page (not the filtered/sorted view) so the query
  // key stays stable while the user searches or re-sorts.
  const vaultAddresses = React.useMemo(
    () => (data?.vaults ?? []).map((v) => v.vaultAddress),
    [data?.vaults]
  )
  const { data: positionsData, isLoading: positionsLoading } =
    useEarnPositions(vaultAddresses)
  const holdings = positionsData?.holdings

  const handleSort = (key: SortKey) => {
    setSortConfig((current) => {
      if (current.key === key) {
        if (current.direction === "asc") return { key, direction: "desc" }
        if (current.direction === "desc") return { key: null, direction: null }
      }
      return { key, direction: "asc" }
    })
  }

  // Client-side name search + tri-state column sort on top of the server query,
  // so both feel instant without a round-trip per keystroke or click.
  const vaults = React.useMemo(() => {
    let result = data?.vaults ?? []
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.protocol.toLowerCase().includes(q)
      )
    }

    if (sortConfig.key && sortConfig.direction) {
      const { key, direction } = sortConfig
      const valueOf = (v: (typeof result)[number]) => {
        switch (key) {
          case "name":
            return v.name.toLowerCase()
          case "deposits":
            return Number(v.totalDeposits || 0)
          case "position": {
            const holding = holdings?.[v.vaultAddress.toLowerCase()]
            return holding?.hasPosition ? Number(holding.balance || 0) : 0
          }
          case "liquidity":
            return Number(v.liquidity || 0)
          case "apy":
            return v.currentApy
        }
      }
      result = [...result].sort((a, b) => {
        const va = valueOf(a)
        const vb = valueOf(b)
        if (va < vb) return direction === "asc" ? -1 : 1
        if (va > vb) return direction === "asc" ? 1 : -1
        return 0
      })
    }

    return result
  }, [data?.vaults, search, sortConfig, holdings])

  const totalDeposits = React.useMemo(
    () =>
      (data?.vaults ?? []).reduce((sum, v) => sum + Number(v.totalDeposits || 0), 0),
    [data?.vaults]
  )

  // "Your Deposits" - the user's own holdings summed across every vault.
  const totalYourDeposits = React.useMemo(
    () =>
      Object.values(holdings ?? {}).reduce(
        (sum, h) => sum + (h.hasPosition ? Number(h.balance || 0) : 0),
        0
      ),
    [holdings]
  )

  // Surface both totals as right-aligned pills in the header bar beside the
  // "Earn" title. Title is left unset so the static nav title still shows.
  useHeaderContent({
    stats: [
      {
        label: "Total Deposits",
        value: isLoading ? "…" : formatCompactUsd(totalDeposits),
      },
      {
        label: "Your Deposits",
        value:
          isLoading || (positionsLoading && !holdings)
            ? "…"
            : formatCompactUsd(totalYourDeposits),
      },
    ],
  })

  const sortIcon = (columnKey: SortKey) => {
    if (sortConfig.key !== columnKey)
      return <IconArrowsSort className="ml-1 h-3.5 w-3.5 opacity-50" />
    if (sortConfig.direction === "asc")
      return <IconArrowUp className="ml-1 h-3.5 w-3.5" />
    return <IconArrowDown className="ml-1 h-3.5 w-3.5" />
  }

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Vaults</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Deposit USDC into yield-generating vaults on Arc Testnet, powered by
            EarnKit.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <IconSearch className="text-muted-foreground absolute left-2.5 top-2.5 h-4 w-4" />
          <Input
            placeholder="Filter vaults..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  onClick={() => handleSort("name")}
                  className="h-auto p-0 font-medium hover:bg-transparent"
                >
                  Vault
                  {sortIcon("name")}
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("deposits")}
                  className="ml-auto h-auto p-0 font-medium hover:bg-transparent"
                >
                  Deposits
                  {sortIcon("deposits")}
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("position")}
                  className="ml-auto h-auto p-0 font-medium hover:bg-transparent"
                >
                  Your position
                  {sortIcon("position")}
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("liquidity")}
                  className="ml-auto h-auto p-0 font-medium hover:bg-transparent"
                >
                  Liquidity
                  {sortIcon("liquidity")}
                </Button>
              </TableHead>
              <TableHead>Collateral</TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  onClick={() => handleSort("apy")}
                  className="ml-auto h-auto p-0 font-medium hover:bg-transparent"
                >
                  APY
                  {sortIcon("apy")}
                </Button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-5 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-5 w-16" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="ml-auto h-5 w-14" /></TableCell>
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  {error instanceof Error ? error.message : "Failed to load vaults."}
                </TableCell>
              </TableRow>
            ) : vaults.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  No vaults found.
                </TableCell>
              </TableRow>
            ) : (
              vaults.map((v) => (
                <TableRow
                  key={v.vaultAddress}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    router.push(`/dashboard/earn/vault?address=${v.vaultAddress}`)
                  }
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{v.name}</span>
                          {v.circleGuarded && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <IconShieldCheck className="size-4 text-emerald-500" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                On Circle&apos;s curated Circle-guarded list
                              </TooltipContent>
                            </Tooltip>
                          )}
                          {v.warnings.length > 0 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <IconAlertTriangle
                                    className={
                                      v.warnings.some((w) => w.level === "RED")
                                        ? "size-4 text-red-500"
                                        : "size-4 text-yellow-500"
                                    }
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {v.warnings.map((w) => w.type).join(", ")}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <span className="text-muted-foreground font-mono text-xs">
                          {v.protocol} - {shortenAddress(v.vaultAddress, 4)}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCompactUsd(v.totalDeposits)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {(() => {
                      const holding = holdings?.[v.vaultAddress.toLowerCase()]
                      if (holding?.hasPosition) {
                        return formatCompactUsd(holding.balance)
                      }
                      // Once positions have loaded, no key means no deposit here.
                      if (holdings || !positionsLoading) {
                        return <span className="text-muted-foreground text-xs">-</span>
                      }
                      return <Skeleton className="ml-auto h-5 w-16" />
                    })()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span>{formatCompactUsd(v.liquidity)}</span>
                      {v.status === "low_liquidity" && (
                        <span className="text-yellow-600 text-[10px]">low liquidity</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {v.collateral.length === 0 ? (
                      <span className="text-muted-foreground text-xs">-</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {v.collateral.slice(0, 3).map((c) => (
                          <Badge key={c.assetAddress} variant="secondary" className="font-normal">
                            {c.asset}
                          </Badge>
                        ))}
                        {v.collateral.length > 3 && (
                          <Badge variant="outline" className="font-normal">
                            +{v.collateral.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1 font-medium">
                      {formatApy(v.currentApy)}
                      {v.rewards.length > 0 && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <IconSparkles className="size-3.5 text-blue-500" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Includes {v.rewards.map((r) => r.token).join(", ")} rewards
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
