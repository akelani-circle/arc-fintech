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

-- Add ONRAMP to transaction_type enum (fiat->crypto deposits via Onramp Kit)
ALTER TYPE public.transaction_type ADD VALUE IF NOT EXISTS 'ONRAMP';

-- Column to correlate a transaction row with the onramp session that produced it
ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS onramp_session_id text;

CREATE INDEX IF NOT EXISTS transactions_onramp_session_id_idx ON public.transactions(onramp_session_id);
