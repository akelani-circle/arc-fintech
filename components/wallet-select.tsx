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
import { createClient } from "@/lib/supabase/client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { useBalanceContext } from "@/lib/contexts/balance-context"
import { fetchWalletBalance } from "@/lib/balances/fetcher"
import type { Currency } from "@/lib/constants/currency"

// Stable reference for the "no balance context" fallback so it doesn't
// re-trigger the displayedWallets useMemo on every render.
const EMPTY_WALLET_BALANCES: Record<string, string> = {}

export type WalletOption = {
  id: string
  address: string
  circle_wallet_id: string
  blockchain: string
  name: string
  type?: string
}

interface WalletSelectProps {
  value?: string
  onValueChange: (value: string) => void
  onSelectWallet?: (wallet: WalletOption) => void
  disabled?: boolean
  placeholder?: string
  chainFilter?: string
  excludeChain?: string
  /**
   * Exclude every wallet at this address regardless of chain. Use this only
   * when the dropdown is already constrained to a single chain (e.g. via
   * chainFilter), since Circle SCA wallets share the same address across
   * chains. For cross-chain dropdowns prefer excludeWallet.
   */
  excludeAddress?: string
  /**
   * Exclude exactly one (address, chain) wallet. Safe for cross-chain
   * dropdowns because it does not knock out the user's other wallets that
   * share the SCA address on different chains.
   */
  excludeWallet?: { address: string; blockchain: string }
  excludeGatewaySigner?: boolean
  excludeArcWallets?: boolean
  minBalance?: number
  /**
   * Currency to display balances for. Defaults to "USDC", which reads from
   * the shared balance context (unchanged, no extra fetch). "EURC" bypasses
   * the context and fetches directly, since the context only ever tracks
   * USDC (the dashboard's summary balance).
   */
  token?: Currency
  /**
   * Fetch EURC balances in the background even while `token` is "USDC".
   * Use this when the caller offers a currency toggle next to this dropdown
   * (e.g. `SendButton`) so switching to EURC doesn't have to wait on a fresh
   * fetch — without it the wallet list briefly filters down to nothing (or
   * empties out under `minBalance`) until the EURC balances land.
   */
  prefetchEurc?: boolean
  /** Bump this (e.g. after a swap/transfer completes) to force an EURC balance refetch. */
  refreshKey?: number | string
}

