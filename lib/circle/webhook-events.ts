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

import type { Currency } from "@/lib/constants/currency";

/**
 * Pure helpers for `app/api/circle/webhook`. Kept free of Supabase and env
 * reads so they can be unit tested.
 */

/** `transactions.status` values (the `transaction_status` enum). */
export type TransactionStatus = "PENDING" | "CONFIRMED" | "COMPLETE" | "FAILED";

/**
 * The id to dedupe a webhook delivery on.
 *
 * Circle sends one notification per state change, and every one of them
 * carries the same `notification.id` (the transaction id). Only the top-level
 * `notificationId` is unique per notification, and it stays the same when
 * Circle retries a delivery, so that's the dedupe key. Deduping on the
 * transaction id dropped every update after the first, so a transfer never
 * reached COMPLETE.
 */
export function getWebhookEventId(body: {
  notificationId?: unknown;
  notification?: { id?: unknown; state?: unknown };
}): string {
  if (typeof body.notificationId === "string" && body.notificationId) {
    return body.notificationId;
  }
  // Every payload seen so far has a notificationId. If one ever doesn't, the
  // (transaction, state) pair still tells state changes apart.
  return `${String(body.notification?.id)}:${String(body.notification?.state ?? "")}`;
}

/**
 * Map a Circle DCW transaction state onto `transactions.status`, or `null` for
 * the in-flight states (INITIATED, QUEUED, SENT, CLEARED, ...) we don't track.
 */
export function toTransactionStatus(state: unknown): TransactionStatus | null {
  switch (state) {
    case "CONFIRMED":
    case "COMPLETE":
    case "FAILED":
      return state;
    // Terminal states that mean the transfer will never land.
    case "CANCELLED":
    case "DENIED":
      return "FAILED";
    default:
      return null;
  }
}

const STATUS_RANK: Record<TransactionStatus, number> = {
  PENDING: 0,
  CONFIRMED: 1,
  COMPLETE: 2,
  FAILED: 2,
};

/**
 * The current statuses a row may be moved *from* when `next` arrives.
 *
 * Circle doesn't promise delivery order, so a late CONFIRMED must not undo a
 * COMPLETE, and nothing reopens a terminal row.
 */
export function statusesReplaceableBy(next: TransactionStatus): TransactionStatus[] {
  return (Object.keys(STATUS_RANK) as TransactionStatus[]).filter(
    (status) => STATUS_RANK[status] < STATUS_RANK[next]
  );
}

/**
 * The `transactions.currency` for a Circle token symbol, or `null` for tokens
 * the app doesn't model (vault shares, other ERC-20s).
 */
export function currencyFromTokenSymbol(symbol: unknown): Currency | null {
  if (typeof symbol !== "string") return null;
  const upper = symbol.toUpperCase();
  return upper === "USDC" || upper === "EURC" ? upper : null;
}
