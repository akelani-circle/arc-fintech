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

import { ONRAMP_CHAIN_TO_DB_BLOCKCHAIN } from "@/lib/circle/onramp-chains";

/**
 * Sentinel written to `transactions.sender_address` for onramp rows: there is
 * no on-chain sender, the funds are minted to the destination by Circle's
 * onramp partner.
 *
 * NOTE: the activity views don't know about this value yet, so an onramp row
 * currently renders through the generic wallet-to-wallet path and prints the
 * sentinel where a counterparty address belongs (with a dead explorer link
 * behind it). Wiring those views up is deliberately left out of this branch.
 */
export const ONRAMP_SENDER_SENTINEL = "fiat-onramp";

/**
 * Shape of the `notification` object on an `onramp.deposit.settled` event.
 * Inferred from the onramp kit's client-side DEPOSIT_SETTLED envelope (amount,
 * tokenSymbol, transactionHash, etc.) — Circle's server-side onramp webhook
 * contract wasn't available to confirm this against directly. Verify against a
 * real webhook delivery once a kit key is available and adjust if the shape
 * differs; {@link buildOnrampTransactionRow} rejects anything it can't map
 * rather than guessing, so a mismatch surfaces as a logged rejection instead of
 * a silently wrong row.
 */
export type OnrampDepositNotification = {
  sessionId: string;
  userId?: string;
  destinationAddress: string;
  destinationChain?: string;
  amount: string | number;
  tokenSymbol?: string;
  transactionHash?: string;
};

/** The `transactions` row an onramp deposit maps to. */
export type OnrampTransactionRow = {
  user_id: string;
  amount: number;
  sender_address: string;
  recipient_address: string;
  blockchain: string;
  type: "ONRAMP";
  status: "COMPLETE";
  currency: "USDC" | "EURC";
  tx_hash: string | null;
  onramp_session_id: string;
};

export type BuildOnrampRowResult =
  | { ok: true; row: OnrampTransactionRow }
  | { ok: false; reason: string };

/**
 * Map a settled onramp deposit onto a `transactions` row.
 *
 * Every field the row depends on is validated here rather than defaulted:
 * an unknown `destinationChain` used to fall back to ETH-SEPOLIA, which files
 * a real deposit against the wrong chain and produces a transaction the user
 * can't find on any explorer. Rejecting is the same choice `applyGatewayDeposit`
 * makes for an unknown domain.
 *
 * `status` is set explicitly: the column defaults to PENDING, and nothing ever
 * revisits an onramp row (there's no Circle transaction id to reconcile
 * against), so an unset status would leave every settled deposit displaying as
 * pending forever.
 */
export function buildOnrampTransactionRow(
  notification: OnrampDepositNotification
): BuildOnrampRowResult {
  const { sessionId, userId, destinationAddress, destinationChain } = notification;

  if (!sessionId) return { ok: false, reason: "missing sessionId" };
  if (!userId) return { ok: false, reason: "missing userId" };
  if (!destinationAddress) return { ok: false, reason: "missing destinationAddress" };

  if (!destinationChain) {
    return { ok: false, reason: "missing destinationChain" };
  }
  const blockchain = ONRAMP_CHAIN_TO_DB_BLOCKCHAIN[destinationChain];
  if (!blockchain) {
    return { ok: false, reason: `unknown destinationChain "${destinationChain}"` };
  }

  const amount = Number(notification.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: `invalid amount "${notification.amount}"` };
  }

  // The onramp can settle either supported stablecoin; the column defaults to
  // USDC, so an EURC purchase would otherwise be recorded as dollars.
  const symbol = notification.tokenSymbol?.toUpperCase();
  if (symbol && symbol !== "USDC" && symbol !== "EURC") {
    return { ok: false, reason: `unsupported tokenSymbol "${notification.tokenSymbol}"` };
  }

  return {
    ok: true,
    row: {
      user_id: userId,
      amount,
      sender_address: ONRAMP_SENDER_SENTINEL,
      recipient_address: destinationAddress,
      blockchain,
      type: "ONRAMP",
      status: "COMPLETE",
      currency: symbol === "EURC" ? "EURC" : "USDC",
      tx_hash: notification.transactionHash ?? null,
      onramp_session_id: sessionId,
    },
  };
}
