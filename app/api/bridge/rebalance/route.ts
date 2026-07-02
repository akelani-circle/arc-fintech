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

import { NextResponse } from "next/server";
import { z } from "zod";
import { getAppKit, getCircleWalletsAdapter } from "@/lib/circle/app-kit";
import { assertWalletsOwnedByUser } from "@/lib/api/ownership";
import { validateJsonBody, blockchainSchema } from "@/lib/api/validate";
import { APP_KIT_CHAIN_BY_BLOCKCHAIN } from "@/lib/constants/chains";
import { withAuth } from "@/lib/api/with-auth";

// Allow this handler to run for up to 60s — App Kit FAST transfers
// finish in 1-3 minutes but most testnet flows complete inside the budget,
// and any longer outcome is reported back via webhook + the tx row update.
export const maxDuration = 60;

interface AppKitError {
  message?: string;
  code?: number;
  type?: string;
}

interface TxHashPayload {
  txHash?: string;
  values?: {
    txHash?: string;
    forwardTxHash?: string;
    attestation?: { forwardTxHash?: string };
  };
  data?: {
    txHash?: string;
    forwardTxHash?: string;
    attestation?: { forwardTxHash?: string };
  };
}

const bodySchema = z.object({
  sourceWalletId: z.string().min(1),
  sourceChain: blockchainSchema,
  destinationWalletId: z.string().min(1),
  destinationChain: blockchainSchema,
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((n) => Number.isFinite(n) && n > 0, "Amount must be positive"),
  transferSpeed: z.enum(["FAST", "SLOW"]).default("SLOW"),
});