export function WalletSelect({
  value,
  onValueChange,
  onSelectWallet,
  disabled,
  placeholder = "Select a wallet",
  chainFilter,
  excludeChain,
  excludeAddress,
  excludeWallet,
  excludeGatewaySigner = false,
  excludeArcWallets = false,
  minBalance,
  token = "USDC",
  prefetchEurc = false,
  refreshKey,
}: WalletSelectProps) {
  const [wallets, setWallets] = React.useState<WalletOption[]>([])
  const [isLoading, setIsLoading] = React.useState(true)
  const supabase = createClient()

  // Try to access balance context, handle if it's not available
  let contextWalletBalances: Record<string, string> = EMPTY_WALLET_BALANCES
  try {

    const context = useBalanceContext()
    contextWalletBalances = context.walletBalances
  } catch {
    // Ignore error if context is missing
  }

  // "USDC" reads from the shared context (no extra fetch). "EURC" fetches
  // directly for just the wallets this dropdown ends up showing. When
  // `prefetchEurc` is set we kick this off as soon as wallets are known,
  // regardless of the currently selected `token`, so a later toggle to EURC
  // has data ready instead of showing an empty list while it loads.
  const [eurcBalances, setEurcBalances] = React.useState<Record<string, string>>({})
  const [isLoadingEurc, setIsLoadingEurc] = React.useState(false)
  React.useEffect(() => {
    if ((token !== "EURC" && !prefetchEurc) || wallets.length === 0) return
    let cancelled = false
    // `setIsLoadingEurc(true)` is deferred into the promise chain (rather than
    // called synchronously here) so this effect doesn't trigger a cascading
    // render on every run.
    Promise.resolve()
      .then(() => {
        if (!cancelled) setIsLoadingEurc(true)
        return fetchWalletBalance(wallets, "EURC")
      })
      .then((balances) => {
        if (!cancelled) setEurcBalances(balances)
      })
      .catch((error) => {
        console.error("Error fetching EURC balances:", error)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingEurc(false)
      })
    return () => {
      cancelled = true
    }
  }, [token, prefetchEurc, wallets, refreshKey])

  const walletBalances = token === "EURC" ? eurcBalances : contextWalletBalances
  // Only relevant while displaying EURC: true for the brief window (if any)
  // where the currency was toggled before the prefetch above resolved.
  const balancesLoading = token === "EURC" && isLoadingEurc

  React.useEffect(() => {
    const fetchWallets = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from("wallets")
          .select("id, address, circle_wallet_id, blockchain, name, type")
          .eq("user_id", user.id)

        if (error) throw error
        setWallets(data || [])
      } catch (error) {
        console.error("Error fetching wallets:", error)
        toast.error("Failed to load wallets")
      } finally {
        setIsLoading(false)
      }
    }

    fetchWallets()
  }, [supabase])

  // Filter wallets based on chain and excluded address, and deduplicate by address
  const displayedWallets = React.useMemo(() => {
    let result = wallets

    if (chainFilter) {
      result = result.filter((w) => w.blockchain === chainFilter)
    }

    if (excludeChain) {
      result = result.filter((w) => w.blockchain !== excludeChain)
    }

    if (excludeAddress) {
      result = result.filter((w) => w.address !== excludeAddress)
    }

    if (excludeWallet) {
      const exAddr = excludeWallet.address.toLowerCase()
      const exChain = excludeWallet.blockchain
      result = result.filter(
        (w) => !(w.address.toLowerCase() === exAddr && w.blockchain === exChain)
      )
    }

    if (excludeGatewaySigner) {
      result = result.filter((w) => w.type !== "gateway_signer")
    }

    if (excludeArcWallets) {
      result = result.filter((w) => w.blockchain !== "ARC-TESTNET")
    }

    // Skip the balance filter while EURC balances are still in flight —
    // otherwise every wallet looks like it has a zero balance and the list
    // flashes empty until the fetch resolves.
    if (minBalance !== undefined && !balancesLoading) {
      result = result.filter((w) => {
        const balanceStr = walletBalances[w.circle_wallet_id]
        if (!balanceStr) return false
        const numericPart = balanceStr.split(" ")[0].replace(/[$€,]/g, "")
        const balance = parseFloat(numericPart)
        return !isNaN(balance) && balance > minBalance
      })
    }

    // Deduplicate wallets by address + blockchain combination to prevent duplicate keys
    // Same address on different chains are different wallets, so we need both
    const seen = new Set<string>()
    result = result.filter((wallet) => {
      const key = `${wallet.address.toLowerCase()}-${wallet.blockchain.toLowerCase()}`
      if (seen.has(key)) {
        return false
      }
      seen.add(key)
      return true
    })

    return result
  }, [wallets, chainFilter, excludeChain, excludeAddress, excludeWallet, excludeGatewaySigner, excludeArcWallets, minBalance, walletBalances, balancesLoading])

  // Helper to format chain names nicely
  const formatChainName = (chain: string) => {
    return chain
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ")
  }

  return (
    <Select
      value={value}
      onValueChange={(val) => {
        // Pass the full composite value to the parent's onValueChange
        onValueChange(val)
        
        if (onSelectWallet) {
          // Find wallet by the full composite value for accuracy
          const selected = displayedWallets.find((w) => 
            `${w.address}-${w.blockchain}` === val
          )
          if (selected) {
            onSelectWallet(selected)
          }
        }
      }}
      disabled={disabled || isLoading || balancesLoading}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder={isLoading || balancesLoading ? "Loading wallets..." : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {displayedWallets.map((wallet) => (
          <SelectItem 
            key={wallet.id} 
            value={`${wallet.address}-${wallet.blockchain}`}
          >
            <div className="flex items-center justify-between gap-2 w-full">
              <span className="font-mono text-sm">
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </span>
              <span className="text-muted-foreground text-xs truncate max-w-[200px]">
                {wallet.name} ({formatChainName(wallet.blockchain)})
                {walletBalances[wallet.circle_wallet_id] && ` - ${walletBalances[wallet.circle_wallet_id].split(" ")[0]}`}
              </span>
            </div>
          </SelectItem>
        ))}
        {!isLoading && displayedWallets.length === 0 && (
          <div className="p-2 text-sm text-muted-foreground text-center">
            No available wallets
          </div>
        )}
      </SelectContent>
    </Select>
  )
}
