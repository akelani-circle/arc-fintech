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

import Link from "next/link"

import { cn } from "@/lib/utils"
import { useEarnVault } from "@/lib/earn/use-earn"
import { shortenAddress } from "@/lib/utils/data-formatters"

/**
 * Renders a vault's name as an internal link to its detail page. Used in place
 * of a raw wallet-to-vault address pair for Earn deposits/withdrawals, which are
 * conceptually vault interactions rather than plain transfers.
 *
 * The name is resolved lazily via `useEarnVault` (React Query dedupes repeated
 * addresses across rows). Until it loads — or if the lookup fails — the shortened
 * address stands in, so the link always renders something meaningful.
 */
export function VaultLink({
  address,
  className,
  onClick,
}: {
  address: string
  className?: string
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
}) {
  const { data: vault } = useEarnVault(address)
  const label = vault?.name ?? shortenAddress(address)

  return (
    <Link
      href={`/dashboard/earn/vault?address=${address}`}
      className={cn(
        "hover:text-primary hover:underline transition-colors",
        className
      )}
      onClick={onClick}
    >
      {label}
    </Link>
  )
}