export const POST = withAuth(async (request, { user, supabase }) => {
  try {
    const parsed = await validateJsonBody(request, bodySchema);
    if (!parsed.ok) return parsed.response;
    const {
      sourceWalletId,
      sourceChain,
      destinationWalletId,
      destinationChain,
      amount: amountNum,
      transferSpeed,
    } = parsed.data;

    // App Kit expects amount in human-readable decimal format
    const amountString = amountNum.toFixed(2);
    let estimatedBridgeFee = 0;

    // Map chains to App Kit format
    const bridgeSourceChain = APP_KIT_CHAIN_BY_BLOCKCHAIN[sourceChain];
    const bridgeDestChain = APP_KIT_CHAIN_BY_BLOCKCHAIN[destinationChain];

    if (!bridgeSourceChain || !bridgeDestChain) {
      return NextResponse.json(
        { error: "Unsupported chain" },
        { status: 400 }
      );
    }

    // Confirm both wallet IDs belong to the authenticated user before we
    // execute any bridge operation against them.
    const owned = await assertWalletsOwnedByUser(supabase, user.id, [
      sourceWalletId,
      destinationWalletId,
    ]);
    if (!owned) {
      return NextResponse.json(
        { error: "Wallet not found" },
        { status: 404 }
      );
    }

    const sourceAddress =
      owned.find((w) => w.circle_wallet_id === sourceWalletId)?.address;
    const destAddress =
      owned.find((w) => w.circle_wallet_id === destinationWalletId)?.address;

    if (!sourceAddress || !destAddress) {
      return NextResponse.json(
        { error: "Wallet not found" },
        { status: 404 }
      );
    }

    console.log(`Using App Kit for ${transferSpeed} transfer: ${amountNum} USDC from ${sourceChain} to ${destinationChain}`);

    // Minimum transfer amount validation
    // FAST transfers have higher fees that can exceed very small amounts
    // Enforce a reasonable minimum to avoid "max fee must be less than amount" errors
    const MIN_TRANSFER_AMOUNT = transferSpeed === "FAST" ? 5.0 : 2.0;
    if (amountNum < MIN_TRANSFER_AMOUNT) {
      return NextResponse.json(
        { 
          error: "Amount too small",
          message: `Minimum transfer amount for ${transferSpeed} transfers is ${MIN_TRANSFER_AMOUNT} USDC. Your amount: ${amountNum} USDC. Try a larger amount or use ${transferSpeed === "FAST" ? "SLOW" : "a different"} transfer speed.`,
          minAmount: MIN_TRANSFER_AMOUNT,
          currentAmount: amountNum,
        },
        { status: 400 }
      );
    }

    const kit = getAppKit();
    const adapter = getCircleWalletsAdapter();
    const forwarderDestination = {
      chain: bridgeDestChain,
      recipientAddress: destAddress,
      useForwarder: true as const,
    };

    // Validate the transfer parameters early by running an estimate
    // This catches errors like insufficient balance before we commit to the transfer
    // However, note that estimate may not always catch relay/runtime execution issues
    try {
      console.log("Validating transfer parameters...");
      const estimateResult = await kit.estimateBridge({
        from: {
          adapter,
          chain: bridgeSourceChain,
          address: sourceAddress,
        },
        to: forwarderDestination,
        amount: amountString,
        config: {
          transferSpeed: transferSpeed as "FAST" | "SLOW",
        },
      });
      
      // Check if estimate has any fee errors
      if (estimateResult.fees && Array.isArray(estimateResult.fees)) {
        const feeErrors = estimateResult.fees.filter((fee) => fee.error);
        if (feeErrors.length > 0) {
          const errorMsg = feeErrors
            .map((f) => (f.error as { message?: string })?.message)
            .join('; ');
          throw new Error(`Fee estimation failed: ${errorMsg}`);
        }

        estimatedBridgeFee = estimateResult.fees.reduce(
          (total, fee) => {
            if (fee.token !== "USDC") return total;
            const parsedFee = Number(fee.amount);
            return Number.isFinite(parsedFee) ? total + parsedFee : total;
          },
          0
        );
      }
      
      console.log("Transfer parameters validated successfully");
    } catch (validationError) {
      console.error("Transfer validation failed:", validationError);

      const vErr = validationError as AppKitError;
      // Parse error type and provide user-friendly message
      let errorMessage = "Transfer validation failed";
      let errorDetails = vErr.message || "Unknown error";

      if (vErr.code === 9002 || vErr.type === 'BALANCE') {
        errorMessage = "Insufficient gas";
        errorDetails = `Not enough native currency to pay source-chain gas fees. Please fund the source wallet on ${sourceChain}.`;
      } else if (vErr.code === 9001 || vErr.message?.includes('Insufficient balance')) {
        errorMessage = "Insufficient USDC balance";
        errorDetails = `Not enough USDC in the source wallet to complete the transfer.`;
      } else if (vErr.type === 'INPUT') {
        errorMessage = "Invalid transfer parameters";
        errorDetails = vErr.message || "Unknown error";
      }

      return NextResponse.json(
        {
          error: errorMessage,
          message: errorDetails,
          code: vErr.code,
          type: vErr.type,
        },
        { status: 400 }
      );
    }

    const bridgeAmountString = (amountNum + estimatedBridgeFee).toFixed(6);

    // Log initial PENDING state to DB immediately
    const { data: txData, error: txError } = await supabase
      .from("transactions")
      .insert([
        {
          user_id: user.id,
          amount: amountNum,
          sender_address: sourceAddress,
          recipient_address: destAddress,
          tx_hash: null, // Will be updated when available
          circle_transaction_id: null,
          blockchain: sourceChain,
          type: "REBALANCE",
          status: "PENDING",
        },
      ])
      .select()
      .single();

    if (txError) {
      throw new Error(`Failed to create transaction record: ${txError.message}`);
    }

    // Execute the bridge transfer synchronously and respond when it
    // resolves (or fails). App Kit's forwarder handles burn ->
    // attestation -> mint, so on success the row is COMPLETE before we
    // return; on a transient timeout we surface 202 PENDING and the row
    // stays PENDING for the webhook / monitor poll to advance.
    const serializeBigInt = (obj: unknown): unknown => {
      if (obj === null || obj === undefined) return obj;
      if (typeof obj === "bigint") return obj.toString();
      if (Array.isArray(obj)) return obj.map(serializeBigInt);
      if (typeof obj === "object") {
        const serialized: Record<string, unknown> = {};
        for (const key in obj) {
          serialized[key] = serializeBigInt((obj as Record<string, unknown>)[key]);
        }
        return serialized;
      }
      return obj;
    };

    let burnTxHash: string | null = null;
    let mintTxHash: string | null = null;
    const extractTxHash = (payload: unknown): string | null => {
      const p = payload as TxHashPayload | null | undefined;
      return (
        p?.values?.txHash ??
        p?.txHash ??
        p?.data?.txHash ??
        p?.values?.forwardTxHash ??
        p?.data?.forwardTxHash ??
        p?.values?.attestation?.forwardTxHash ??
        p?.data?.attestation?.forwardTxHash ??
        null
      );
    };

    // Resolves as soon as the source-chain burn is broadcast. Once the burn is
    // on-chain, CCTP + the forwarder complete the transfer server-side at
    // Circle independently of this HTTP request, and the destination-mint
    // webhook reconciles the row to COMPLETE (see app/api/webhooks/circle).
    // So we can respond the moment the burn lands instead of blocking the whole
    // request on FAST/forwarder settlement (1-3 min) — which is what left the
    // rebalance dialog spinning indefinitely under `next dev`, where the
    // maxDuration budget isn't enforced.
    let signalBurn: () => void = () => {};
    const burnBroadcast = new Promise<void>((resolve) => {
      signalBurn = resolve;
    });

    kit.on("bridge.burn", async (payload) => {
      const hash = extractTxHash(payload);
      if (hash && !burnTxHash) {
        burnTxHash = hash;
        await supabase
          .from("transactions")
          .update({ tx_hash: burnTxHash, status: "PENDING" })
          .eq("id", txData.id);
        signalBurn();
      }
    });

    kit.on("bridge.mint", async (payload) => {
      const hash = extractTxHash(payload);
      if (hash) mintTxHash = hash;
    });

    // Run the bridge to completion in the background. Its resolution updates the
    // row to its terminal state and is best-effort: in a serverless deploy the
    // function may be frozen after we respond, in which case the webhook is the
    // source of truth. Handlers are attached here (not a bare await) so an
    // eventual rejection after we've already responded can't surface as an
    // unhandled promise rejection.
    const settlement = kit
      .bridge({
        from: {
          adapter,
          chain: bridgeSourceChain,
          address: sourceAddress,
        },
        to: forwarderDestination,
        amount: bridgeAmountString,
        config: {
          transferSpeed: transferSpeed as "FAST" | "SLOW",
        },
      })
      .then(async (result) => {
        if (!burnTxHash && result.steps && Array.isArray(result.steps)) {
          const burnStep = result.steps.find((step) => step.name === "burn");
          burnTxHash = extractTxHash(burnStep);
        }

        // Forwarder-only destinations may surface completion hash on mint or
        // attestation-oriented steps instead of a traditional destination mint.
        if (!mintTxHash && result.steps && Array.isArray(result.steps)) {
          const forwarderStep = result.steps.find((step) =>
            ["mint", "fetchAttestation", "reAttest"].includes(step?.name ?? "")
          );
          mintTxHash = extractTxHash(forwarderStep);
        }

        const finalStatus =
          result.state === "success"
            ? "COMPLETE"
            : result.state === "error"
              ? "FAILED"
              : "PENDING";

        const { error: updateError } = await supabase
          .from("transactions")
          .update({ tx_hash: burnTxHash, status: finalStatus })
          .eq("id", txData.id);

        if (updateError) {
          console.error("Failed to update transaction:", updateError);
        }

        // Unblock the responder even if the burn event never fired on its own.
        signalBurn();
        return { ok: true as const, result };
      })
      .catch(async (bridgeError: AppKitError) => {
        console.error("Bridge execution error:", bridgeError);

        await supabase
          .from("transactions")
          .update({ status: "FAILED", tx_hash: burnTxHash })
          .eq("id", txData.id);

        signalBurn();
        return { ok: false as const, error: bridgeError };
      });

    // Respond as soon as EITHER the burn is broadcast (common: reply 202
    // PENDING and let the forwarder + webhook finish) OR the bridge fully
    // settles in-band (SLOW transfers may complete before the burn signal is
    // even awaited, and any pre-burn failure resolves here too).
    const outcome = await Promise.race([
      settlement.then((s) => ({ kind: "settled" as const, s })),
      burnBroadcast.then(() => ({ kind: "burned" as const })),
    ]);

    if (outcome.kind === "settled") {
      const s = outcome.s;

      if (!s.ok) {
        const bridgeError = s.error;
        // Map common App Kit errors to friendlier messages.
        let userMessage = bridgeError?.message || "Bridge transfer failed";
        if (bridgeError?.code === 9002 || bridgeError?.type === "BALANCE") {
          userMessage =
            "Insufficient source-chain gas. Ensure the source wallet has native currency for gas fees.";
        } else if (bridgeError?.code === 9001) {
          userMessage = "Not enough USDC in the source wallet.";
        }

        return NextResponse.json(
          {
            success: false,
            error: "Bridge transfer failed",
            message: userMessage,
            code: bridgeError?.code,
            type: bridgeError?.type,
            txId: txData.id,
          },
          { status: 502 }
        );
      }

      const result = s.result;
      const finalStatus =
        result.state === "success"
          ? "COMPLETE"
          : result.state === "error"
            ? "FAILED"
            : "PENDING";

      return NextResponse.json({
        success: result.state === "success",
        result: {
          amount: amountNum.toString(),
          txHash: burnTxHash,
          mintTxHash: mintTxHash || undefined,
          status: finalStatus,
          state: result.state,
          details: serializeBigInt(result),
        },
      });
    }

    // Burn broadcast but the transfer hasn't settled in-band. Respond PENDING;
    // the destination-mint webhook flips the row to COMPLETE.
    return NextResponse.json(
      {
        success: true,
        result: {
          amount: amountNum.toString(),
          txHash: burnTxHash,
          mintTxHash: undefined,
          status: "PENDING",
          state: "pending",
        },
      },
      { status: 202 }
    );
  } catch (error) {
    console.error("Rebalance error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Error" },
      { status: 500 }
    );
  }
});
