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

import * as React from "react"
import { IconRefresh, IconClock } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface DataFreshnessIndicatorProps {
  lastUpdated: Date | string | null
  isRefreshing?: boolean
  onRefresh?: () => void
  className?: string
}

// Ticks `Date.now()` on an interval through an external store. The current
// time is read inside `subscribe` (commit phase) and the interval callback —
// never during render — so SSR/hydration stay pure. Server snapshot is 0.
function useNow(intervalMs: number): number {
  const valueRef = React.useRef(0)
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    valueRef.current = Date.now()
    onStoreChange()
    const id = setInterval(() => {
      valueRef.current = Date.now()
      onStoreChange()
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  const getSnapshot = React.useCallback(() => valueRef.current, [])
  return React.useSyncExternalStore(subscribe, getSnapshot, () => 0)
}

// Pure derivation from the (prop) timestamp and the current time. `new Date`
// here only parses `lastUpdated`; it never reads the clock.
function computeFreshness(lastUpdated: Date | string | null, now: number) {
  if (!lastUpdated || !now) {
    return { timeAgo: "Syncing...", freshnessColor: "bg-gray-500" }
  }

  const diffMins = Math.floor(
    (now - new Date(lastUpdated).getTime()) / (1000 * 60)
  )

  let timeAgo: string
  if (diffMins < 1) timeAgo = "Just now"
  else if (diffMins < 60) timeAgo = `${diffMins}m ago`
  else if (diffMins < 1440) timeAgo = `${Math.floor(diffMins / 60)}h ago`
  else timeAgo = `${Math.floor(diffMins / 1440)}d ago`

  let freshnessColor: string
  if (diffMins < 5) freshnessColor = "bg-green-500"
  else if (diffMins < 30) freshnessColor = "bg-yellow-500"
  else freshnessColor = "bg-red-500"

  return { timeAgo, freshnessColor }
}

export function DataFreshnessIndicator({
  lastUpdated,
  isRefreshing = false,
  onRefresh,
  className = ""
}: DataFreshnessIndicatorProps) {
  // Both pieces derive from `Date.now()`, which Next.js 16 forbids during
  // client render. `useNow` sources the time from an external store (read off
  // the render path) and we derive the display values purely from it.
  const now = useNow(30000)
  const { timeAgo, freshnessColor } = React.useMemo(
    () => computeFreshness(lastUpdated, now),
    [lastUpdated, now]
  )

  return (
    <TooltipProvider>
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="flex items-center gap-1">
          <div className={`w-2 h-2 rounded-full ${freshnessColor}`} />
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <IconClock className="size-3" />
            {timeAgo}
          </span>
        </div>
        
        {onRefresh && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="h-6 w-6 p-0"
              >
                <IconRefresh 
                  className={`size-3 ${isRefreshing ? "animate-spin" : ""}`} 
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Refresh data</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}