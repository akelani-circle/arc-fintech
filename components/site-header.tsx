/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use client"

import Link from "next/link"
import { IconArrowLeft, IconCopy } from "@tabler/icons-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { sidebarData } from "@/lib/constants/sidebar-data"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { GlobalSearch } from "@/components/global-search"
import { useBalanceContext } from "@/lib/contexts/balance-context"
import { useHeaderContentValue } from "@/lib/contexts/header-title-context"
import { getExplorerUrl, shortenAddress } from "@/lib/utils/data-formatters"

export function SiteHeader() {
  const pathname = usePathname()
  // A page (e.g. the vault detail view) can override the header with content
  // only it knows - title, protocol tag, address; fall back to the static nav
  // title otherwise.
  const headerContent = useHeaderContentValue()
  // Reuse the BalanceContext's wallets+transactions instead of opening a
  // third Supabase fetch for the global search.
  const { fullWallets, transactions } = useBalanceContext()

  const isVaultDetail = pathname === "/dashboard/earn/vault"

  const navTitle = useMemo(() => {
    if (pathname === "/usuarios")
      return "Usuários"

    const navItem = sidebarData.navMain.find(item => item.url === pathname)

    if (!navItem) return ""

    return navItem.title
  }, [pathname])

  const title = headerContent?.title ?? navTitle

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address)
    toast.success("Address copied")
  }

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        {/* Back to the vault list - only on the vault detail route. Mirrors the
            SidebarTrigger's ghost-icon styling so it reads as a sibling control. */}
        {isVaultDetail && (
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Back to vaults"
          >
            <Link href="/dashboard/earn">
              <IconArrowLeft />
            </Link>
          </Button>
        )}
        <h1 className="text-base font-medium whitespace-nowrap">
          {title}
        </h1>
        {headerContent?.protocol && (
          <Badge variant="secondary" className="font-normal capitalize">
            {headerContent.protocol}
          </Badge>
        )}
        {/* Address sits next to the protocol tag, left-aligned. */}
        {headerContent?.address && (
          <div className="text-muted-foreground flex items-center gap-1 text-sm">
            <a
              href={getExplorerUrl("ARC-TESTNET", headerContent.address)}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary font-mono"
            >
              {shortenAddress(headerContent.address)}
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => copyAddress(headerContent.address!)}
              aria-label="Copy address"
            >
              <IconCopy className="size-3" />
            </Button>
          </div>
        )}

        {/* Global Search: Only visible on /dashboard */}
        {pathname === "/dashboard" && (
          <div className="ml-auto flex-1 max-w-md">
            <GlobalSearch wallets={fullWallets} transactions={transactions} />
          </div>
        )}

        {/* ml-auto ensures this stays on the right whether search exists or not */}
        <div className={`flex items-center gap-2 ${pathname !== "/dashboard" ? "ml-auto" : ""}`}>
          {/* Page-provided stat pills (e.g. deposit totals on the vaults list). */}
          {headerContent?.stats?.map((stat) => (
            <div
              key={stat.label}
              className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs whitespace-nowrap"
            >
              <span className="text-muted-foreground">{stat.label}</span>
              <span className="font-semibold">{stat.value}</span>
            </div>
          ))}
          <ThemeSwitcher />
        </div>
      </div>
    </header>
  )
}