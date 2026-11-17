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

import { useHydrated } from "@/hooks/use-hydrated"
import { formatDate } from "@/lib/utils/data-formatters"

/**
 * A timestamp in the viewer's local time. The server can't know that zone, so
 * the server render and the hydrating render both show the raw value, and the
 * formatted date replaces it once mounted. Formatting during render instead
 * made the server and browser output differ (a hydration mismatch).
 */
export function LocalDate({ value }: { value: string }) {
  const hydrated = useHydrated()
  return <>{hydrated ? formatDate(value) : value}</>
}
