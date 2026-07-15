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

// EURC Contract Addresses mapped by DB Blockchain string
// Source: https://developers.circle.com/stablecoins/eurc-contract-addresses
export const CHAIN_TO_EURC_ADDRESS: Record<string, string> = {
  "ETH-SEPOLIA": "0x08210F9170F89Ab7658F0B5E3fF39b0E03C594D4",
  "AVAX-FUJI": "0x5E44db7996c682E92a960b65AC713a54AD815c6B",
  "BASE-SEPOLIA": "0x808456652fdb597867f38412077A9182bf77359F",
  "ARC-TESTNET": "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
};
