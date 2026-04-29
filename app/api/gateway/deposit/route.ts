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
import {
  initiateDepositFromCustodialWallet,
  PollingTimeoutError,
  GATEWAY_WALLET_ADDRESS,
} from "@/lib/circle/gateway-sdk";
import {
  validateJsonBody,
  blockchainSchema,
  evmAddressSchema,
} from "@/lib/api/validate";
import { SDK_CHAIN_BY_BLOCKCHAIN } from "@/lib/constants/chains";
import { withAuth } from "@/lib/api/with-auth";

const bodySchema = z.object({
  walletAddress: evmAddressSchema,
  blockchain: blockchainSchema,
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((n) => Number.isFinite(n) && n > 0, "Amount must be positive")
    .refine((n) => n <= 1_000_000_000, "Amount exceeds maximum allowed value"),
});

export const POST = withAuth(async (req, { user, supabase }) => {
  try {
    const parsed = await validateJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const { walletAddress, blockchain, amount } = parsed.data;
    const parsedAmount = amount;

    // Fetch the specific wallet from Supabase to get ID, Chain, and Type
    // Filter by BOTH address AND blockchain to avoid multiple results
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("circle_wallet_id, blockchain, type, address")
      .eq("user_id", user.id)
      .eq("address", walletAddress)
      .eq("blockchain", blockchain)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: "Wallet not found or does not belong to user." },
        { status: 404 }
      );
    }

    // Map the DB blockchain string to the SDK supported chain
    const sdkChain = SDK_CHAIN_BY_BLOCKCHAIN[wallet.blockchain];

    if (!sdkChain) {
      return NextResponse.json(
        { error: `Unsupported blockchain type: ${wallet.blockchain}` },
        { status: 400 }
      );
    }

    // Use proper rounding to avoid losing precision for small amounts
    const amountInAtomicUnits = BigInt(Math.round(parsedAmount * 1_000_000));
    
    if (amountInAtomicUnits === BigInt(0)) {
      return NextResponse.json(
        { error: "Amount too small. Minimum is 0.000001 USDC (1 atomic unit)." },
        { status: 400 }
      );
    }

    // All deposits (SCA and EOA) use the same Circle SDK method
    const tx = await initiateDepositFromCustodialWallet(
      wallet.circle_wallet_id,
      sdkChain,
      amountInAtomicUnits
    );

    // Store transaction in database
    await supabase.from("transactions").insert([
      {
        user_id: user.id,
        amount: parsedAmount,
        sender_address: walletAddress,
        recipient_address: GATEWAY_WALLET_ADDRESS,
        circle_transaction_id: tx.id,
        blockchain: wallet.blockchain,
        type: "OUTBOUND",
      },
    ]);

    return NextResponse.json({
      success: true,
      txHash: tx.txHash,
      chain: sdkChain,
      amount,
    });
  } catch (error: any) {
    console.error("Error in deposit:", error);

    if (error instanceof PollingTimeoutError) {
      return NextResponse.json(
        {
          success: false,
          status: "pending",
          txId: error.challengeId,
          message:
            "Deposit submitted but did not finalize within the request window. It may still complete; refresh balances shortly.",
        },
        { status: 202 }
      );
    }

    let errorMessage = "Internal server error";
    let statusCode = 500;

    if (error.message) {
      const msg = error.message.toLowerCase();
      if (msg.includes("gas") || msg.includes("intrinsic") || msg.includes("fee")) {
        errorMessage = "Insufficient gas. Please ensure the wallet has enough native tokens.";
        statusCode = 400;
      } else if (msg.includes("insufficient funds") || msg.includes("balance")) {
        errorMessage = "Insufficient USDC balance in the selected wallet.";
        statusCode = 400;
      } else if (msg.includes("network") || msg.includes("timeout")) {
        errorMessage = "Network error. Please try again.";
        statusCode = 503;
      } else if (error.message.length < 200) {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
});
