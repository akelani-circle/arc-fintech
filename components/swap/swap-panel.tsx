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

import { useEffect, useRef, useState } from "react"
import { IconArrowsUpDown, IconLoader2 } from "@tabler/icons-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { WalletSelect, type WalletOption } from "@/components/wallet-select"
import { otherCurrency, type Currency } from "@/lib/constants/currency"
import { useBalanceContext } from "@/lib/contexts/balance-context"
import { parseBalanceAmount } from "@/lib/balances/fetcher"
import { trimAmount } from "@/lib/earn/format"
import { SWAP_SLIPPAGE_BPS } from "@/lib/constants/swap"

type QuoteState =
  | { ok: true; amountOut: string; effectiveRate: string }
  | { ok: false; error: string }
  | null

export function SwapPanel() {
  const [wallet, setWallet] = useState<WalletOption | null>(null)
  const [tokenIn, setTokenIn] = useState<Currency>("USDC")
  const tokenOut = otherCurrency(tokenIn)
  const [amountIn, setAmountIn] = useState("")
  const [quote, setQuote] = useState<QuoteState>(null)
  const [quoting, setQuoting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const requestId = useRef(0)

  // SwapPanel only ever renders on /dashboard/swap, which is always wrapped
  // by BalanceProviderWrapper (see app/dashboard/layout.tsx), so this hook
  // doesn't need WalletSelect's defensive try/catch for a missing provider.
  const { walletBalances, eurcWalletBalances, refreshWalletBalance } =
    useBalanceContext()

  // The sell input is bounded by the selected wallet's balance *in the token
  // being sold*, so flipping the pair re-bounds it against the other map. The
  // provider loads both maps up front, so no extra fetch is needed here.
  const balancesForTokenIn = tokenIn === "EURC" ? eurcWalletBalances : walletBalances
  const rawBalance = wallet
    ? balancesForTokenIn[wallet.circle_wallet_id]
    : undefined
  // Distinguish "not loaded yet" from a genuine zero: an absent entry must not
  // disable the input, or a slow balance fetch would look like an empty wallet.
  const balanceLoaded = rawBalance !== undefined
  const maxAmount = parseBalanceAmount(rawBalance)
  const isEmpty = balanceLoaded && maxAmount <= 0

  const overMax = maxAmount > 0 && Number(amountIn) > maxAmount
  const isValidInput =
    !!wallet && !!amountIn && Number(amountIn) > 0 && !overMax

  useEffect(() => {
    const id = ++requestId.current
    if (!isValidInput || !wallet) return

    const handle = window.setTimeout(async () => {
      setQuoting(true)
      try {
        const res = await fetch("/api/swap/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletId: wallet.circle_wallet_id,
            tokenIn,
            tokenOut,
            amountIn,
          }),
        })
        const data = await res.json()
        if (id !== requestId.current) return
        if (!res.ok) {
          setQuote({ ok: false, error: data.userMessage || data.error || "Failed to fetch quote" })
        } else {
          setQuote({ ok: true, amountOut: data.amountOut, effectiveRate: data.effectiveRate })
        }
      } catch (error) {
        if (id !== requestId.current) return
        setQuote({
          ok: false,
          error: error instanceof Error ? error.message : "Failed to fetch quote",
        })
      } finally {
        if (id === requestId.current) setQuoting(false)
      }
    }, 350)
    return () => window.clearTimeout(handle)
  }, [isValidInput, wallet, tokenIn, tokenOut, amountIn])

  // Derived rather than cleared via effect+setState: once the input becomes
  // invalid (empty amount, no wallet), stop showing the last fetched quote.
  const displayedQuote = isValidInput ? quote : null

  function flip() {
    setTokenIn(tokenOut)
    setAmountIn("")
    setQuote(null)
  }

  function selectWallet(next: WalletOption) {
    setWallet(next)
    // A different wallet has a different balance, so an amount typed against
    // the previous one is no longer bounded by anything meaningful.
    setAmountIn("")
    setQuote(null)
  }

  function handleMax() {
    if (maxAmount > 0) setAmountIn(trimAmount(maxAmount))
  }

  function resetForm() {
    setAmountIn("")
    setQuote(null)
    setConfirmOpen(false)
  }

  async function handleExecute() {
    if (!wallet || !displayedQuote?.ok) return
    setExecuting(true)
    try {
      const res = await fetch("/api/swap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: wallet.circle_wallet_id,
          tokenIn,
          tokenOut,
          amountIn,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.userMessage || data.error || "Swap failed")
      }
      toast.success("Swap confirmed", {
        description: `Swapped ${amountIn} ${tokenIn} for ${tokenOut} on Arc Testnet`,
      })
      resetForm()
      setRefreshKey((k) => k + 1)
      await refreshWalletBalance()
    } catch (error) {
      toast.error("Swap failed", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
      })
    } finally {
      setExecuting(false)
    }
  }

  const displayedQuoting = isValidInput && quoting
  const canExecute =
    !!wallet &&
    displayedQuote?.ok === true &&
    !displayedQuoting &&
    !executing &&
    Number(amountIn) > 0 &&
    !overMax &&
    !isEmpty

  return (
    <>
      <div className="w-full max-w-md rounded-xl border bg-card p-4">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Swap</h2>
          <p className="text-sm text-muted-foreground">
            Swap USDC and EURC on your Arc Testnet wallets.
          </p>
        </div>

        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <Label>Wallet</Label>
            <WalletSelect
              value={wallet ? `${wallet.address}-${wallet.blockchain}` : ""}
              onValueChange={() => {}}
              onSelectWallet={selectWallet}
              placeholder="Select an Arc Testnet wallet"
              chainFilter="ARC-TESTNET"
              excludeGatewaySigner
              disabled={executing}
              token={tokenIn}
              refreshKey={refreshKey}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="swap-amount">Sell {tokenIn}</Label>
              {wallet && balanceLoaded && (
                <span className="text-muted-foreground text-xs tabular-nums">
                  Balance: {trimAmount(maxAmount, 2)} {tokenIn}
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                id="swap-amount"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                min={0}
                max={maxAmount > 0 ? maxAmount : undefined}
                step={0.01}
                disabled={!wallet || isEmpty || executing}
                className="pr-14"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleMax}
                disabled={!wallet || isEmpty || executing}
                className="absolute right-1 top-1 h-7 px-2 text-xs"
              >
                MAX
              </Button>
            </div>
            {isEmpty && (
              <p className="text-muted-foreground text-xs">
                This wallet has no {tokenIn} to swap.
              </p>
            )}
            {overMax && (
              <p className="text-xs text-red-500">
                Exceeds available balance of {trimAmount(maxAmount, 2)} {tokenIn}.
              </p>
            )}
          </div>

          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={flip}
              disabled={executing}
            >
              <IconArrowsUpDown className="size-4" />
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Buy {tokenOut}</Label>
            <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm tabular-nums">
              {displayedQuoting ? "…" : displayedQuote?.ok ? Number(displayedQuote.amountOut).toFixed(6) : "0.00"}
            </div>
          </div>

          {displayedQuote?.ok && (
            <div className="rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              1 {tokenIn} ≈ {Number(displayedQuote.effectiveRate).toFixed(6)} {tokenOut}
            </div>
          )}

          {displayedQuote && !displayedQuote.ok && (
            <Alert variant="destructive">
              <AlertDescription className="text-xs">{displayedQuote.error}</AlertDescription>
            </Alert>
          )}

          <Button
            className="w-full"
            disabled={!canExecute}
            onClick={() => setConfirmOpen(true)}
          >
            Swap {tokenIn} → {tokenOut}
          </Button>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm swap</DialogTitle>
            <DialogDescription>
              Review the quote. Execution is final once submitted.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Pay</dt>
              <dd className="tabular-nums">
                {amountIn || "0"} {tokenIn}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Receive (est.)</dt>
              <dd className="tabular-nums">
                {displayedQuote?.ok ? `${Number(displayedQuote.amountOut).toFixed(6)} ${tokenOut}` : "-"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Slippage</dt>
              <dd>{(SWAP_SLIPPAGE_BPS / 100).toFixed(2)}%</dd>
            </div>
          </dl>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={executing}>
                Cancel
              </Button>
            </DialogClose>
            <Button onClick={handleExecute} disabled={executing}>
              {executing ? (
                <>
                  <IconLoader2 className="size-4 animate-spin" />
                  Executing...
                </>
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
