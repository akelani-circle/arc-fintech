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

import * as React from "react"
import { IconLoader2, IconExternalLink } from "@tabler/icons-react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { WalletSelect, type WalletOption } from "@/components/wallet-select"
import { useBalanceContext } from "@/lib/contexts/balance-context"
import {
  fetchEarnQuote,
  useEarnPosition,
  earnKeys,
} from "@/lib/earn/use-earn"
import type { EarnVault, EarnQuote } from "@/lib/earn/types"
import { formatApy, formatTokenAmount, trimAmount } from "@/lib/earn/format"
import { EarnPositionSummary } from "@/components/earn/earn-position-summary"

type Mode = "deposit" | "withdraw"

function parseWalletBalance(raw?: string): number {
  if (!raw) return 0
  const numeric = raw.split(" ")[0].replace(/[$,]/g, "")
  const n = parseFloat(numeric)
  return Number.isFinite(n) ? n : 0
}

export function EarnActionPanel({ vault }: { vault: EarnVault }) {
  const queryClient = useQueryClient()
  const { walletBalances } = useBalanceContext()

  const [mode, setMode] = React.useState<Mode>("deposit")
  const [wallet, setWallet] = React.useState<WalletOption | null>(null)
  const [amount, setAmount] = React.useState("")
  const [quote, setQuote] = React.useState<EarnQuote | null>(null)
  const [quoteError, setQuoteError] = React.useState<string | null>(null)
  const [isQuoting, setIsQuoting] = React.useState(false)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const walletId = wallet?.circle_wallet_id ?? null
  const position = useEarnPosition(walletId, vault.vaultAddress)

  const walletUsdc = parseWalletBalance(
    wallet ? walletBalances[wallet.circle_wallet_id] : undefined
  )
  const positionBalance = Number(position.data?.currentBalance ?? 0)

  // Available headroom for the active mode: wallet USDC for deposits, the
  // withdrawable position balance for withdrawals.
  const maxAmount = mode === "deposit" ? walletUsdc : positionBalance

  // Clear any prior quote the instant the inputs change — during render — so
  // stale numbers never linger through the debounce window below.
  const quoteInputKey = `${mode}:${walletId ?? ""}:${amount}:${vault.vaultAddress}`
  const [prevQuoteInputKey, setPrevQuoteInputKey] = React.useState(quoteInputKey)
  if (prevQuoteInputKey !== quoteInputKey) {
    setPrevQuoteInputKey(quoteInputKey)
    setQuote(null)
    setQuoteError(null)
  }

  // Debounced quote fetch whenever wallet + amount change.
  React.useEffect(() => {
    if (!walletId || !amount || Number(amount) <= 0) return

    let cancelled = false
    const timer = setTimeout(async () => {
      setIsQuoting(true)
      try {
        const q = await fetchEarnQuote({
          action: mode,
          walletId,
          vaultAddress: vault.vaultAddress,
          amount,
        })
        if (!cancelled) setQuote(q)
      } catch (err) {
        if (!cancelled) {
          setQuoteError(err instanceof Error ? err.message : "Quote failed")
        }
      } finally {
        if (!cancelled) setIsQuoting(false)
      }
    }, 500)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, walletId, amount, vault.vaultAddress])

  const resetAfterMode = (next: Mode) => {
    setMode(next)
    setAmount("")
    setQuote(null)
    setQuoteError(null)
  }

  const handleMax = () => {
    if (maxAmount > 0) setAmount(trimAmount(maxAmount))
  }

  const handleSubmit = async () => {
    if (!wallet || !amount || Number(amount) <= 0) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/earn/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletId: wallet.circle_wallet_id,
          vaultAddress: vault.vaultAddress,
          amount,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.userMessage || data.error || "Request failed")
      }

      toast.success(
        mode === "deposit" ? "Deposit confirmed" : "Withdrawal confirmed",
        {
          description: `${trimAmount(data.amount)} ${vault.asset} - ${vault.name}`,
          action: data.explorerUrl
            ? {
                label: "View",
                onClick: () => window.open(data.explorerUrl, "_blank"),
              }
            : undefined,
        }
      )
      setAmount("")
      setQuote(null)
      // Refresh position, vault liquidity, and the dashboard balances.
      queryClient.invalidateQueries({
        queryKey: earnKeys.position(walletId, vault.vaultAddress),
      })
      queryClient.invalidateQueries({
        queryKey: earnKeys.vault(vault.vaultAddress),
      })
      queryClient.invalidateQueries({
        queryKey: earnKeys.activity(vault.vaultAddress),
      })
    } catch (err) {
      toast.error(mode === "deposit" ? "Deposit failed" : "Withdrawal failed", {
        description: err instanceof Error ? err.message : "An error occurred",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const overMax =
    !!wallet && Number(amount) > 0 && maxAmount > 0 && Number(amount) > maxAmount
  const submitDisabled =
    !wallet ||
    !amount ||
    Number(amount) <= 0 ||
    isSubmitting ||
    isQuoting ||
    !quote ||
    (mode === "withdraw" && positionBalance <= 0) ||
    overMax

  return (
    <div className="rounded-xl border p-4">
      <Tabs value={mode} onValueChange={(v) => resetAfterMode(v as Mode)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="deposit">Deposit</TabsTrigger>
          <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
        </TabsList>

        <TabsContent value={mode} className="mt-4 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Wallet</Label>
            <WalletSelect
              value={wallet ? `${wallet.address}-${wallet.blockchain}` : ""}
              onValueChange={() => {}}
              onSelectWallet={(w) => {
                setWallet(w)
                setAmount("")
                setQuote(null)
                setQuoteError(null)
              }}
              placeholder="Select Arc Testnet wallet"
              chainFilter="ARC-TESTNET"
              excludeGatewaySigner
              disabled={isSubmitting}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="earn-amount">Amount ({vault.asset})</Label>
              {wallet && (
                <button
                  type="button"
                  onClick={handleMax}
                  className="text-muted-foreground hover:text-foreground text-xs"
                >
                  {mode === "deposit" ? "Balance" : "Withdrawable"}:{" "}
                  {trimAmount(maxAmount, 2)}
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                id="earn-amount"
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!wallet || isSubmitting}
                className="pr-14"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleMax}
                disabled={!wallet || maxAmount <= 0 || isSubmitting}
                className="absolute right-1 top-1 h-7 px-2 text-xs"
              >
                MAX
              </Button>
            </div>
            {overMax && (
              <p className="text-xs text-red-500">
                Exceeds available {mode === "deposit" ? "balance" : "position"}.
              </p>
            )}
          </div>

          {/* Position summary for the selected wallet */}
          {wallet && (
            <EarnPositionSummary
              query={position}
              asset={vault.asset}
            />
          )}

          {/* Live quote */}
          {(isQuoting || quote || quoteError) && (
            <div className="bg-muted/40 rounded-lg border p-3 text-sm">
              {isQuoting ? (
                <div className="text-muted-foreground flex items-center gap-2">
                  <IconLoader2 className="size-3.5 animate-spin" />
                  Fetching quote...
                </div>
              ) : quoteError ? (
                <p className="text-red-500 text-xs">{quoteError}</p>
              ) : quote ? (
                <QuoteDetails quote={quote} asset={vault.asset} />
              ) : null}
            </div>
          )}

          <Button onClick={handleSubmit} disabled={submitDisabled}>
            {isSubmitting ? (
              <>
                <IconLoader2 className="size-4 animate-spin" />
                Processing...
              </>
            ) : mode === "deposit" ? (
              "Deposit"
            ) : (
              "Withdraw"
            )}
          </Button>

          <p className="text-muted-foreground flex items-center gap-1 text-[11px]">
            <IconExternalLink className="size-3" />
            Executed on-chain via EarnKit on Arc Testnet.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function QuoteDetails({ quote, asset }: { quote: EarnQuote; asset: string }) {
  const feeText =
    quote.fees.length === 0
      ? "None"
      : quote.fees
          .map((f) => formatTokenAmount(f.amount, f.symbol, 6))
          .join(", ")

  if (quote.kind === "deposit") {
    return (
      <div className="flex flex-col">
        <Row
          label="Expected shares"
          value={formatTokenAmount(quote.expectedShares.amount, quote.expectedShares.symbol)}
        />
        <Row label="Share price" value={`${trimAmount(quote.sharePrice, 6)} ${asset}`} />
        <Row label="APY" value={formatApy(quote.currentApy)} />
        <Row label="Fees" value={feeText} />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <Row
        label="Shares to redeem"
        value={formatTokenAmount(quote.sharesToRedeem.amount, quote.sharesToRedeem.symbol)}
      />
      <Row
        label="Max withdrawable"
        value={formatTokenAmount(quote.maxWithdrawable.amount, quote.maxWithdrawable.symbol)}
      />
      <Row label="Share price" value={`${trimAmount(quote.sharePrice, 6)} ${asset}`} />
      <Row label="Fees" value={feeText} />
    </div>
  )
}
