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

import * as React from "react"

const subscribe = () => () => {}

/**
 * Returns `false` during SSR and the initial (hydrating) client render, then
 * `true` once mounted. Backed by `useSyncExternalStore` so the server snapshot
 * and first client render agree — no hydration mismatch, and no
 * `setState`-in-effect. Use it to gate browser-only computations (current
 * time, `window`, etc.) that would otherwise run during render.
 */
export function useHydrated() {
  return React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
}
