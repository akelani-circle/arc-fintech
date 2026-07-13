-- Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
--
-- Licensed under the Apache License, Version 2.0 (the "License");
-- you may not use this file except in compliance with the License.
-- You may obtain a copy of the License at
--
--     http://www.apache.org/licenses/LICENSE-2.0
--
-- Unless required by applicable law or agreed to in writing, software
-- distributed under the License is distributed on an "AS IS" BASIS,
-- WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
-- See the License for the specific language governing permissions and
-- limitations under the License.
--
-- SPDX-License-Identifier: Apache-2.0

-- 1. Swap (App Kit Swap, USDC<->EURC on Arc Testnet) is logged as its own
-- transaction type, same pattern as EARN_DEPOSIT/EARN_WITHDRAW/BRIDGE.
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'SWAP';

-- 2. Every operation that moves funds can now be denominated in USDC or EURC.
-- Defaulted to USDC so existing rows (and any write path not yet updated to
-- pass a currency) keep their current meaning.
create type public.currency as enum ('USDC', 'EURC');

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS currency public.currency NOT NULL DEFAULT 'USDC';
