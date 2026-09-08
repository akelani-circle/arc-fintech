/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

import { describe, expect, it } from "vitest"
import {
  buildOnrampTransactionRow,
  ONRAMP_SENDER_SENTINEL,
  type OnrampDepositNotification,
} from "@/lib/circle/onramp-deposit"
import {
  DB_BLOCKCHAIN_TO_ONRAMP_CHAIN,
  ONRAMP_CHAIN_TO_DB_BLOCKCHAIN,
} from "@/lib/circle/onramp-chains"

/** A settled deposit with every field the handler needs. */
function notification(
  overrides: Partial<OnrampDepositNotification> = {}
): OnrampDepositNotification {
  return {
    sessionId: "session-1",
    userId: "user-1",
    destinationAddress: "0xabc",
    destinationChain: "Base_Sepolia",
    amount: "100.50",
    tokenSymbol: "USDC",
    transactionHash: "0xdeadbeef",
    ...overrides,
  }
}

describe("buildOnrampTransactionRow", () => {
  it("maps a settled deposit onto a transaction row", () => {
    const result = buildOnrampTransactionRow(notification())

    expect(result).toEqual({
      ok: true,
      row: {
        user_id: "user-1",
        amount: 100.5,
        sender_address: ONRAMP_SENDER_SENTINEL,
        recipient_address: "0xabc",
        blockchain: "BASE-SEPOLIA",
        type: "ONRAMP",
        status: "COMPLETE",
        currency: "USDC",
        tx_hash: "0xdeadbeef",
        onramp_session_id: "session-1",
      },
    })
  })

  it("marks the row COMPLETE, since nothing ever reconciles an onramp row later", () => {
    const result = buildOnrampTransactionRow(notification())
    expect(result.ok && result.row.status).toBe("COMPLETE")
  })

  it("rejects an unknown destinationChain instead of defaulting to a chain", () => {
    const result = buildOnrampTransactionRow(
      notification({ destinationChain: "Polygon_Amoy" })
    )

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain("Polygon_Amoy")
  })

  it("rejects a missing destinationChain rather than guessing Ethereum", () => {
    const result = buildOnrampTransactionRow(
      notification({ destinationChain: undefined })
    )

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe("missing destinationChain")
  })

  it.each([
    ["userId", { userId: undefined }],
    ["destinationAddress", { destinationAddress: "" }],
    ["sessionId", { sessionId: "" }],
  ])("rejects a payload with no %s", (field, overrides) => {
    const result = buildOnrampTransactionRow(
      notification(overrides as Partial<OnrampDepositNotification>)
    )

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe(`missing ${field}`)
  })

  it.each([["0"], ["-5"], ["not-a-number"], [""]])(
    "rejects the unusable amount %j",
    (amount) => {
      const result = buildOnrampTransactionRow(notification({ amount }))
      expect(result.ok).toBe(false)
      expect(!result.ok && result.reason).toContain("invalid amount")
    }
  )

  it("accepts a numeric amount as well as a string one", () => {
    const result = buildOnrampTransactionRow(notification({ amount: 42 }))
    expect(result.ok && result.row.amount).toBe(42)
  })

  it("records an EURC purchase as EURC rather than the USDC column default", () => {
    const result = buildOnrampTransactionRow(
      notification({ tokenSymbol: "eurc" })
    )
    expect(result.ok && result.row.currency).toBe("EURC")
  })

  it("defaults to USDC when the payload carries no tokenSymbol", () => {
    const result = buildOnrampTransactionRow(
      notification({ tokenSymbol: undefined })
    )
    expect(result.ok && result.row.currency).toBe("USDC")
  })

  it("rejects a token the transactions table cannot represent", () => {
    const result = buildOnrampTransactionRow(notification({ tokenSymbol: "DAI" }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toContain("DAI")
  })

  it("stores a null tx_hash when the deposit reports none", () => {
    const result = buildOnrampTransactionRow(
      notification({ transactionHash: undefined })
    )
    expect(result.ok && result.row.tx_hash).toBeNull()
  })

  it("round-trips every chain the session route is willing to mint for", () => {
    for (const [dbChain, onrampChain] of Object.entries(
      DB_BLOCKCHAIN_TO_ONRAMP_CHAIN
    )) {
      const result = buildOnrampTransactionRow(
        notification({ destinationChain: onrampChain })
      )
      expect(result.ok && result.row.blockchain).toBe(dbChain)
    }
  })
})

describe("ONRAMP_CHAIN_TO_DB_BLOCKCHAIN", () => {
  it("is the exact inverse of the outbound map", () => {
    const forward = Object.entries(DB_BLOCKCHAIN_TO_ONRAMP_CHAIN)
    expect(Object.keys(ONRAMP_CHAIN_TO_DB_BLOCKCHAIN)).toHaveLength(forward.length)
    for (const [dbChain, onrampChain] of forward) {
      expect(ONRAMP_CHAIN_TO_DB_BLOCKCHAIN[onrampChain]).toBe(dbChain)
    }
  })
})
