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

/** The subset of `transaction_status` a freshly-executed swap can land in. */
export type SwapTransactionStatus = "PENDING" | "CONFIRMED" | "FAILED"

/** App Kit's swap lifecycle status (`SwapResult.progress.status`). */
export type AppKitSwapStatus = "DONE" | "PENDING" | "FAILED" | "NOT_FOUND"

/**
 * Translate App Kit's swap lifecycle into our `transaction_status` enum.
 *
 * This lives in its own module — rather than inside `lib/circle/app-kit-swap.ts`,
 * which is `server-only` and therefore unimportable from the test runner — so
 * the mapping can be unit-tested directly. It is the only trustworthy success
 * signal for a swap: `swap()` *resolves* rather than throwing when a swap fails
 * after on-chain submission, and `SwapResult.txHash` is always populated, so
 * keying the status off a txHash records every failure as a success.
 */
export function toSwapTransactionStatus(
  status: AppKitSwapStatus | string
): SwapTransactionStatus {
  switch (status) {
    case "DONE":
      return "CONFIRMED"
    case "FAILED":
      return "FAILED"
    // 'PENDING' (still in flight) and 'NOT_FOUND' (submitted, but the service
    // has not indexed it yet) both mean "not settled". Record them as PENDING
    // and let the Circle webhook reconcile the row by tx_hash. An unrecognised
    // status is treated the same way: never optimistically CONFIRMED.
    default:
      return "PENDING"
  }
}
