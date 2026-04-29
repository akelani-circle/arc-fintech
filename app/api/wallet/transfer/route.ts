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
import { circleDeveloperSdk } from "@/lib/circle/developer-controlled-wallets-client";
import { CHAIN_TO_USDC_ADDRESS } from "@/lib/constants/usdc-addresses";
import { validateJsonBody, evmAddressSchema } from "@/lib/api/validate";
import { withAuth } from "@/lib/api/with-auth";

const bodySchema = z.object({
  sourceWalletId: z.string().min(1),
  destinationAddress: evmAddressSchema,
  amount: z
    .union([z.string(), z.number()])
    .transform((v) => (typeof v === "string" ? Number(v) : v))
    .refine((n) => Number.isFinite(n) && n > 0, "Amount must be positive"),
});

// Convert USDC (6 decimals) to atomic units. Use Math.round to avoid losing
// the trailing penny on values like 0.000001 due to FP error.
function convertToSmallestUnit(amount: number): string {
  return BigInt(Math.round(amount * 1_000_000)).toString();
}

export const POST = withAuth(async (req, { user, supabase }) => {
  try {
    const parsed = await validateJsonBody(req, bodySchema);
    if (!parsed.ok) return parsed.response;
    const { sourceWalletId, destinationAddress, amount } = parsed.data;

    // 1. Fetch Source Wallet to get its blockchain
    const { data: sourceWallet, error: sourceError } = await supabase
      .from("wallets")
      .select("blockchain, address")
      .eq("user_id", user.id)
      .eq("circle_wallet_id", sourceWalletId)
      .single();

    if (sourceError || !sourceWallet || !sourceWallet.blockchain) {
      return NextResponse.json(
        { error: "Source wallet not found or missing blockchain data" },
        { status: 404 }
      );
    }

    const amountNum = amount;

    // 2. Get the USDC contract address for the source wallet's chain
    const usdcContractAddress = CHAIN_TO_USDC_ADDRESS[sourceWallet.blockchain];

    if (!usdcContractAddress) {
      return NextResponse.json(
        { error: `USDC contract not found for chain: ${sourceWallet.blockchain}` },
        { status: 400 }
      );
    }

    const response = await circleDeveloperSdk.createContractExecutionTransaction({
      walletId: sourceWalletId,
      contractAddress: usdcContractAddress,
      abiFunctionSignature: "transfer(address,uint256)",
      abiParameters: [
        destinationAddress,
        convertToSmallestUnit(amount),
      ],
      fee: {
        type: "level",
        config: {
          feeLevel: "HIGH",
        },
      },
    });

    const transactionData = response.data;

    if (!transactionData?.id) {
      throw new Error("Failed to initiate transfer with Circle API.");
    }

    // 4. Log to Transactions Table
    const { error: insertError } = await supabase.from("transactions").insert([
      {
        user_id: user.id,
        amount: amountNum,
        sender_address: sourceWallet.address,
        recipient_address: destinationAddress,
        circle_transaction_id: transactionData.id,
        blockchain: sourceWallet.blockchain,
        type: "OUTBOUND",
        status: "PENDING",
      },
    ]);

    if (insertError) {
      console.error("Failed to log transaction to Supabase:", insertError);
    }

    return NextResponse.json({
      success: true,
      txId: transactionData.id,
    });

  } catch (error: any) {
    console.error("Transfer error:", error);
    
    // Log detailed error information
    if (error?.response?.data) {
      console.error("Circle API error details:", JSON.stringify(error.response.data, null, 2));
    }

    let errorMessage = "Internal server error";
    if (error?.response?.data?.message) {
      errorMessage = error.response.data.message;
    } else if (error?.response?.data?.error) {
      errorMessage = error.response.data.error;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
});
