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
 * Only testnet chains appear here, and that is deliberate: the whole app runs
 * against sandbox (see `@/lib/circle/onramp-environment`), and the session
 * route refuses to mint rather than settle real fiat somewhere this app never
 * reads.
 *
 * The strings are the ones the kit's own `Blockchain` enum declares
 * (Ethereum_Sepolia, Base_Sepolia, Avalanche_Fuji, Arc_Testnet), so the spelling
 * is confirmed — but they have not been round-tripped against a live sandbox
 * session response. If wallets-api turns out to expect a different identifier
 * for `destinationChain`, correct this map; a wrong value surfaces as a failed
 * mint, not a misdirected deposit.
 *
 * Note the kit's inline docs still read "No public sandbox exists today, so
 * production is the default" — that predates the sandbox tier and describes the
 * kit's *default*, not its capability.
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
