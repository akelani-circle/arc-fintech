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

import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { EarnVaultDetail } from "@/components/earn/earn-vault-detail"

/**
 * Vault detail view. The vault address is carried as a `?address=` search param
 * on a static path (rather than a dynamic `[vaultAddress]` segment) so the
 * dashboard layout's client shell - sidebar nav + header `usePathname()` - keeps
 * a concrete, statically-prerenderable path under Cache Components.
 *
 * The page component stays synchronous so it does not itself become dynamic;
 * the `searchParams` promise is resolved inside `VaultResolver`, which renders
 * behind `<Suspense>` so the dynamic read never blocks the static shell.
 */
export default function EarnVaultPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>
}) {
  return (
    <Suspense
      fallback={
        <div className="p-4 lg:p-6">
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <VaultResolver searchParams={searchParams} />
    </Suspense>
  )
}

async function VaultResolver({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>
}) {
  const { address } = await searchParams
  return <EarnVaultDetail vaultAddress={address ?? ""} />
}
