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
 */

"use client"

import * as React from "react"
import { IconLoader, IconCreditCard } from "@tabler/icons-react"
import { toast } from "sonner"
import { createOnrampKit, parseOnrampSession, type OnrampSession } from "@crcl-main/onramp-kit"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface OnrampDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  wallet: {
    id: string
    name: string
    address: string
  }
}

async function mintSession(walletId: string): Promise<OnrampSession> {
  const res = await fetch("/api/onramp/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletId }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Failed to start onramp session (${res.status})`)
  }

  return parseOnrampSession(await res.json())
}

// Popup mode, not the embedded iframe: Transak's (the onramp provider) own
// CSP blocks framing from localhost, so the iframe silently fails to load
// during local testing regardless of this app's own CSP. A popup opens the
// widget in its own top-level browsing context instead of an iframe, which
// sidesteps that restriction entirely.
export function OnrampDialog({ open, onOpenChange, wallet }: OnrampDialogProps) {
  const [session, setSession] = React.useState<OnrampSession | null>(null)
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading")

  // Pre-fetch the session as soon as the dialog opens. `openWindow()` must be
  // called synchronously inside the button's click handler — any `await`
  // before it (including minting the session) makes the browser drop the
  // user-gesture association and block the popup.
  React.useEffect(() => {
    if (!open) {
      setSession(null)
      setStatus("loading")
      return
    }

    let cancelled = false
    setStatus("loading")

    mintSession(wallet.id)
      .then((minted) => {
        if (!cancelled) {
          setSession(minted)
          setStatus("ready")
        }
      })
      .catch((error) => {
        console.error("Failed to start onramp session:", error)
        if (!cancelled) setStatus("error")
      })

    return () => {
      cancelled = true
    }
  }, [open, wallet.id])

  const handleOpenWidget = () => {
    if (!session) return

    const onramp = createOnrampKit({
      // Must match the server's widget origin. Omit for production.
      widgetBaseUrl: process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL,
    })

    // Nothing async above this line — the click gesture is still live here.
    const result = onramp.openWindow({
      session,
      onDepositSettled: ({ payload }) => {
        toast.success(
          `Deposit settled${payload.amount ? `: ${payload.amount} ${payload.tokenSymbol ?? ""}`.trim() : ""}`
        )
      },
      onSessionExpired: () => {
        mintSession(wallet.id)
          .then(setSession)
          .catch((error) => console.error("Failed to refresh expired onramp session:", error))
      },
    })

    if (result.status === "blocked") {
      if (result.reason === "popup_blocked") {
        toast.error(result.errorMessage || "Popup blocked — allow popups for this site and try again.")
      } else {
        // in_app_browser / pwa_standalone: no popup is usable here at all.
        toast.error("Buy Crypto isn't supported in this browser context. Open this page in a regular browser tab.")
      }
      return
    }

    // Hand off to the popup and close our launcher dialog — the popup keeps
    // running independently of this component from here on.
    onOpenChange(false)

    // Sessions are single-use; pre-fetch a replacement for the next click.
    mintSession(wallet.id)
      .then(setSession)
      .catch((error) => console.error("Failed to pre-fetch replacement onramp session:", error))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Buy crypto</DialogTitle>
          <DialogDescription>
            Opens in a new window. Purchases settle directly to {wallet.name} ({wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}).
          </DialogDescription>
        </DialogHeader>

        {status === "error" && (
          <p className="text-sm text-muted-foreground">
            Something went wrong starting the onramp session. Please try again.
          </p>
        )}

        <DialogFooter>
          <Button onClick={handleOpenWidget} disabled={status !== "ready"}>
            {status === "loading" ? (
              <IconLoader className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <IconCreditCard className="h-4 w-4 mr-2" />
            )}
            Open Buy Crypto Widget
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
