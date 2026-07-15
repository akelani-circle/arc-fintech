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

import { useMemo, useState } from "react"
import { useHydrated } from "@/hooks/use-hydrated"

interface DateRange {
  from: Date | undefined
  to: Date | undefined
}

const EMPTY_RANGE: DateRange = { from: undefined, to: undefined }

function buildRange(defaultDays: number): DateRange {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - defaultDays)
  return { from, to }
}

// Hook for managing date range state
export function useDateRange(defaultDays: number = 7) {
  // The default range depends on the current time, which can't be read during
  // SSR/hydration. Stay empty until hydrated, then derive the client default
  // during render — no setState-in-effect. A user selection (override) wins.
  const hydrated = useHydrated()
  const [override, setOverride] = useState<DateRange | null>(null)

  // Memoized so the derived default keeps a stable identity across renders —
  // consumers use `dateRange` as a memo/effect dependency.
  const clientDefault = useMemo(
    () => (hydrated ? buildRange(defaultDays) : EMPTY_RANGE),
    [hydrated, defaultDays],
  )
  const dateRange = override ?? clientDefault

  return [dateRange, setOverride] as const
}