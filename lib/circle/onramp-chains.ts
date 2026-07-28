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

import type { SupportedChain } from "@/lib/circle/gateway-sdk";

/**
 * Chain identifiers passed as `destinationChain` when minting an onramp
 * session, so the widget lands funds on the same chain the destination
 * wallet actually lives on instead of silently defaulting to Ethereum.
 *
 * Circle's onramp kit does not document a public testnet tier yet — its own
 * SDK notes "No public sandbox exists today, so production is the default."
 * These values are inferred from the shared chain-identifier enum bundled
 * inside @crcl-main/onramp-kit's type declarations (Ethereum_Sepolia,
 * Base_Sepolia, Avalanche_Fuji, Arc_Testnet), not confirmed against a real
 * onramp session response. Verify against actual API behavior once testnet
 * support ships and correct this map if wallets-api expects a different
 * string.
 */
export const ONRAMP_CHAIN_IDS: Record<SupportedChain, string> = {
  ethSepolia: "Ethereum_Sepolia",
  baseSepolia: "Base_Sepolia",
  avalancheFuji: "Avalanche_Fuji",
  arcTestnet: "Arc_Testnet",
};

/** DB `wallets.blockchain` value -> onramp `destinationChain` value. */
export const DB_BLOCKCHAIN_TO_ONRAMP_CHAIN: Record<string, string> = {
  "ETH-SEPOLIA": ONRAMP_CHAIN_IDS.ethSepolia,
  "BASE-SEPOLIA": ONRAMP_CHAIN_IDS.baseSepolia,
  "AVAX-FUJI": ONRAMP_CHAIN_IDS.avalancheFuji,
  "ARC-TESTNET": ONRAMP_CHAIN_IDS.arcTestnet,
};

/** Reverse of {@link DB_BLOCKCHAIN_TO_ONRAMP_CHAIN}, for interpreting webhook payloads. */
export const ONRAMP_CHAIN_TO_DB_BLOCKCHAIN: Record<string, string> = Object.fromEntries(
  Object.entries(DB_BLOCKCHAIN_TO_ONRAMP_CHAIN).map(([dbChain, onrampChain]) => [onrampChain, dbChain])
);
