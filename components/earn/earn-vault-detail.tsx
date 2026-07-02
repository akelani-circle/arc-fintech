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
import {
  IconShieldCheck,
  IconAlertTriangle,
} from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useEarnVault } from "@/lib/earn/use-earn"
import { useHeaderContent } from "@/lib/contexts/header-title-context"
import { formatApy, formatCompactUsd } from "@/lib/earn/format"
import { getExplorerUrl, shortenAddress } from "@/lib/utils/data-formatters"
import { EarnActionPanel } from "@/components/earn/earn-action-panel"
import { EarnVaultActivity } from "@/components/earn/earn-vault-activity"
import type { EarnVault } from "@/lib/earn/types"

export function EarnVaultDetail({ vaultAddress }: { vaultAddress: string }) {
  const { data: vault, isLoading, isError, error } = useEarnVault(vaultAddress)

  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      {isLoading ? (
        <DetailSkeleton />
      ) : isError || !vault ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          {error instanceof Error ? error.message : "Vault not found."}
        </div>
      ) : (
        <VaultDetail vault={vault} />
      )}
    </div>
  )
}

function VaultDetail({ vault }: { vault: EarnVault }) {
  // Feed the site-header bar: vault name as the title (the SDK name already
  // carries the "(Arc Testnet)" suffix, so it is used verbatim), the protocol
  // tag beside it, and the vault address right-aligned.
  useHeaderContent({
    title: vault.name,
    protocol: vault.protocol,
    address: vault.vaultAddress,
  })

  const hasStatusBadge =
    vault.circleGuarded || vault.warnings.some((w) => w.level === "RED")

  return (
    <>
      {/* Status badges - name, protocol, and address now live in the header bar,
          so this row only appears when there is a curation/risk flag to show. */}
      {hasStatusBadge && (
        <div className="flex flex-wrap items-center gap-2">
          {vault.circleGuarded && (
            <Badge variant="outline" className="gap-1 font-normal">
              <IconShieldCheck className="size-3 text-emerald-500" />
              Circle-guarded
            </Badge>
          )}
          {vault.warnings.some((w) => w.level === "RED") && (
            <Badge variant="destructive" className="gap-1 font-normal">
              <IconAlertTriangle className="size-3" />
              Risk warning
            </Badge>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total Deposits" value={formatCompactUsd(vault.totalDeposits)} />
        <Stat label="Liquidity" value={formatCompactUsd(vault.liquidity)} />
        <Stat
          label="Net APY"
          value={formatApy(vault.currentApy)}
          sub={`${formatApy(vault.nativeApy)} native`}
        />
        <Stat label="Vault Fee" value={formatApy(vault.vaultFee)} />
      </div>

      {/* Body: tabs + action panel */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Tabs defaultValue="overview" className="gap-0">

          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="allocation">Allocation</TabsTrigger>
            <TabsTrigger value="risk">Risk</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <OverviewTab vault={vault} />
          </TabsContent>
          <TabsContent value="allocation" className="mt-4">
            <AllocationTab vault={vault} />
          </TabsContent>
          <TabsContent value="risk" className="mt-4">
            <RiskTab vault={vault} />
          </TabsContent>
          <TabsContent value="activity" className="mt-4">
            <EarnVaultActivity vaultAddress={vault.vaultAddress} asset={vault.asset} />
          </TabsContent>
        </Tabs>

        {/* Offset down by the tab strip (h-9) + its content's mt-4 = 3.25rem so
            the panel's top aligns with the left card, not the tab row above it.
            Desktop-only; mobile stacks flush. */}
        <div className="lg:mt-13 lg:sticky lg:top-4 lg:self-start">
          <EarnActionPanel vault={vault} />
        </div>
      </div>
    </>
  )
}

function Stat({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="text-muted-foreground mt-0.5 text-xs">{sub}</div>}
    </div>
  )
}

function ConfigRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b py-3 last:border-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  )
}

function OverviewTab({ vault }: { vault: EarnVault }) {
  return (
    <div className="rounded-xl border p-4">
      <h3 className="mb-2 text-sm font-semibold">Vault Configuration</h3>
      <ConfigRow label="Protocol" value={<span className="capitalize">{vault.protocol}</span>} />
      <ConfigRow label="Deposit asset" value={vault.asset} />
      <ConfigRow
        label="Asset address"
        value={
          <a
            href={getExplorerUrl("ARC-TESTNET", vault.assetAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary font-mono"
          >
            {shortenAddress(vault.assetAddress)}
          </a>
        }
      />
      <ConfigRow label="Total APY" value={formatApy(vault.currentApy)} />
      <ConfigRow label="Native APY" value={formatApy(vault.nativeApy)} />
      <ConfigRow label="Vault fee" value={formatApy(vault.vaultFee)} />
      <ConfigRow
        label="Status"
        value={
          <Badge
            variant={vault.status === "active" ? "secondary" : "outline"}
            className="font-normal capitalize"
          >
            {vault.status.replace("_", " ")}
          </Badge>
        }
      />
      <ConfigRow
        label="Circle-guarded"
        value={vault.circleGuarded ? "Yes" : "No"}
      />
      {vault.rewards.length > 0 && (
        <ConfigRow
          label="Reward incentives"
          value={vault.rewards
            .map((r) => `${r.token} (${formatApy(r.apy)})`)
            .join(", ")}
        />
      )}
    </div>
  )
}

function AllocationTab({ vault }: { vault: EarnVault }) {
  if (vault.collateral.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
        No collateral markets reported for this vault.
      </div>
    )
  }
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Collateral</TableHead>
            <TableHead className="text-right">Max LLTV</TableHead>
            <TableHead className="text-right">Supplied</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vault.collateral.map((c) => (
            <TableRow key={c.assetAddress}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{c.asset}</span>
                  <a
                    href={getExplorerUrl("ARC-TESTNET", c.assetAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary font-mono text-xs"
                  >
                    {shortenAddress(c.assetAddress, 4)}
                  </a>
                </div>
              </TableCell>
              <TableCell className="text-right">{formatApy(c.lltv, 0)}</TableCell>
              <TableCell className="text-right">
                {formatCompactUsd(c.supplyUsd)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function RiskTab({ vault }: { vault: EarnVault }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border p-4">
        <h3 className="mb-3 text-sm font-semibold">Protocol Warnings</h3>
        {vault.warnings.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No active warnings reported for this vault.
          </p>
        ) : (
          <div className="flex flex-col">
            {vault.warnings.map((w) => (
              <div
                key={`${w.type}-${w.level}`}
                className="flex items-center gap-2 text-sm"
              >
                <IconAlertTriangle
                  className={
                    w.level === "RED"
                      ? "size-4 text-red-500"
                      : "size-4 text-yellow-500"
                  }
                />
                <span>{w.type}</span>
                <Badge
                  variant={w.level === "RED" ? "destructive" : "outline"}
                  className="font-normal"
                >
                  {w.level}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border p-4">
        <h3 className="mb-3 text-sm font-semibold">Curation</h3>
        <ConfigRow
          label="Circle-guarded list"
          value={vault.circleGuarded ? "Included" : "Not included"}
        />
        <ConfigRow label="Liquidity status" value={
          <span className="capitalize">{vault.status.replace("_", " ")}</span>
        } />
        <ConfigRow
          label="Collateral markets"
          value={`${vault.collateral.length}`}
        />
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
