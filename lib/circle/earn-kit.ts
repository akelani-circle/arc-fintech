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

/**
 * EarnKit (`@circle-fin/earn-kit`) singletons wired to the same Circle
 * Developer-Controlled Wallets adapter the rest of the app already uses for
 * App Kit sends / Gateway deposits. EarnKit is wallet-agnostic - the
 * `createCircleWalletsAdapter` instance fronts every Circle wallet on this
 * Console account, so each operation passes `{ adapter, chain, address }` and
 * the adapter resolves which wallet to act as from `address`.
 *
 * Server-side only: the adapter calls Circle's DCW API with the entity secret,
 * which must never reach the browser bundle.
 */

import "server-only"

import { EarnKit, EarnChain, type EarnAdapterContext } from "@circle-fin/earn-kit"
import {
  createCircleWalletsAdapter,
  type CircleWalletsAdapter,
} from "@circle-fin/adapter-circle-wallets"

/**
 * The adapter type EarnKit's own context expects. `@circle-fin/earn-kit` and
 * `@circle-fin/adapter-circle-wallets` each bundle a private copy of the core
 * adapter types, so the two `Adapter` types are structurally compatible but
 * nominally distinct. The Circle Wallets adapter is a documented, supported
 * EarnKit adapter, so we cross the package boundary with one explicit cast
 * here rather than scattering casts at every call site.
 */
type EarnAdapter = EarnAdapterContext["adapter"]

/** The only chain EarnKit's alpha supports, in EarnKit identifier form. */
export const EARN_CHAIN = EarnChain.Arc_Testnet
/** Same chain in the app's DB blockchain form. */
export const EARN_BLOCKCHAIN = "ARC-TESTNET" as const

let cachedKit: EarnKit | null = null
let cachedAdapter: CircleWalletsAdapter | null = null

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        "Set it in .env.local before calling EarnKit."
    )
  }
  return value
}

export function getEarnKit(): EarnKit {
  if (!cachedKit) {
    cachedKit = new EarnKit()
  }
  return cachedKit
}

function createEarnAdapter(): CircleWalletsAdapter {
  return createCircleWalletsAdapter({
    apiKey: requireEnv("CIRCLE_API_KEY"),
    entitySecret: requireEnv("CIRCLE_ENTITY_SECRET"),
  })
}

/**
 * Return an adapter whose `getAddress()` resolves to `address`.
 *
 * The Circle Wallets adapter is developer-controlled: one instance fronts
 * every wallet, so EarnKit operations must name the wallet via the context
 * `address`. Some adapter code paths still probe `adapter.getAddress()`, which
 * throws for developer-controlled adapters unless an explicit address is
 * bound - so we wrap it the same way the App Kit send path does.
 */
function withResolvedAddress(
  adapter: CircleWalletsAdapter,
  address: string
): CircleWalletsAdapter {
  const resolved = address.trim()
  if (!resolved) {
    throw new Error("Missing wallet address for EarnKit operation.")
  }
  return new Proxy(adapter as object, {
    get(target, property) {
      if (property === "getAddress") {
        return async () => resolved
      }
      const value = Reflect.get(target, property, target)
      return typeof value === "function" ? value.bind(target) : value
    },
  }) as CircleWalletsAdapter
}

/**
 * Build the `from` adapter context EarnKit write/position operations expect for
 * a given Circle wallet address. A fresh address-bound adapter is returned per
 * call so concurrent requests acting as different wallets never race on a
 * shared `getAddress()`.
 */
export function earnFromContext(address: string): EarnAdapterContext {
  if (!cachedAdapter) {
    cachedAdapter = createEarnAdapter()
  }
  return {
    adapter: withResolvedAddress(cachedAdapter, address) as unknown as EarnAdapter,
    chain: EARN_CHAIN,
    address: address.trim(),
  } as EarnAdapterContext
}

/**
 * Optional Kit Key for permissioned mode. When `EARN_KIT_KEY` is set EarnKit
 * runs with integrator attribution + higher rate limits; otherwise it operates
 * permissionlessly. Returned as the SDK's per-operation `config` shape so every
 * call site is uniform.
 */
export function earnConfig(): { kitKey: string } | undefined {
  const kitKey = process.env.EARN_KIT_KEY
  return kitKey ? { kitKey } : undefined
}
