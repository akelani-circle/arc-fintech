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

-- Transfers, payouts, swaps, rebalances and Earn writes record their row
-- (keyed by tx_hash) only after the transaction is on-chain. On Arc that is
-- under a second, so Circle's transactions.* webhooks often arrive *before*
-- the row exists: the handler finds nothing to update, and the row stays
-- PENDING forever. For an inbound leg to one of the user's own wallets (or an
-- Earn withdrawal's USDC), the handler instead records it as a separate
-- INBOUND row, duplicating the transaction. An Earn write that timed out is
-- recorded as PENDING under its Circle transaction id instead, with the same
-- problem.
--
-- Every delivery is stored in webhook_events before it is applied, so when the
-- row shows up we can apply what already arrived. Together with the handler's
-- own matching this gives the same result whichever side comes first.

-- The lookup below filters on the notification's txHash.
create index if not exists webhook_events_tx_hash_idx
  on public.webhook_events (lower(payload->'notification'->>'txHash'));

create or replace function public.apply_early_webhook_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  best text;
  best_hash text;
  by_hash boolean;
  rank_of_best int;
  rank_of_row int;
begin
  -- An INBOUND row the webhook handler inserts for a transfer the app already
  -- recorded (same user, same hash): skip it. The app's row got the state when
  -- it was written, from the webhook_events row that preceded this insert.
  if new.type = 'INBOUND' then
    if tg_op = 'INSERT' and new.tx_hash is not null and exists (
      select 1 from public.transactions t
      where t.user_id = new.user_id
        and lower(t.tx_hash) = lower(new.tx_hash)
        and t.type in ('REBALANCE', 'OUTBOUND', 'SWAP', 'EARN_DEPOSIT', 'EARN_WITHDRAW')
    ) then
      return null;
    end if;
    return new;
  end if;

  -- The handler matches app rows by Circle transaction id (any type), else by
  -- tx_hash (these types only). Mirror both.
  by_hash := new.tx_hash is not null
    and new.type in ('REBALANCE', 'OUTBOUND', 'SWAP', 'EARN_DEPOSIT', 'EARN_WITHDRAW');
  if not by_hash and new.circle_transaction_id is null then
    return new;
  end if;

  if by_hash then
    -- Drop an INBOUND duplicate the handler inserted before this row existed.
    delete from public.transactions t
    where t.user_id = new.user_id
      and t.type = 'INBOUND'
      and lower(t.tx_hash) = lower(new.tx_hash)
      and t.id <> new.id;
  end if;

  -- Furthest state already delivered for this row, mapped the way
  -- lib/circle/webhook-events.ts toTransactionStatus maps it.
  select s, h into best, best_hash
  from (
    select
      case e.state
        when 'CANCELLED' then 'FAILED'
        when 'DENIED' then 'FAILED'
        else e.state
      end as s,
      e.payload->'notification'->>'txHash' as h,
      e.received_at
    from public.webhook_events e
    where e.notification_type in ('transactions.outbound', 'transactions.inbound')
      and (
        (by_hash and lower(e.payload->'notification'->>'txHash') = lower(new.tx_hash))
        or (new.circle_transaction_id is not null
            and e.circle_transaction_id = new.circle_transaction_id)
      )
  ) delivered
  where s in ('CONFIRMED', 'COMPLETE', 'FAILED')
  order by (s <> 'CONFIRMED') desc, received_at desc
  limit 1;

  if best is null then
    return new;
  end if;

  -- Forward only, like the handler: never undo a terminal state.
  rank_of_best := case best when 'CONFIRMED' then 1 else 2 end;
  rank_of_row := case new.status::text
    when 'PENDING' then 0
    when 'CONFIRMED' then 1
    else 2
  end;
  if rank_of_best > rank_of_row then
    new.status := best::public.transaction_status;
    if new.tx_hash is null and best_hash is not null then
      new.tx_hash := best_hash;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_early_webhook_state on public.transactions;
create trigger apply_early_webhook_state
  before insert or update of tx_hash on public.transactions
  for each row
  execute function public.apply_early_webhook_state();

-- Backfill. Older payout/transfer rows stored the on-chain hash in
-- circle_transaction_id (which holds Circle DCW transaction ids), so no webhook
-- could ever match them; move it to tx_hash.
update public.transactions
set tx_hash = circle_transaction_id, circle_transaction_id = null
where tx_hash is null
  and circle_transaction_id ~ '^0x[0-9a-fA-F]{64}$';

-- Then let the trigger settle every row still waiting on a webhook that
-- already arrived.
update public.transactions
set tx_hash = tx_hash
where tx_hash is not null
  and status in ('PENDING', 'CONFIRMED')
  and type in ('REBALANCE', 'OUTBOUND', 'SWAP', 'EARN_DEPOSIT', 'EARN_WITHDRAW');
