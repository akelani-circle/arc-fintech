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

-- Grant table-level privileges to the API roles.
--
-- Newer Supabase no longer auto-grants DML on the public schema to anon /
-- authenticated / service_role the way older versions did, so tables created by
-- earlier migrations only carry RLS policies and lack the underlying grants.
-- Without grants Postgres denies access at 42501 (permission denied for table)
-- before RLS is ever evaluated. RLS still constrains which rows each role sees;
-- these grants only restore the table-level access RLS depends on.

-- User-facing tables: authenticated users operate on their own rows (enforced by
-- RLS). service_role (secret key / backend) bypasses RLS and needs full access.
grant select, insert, update, delete on public.wallets to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.compliance_logs to authenticated;

grant all on public.wallets to service_role;
grant all on public.transactions to service_role;
grant all on public.compliance_logs to service_role;

-- Backend-only table: managed exclusively by service_role (webhook dedupe).
grant all on public.webhook_events to service_role;
