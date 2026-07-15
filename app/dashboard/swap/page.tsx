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

import { SwapPanel } from "@/components/swap/swap-panel"
import { SwapHistory } from "@/components/swap/swap-history"

export default function SwapPage() {
  return (
    <div className="flex flex-col gap-6 p-4 lg:p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Swap</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Swap USDC and EURC on your own wallets via App Kit Swap on Arc Testnet.
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-6">
        <SwapPanel />
        <SwapHistory />
      </div>
    </div>
  )
}
