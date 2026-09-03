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

/**
 * Server-side half of the onramp environment switch.
 *
 * Do not import this from a client component: `ONRAMP_API_BASE_URL` has no
 * `NEXT_PUBLIC_` prefix, so in the browser it would read as undefined and
 * silently resolve to production. Route handlers and server components only.
 *
 * Unlike the reference demo, the checks here are exported as a function rather
 * than run at module scope. Throwing on import would break Next's build-time
 * page-data collection on any machine without onramp env vars set — the same
 * reason the session route constructs its kit lazily.
 */

import {
  ONRAMP_CLIENT_ENVIRONMENT,
  ONRAMP_WIDGET_BASE_URL,
  PRODUCTION_API_BASE_URL,
  SANDBOX_API_BASE_URL,
  SANDBOX_WIDGET_BASE_URL,
  readUrl,
  resolveEnvironment,
  type OnrampEnvironment,
} from "@/lib/circle/onramp-environment";

export const ONRAMP_API_BASE_URL = readUrl(process.env.ONRAMP_API_BASE_URL);

export const ONRAMP_SERVER_ENVIRONMENT: OnrampEnvironment = resolveEnvironment(
  ONRAMP_API_BASE_URL,
  PRODUCTION_API_BASE_URL,
  "ONRAMP_API_BASE_URL"
);

const SANDBOX_SETUP =
  `Set both, together: ONRAMP_API_BASE_URL=${SANDBOX_API_BASE_URL} and ` +
  `NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL=${SANDBOX_WIDGET_BASE_URL}. ` +
  "NEXT_PUBLIC_* is inlined at build time, so restart the dev server after " +
  "changing it.";

/** How a URL resolved, for an error message: unset and empty read the same. */
function describe(url: string | undefined): string {
  return url ?? "unset, so the kit's production default";
}

/**
 * Refuse to mint a session unless both halves of the config agree *and* point
 * at sandbox.
 *
 * Two separate failures, one check:
 *
 * 1. A mismatch fails invisibly. A kit key belongs to one environment, so the
 *    widget loads from one environment while the session was minted in the
 *    other, and the two silently ignore each other's messages. Refusing is
 *    louder than debugging that.
 * 2. Production is never right for this app. `DB_BLOCKCHAIN_TO_ONRAMP_CHAIN`
 *    maps only testnet chains, so a production session would charge a real
 *    payment method to settle on a chain the production onramp does not serve.
 *    The kit defaults to production whenever these are unset, which makes
 *    "forgot to configure" and "deliberately went to mainnet" the same state —
 *    so the safe one has to be the one that is spelled out.
 *
 * If this app ever grows mainnet wallets, relax the second check to a mismatch
 * check only and extend the chain map at the same time.
 */
export function assertOnrampSandbox(): void {
  if (ONRAMP_SERVER_ENVIRONMENT !== ONRAMP_CLIENT_ENVIRONMENT) {
    throw new Error(
      "Onramp environment mismatch: ONRAMP_API_BASE_URL resolves to " +
        `${ONRAMP_SERVER_ENVIRONMENT} (${describe(ONRAMP_API_BASE_URL)}) but ` +
        "NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL resolves to " +
        `${ONRAMP_CLIENT_ENVIRONMENT} (${describe(ONRAMP_WIDGET_BASE_URL)}). ` +
        SANDBOX_SETUP
    );
  }

  if (ONRAMP_SERVER_ENVIRONMENT === "production") {
    throw new Error(
      "Onramp is configured against production, where purchases charge a real " +
        "payment method and cannot be reversed. This app only creates testnet " +
        "wallets, so a production session has nowhere valid to settle. " +
        SANDBOX_SETUP
    );
  }
}

/**
 * Bare hostname to seal into the onramp session as `referrerDomain`, so
 * Circle can build a `frame-ancestors` allowlist naming this app.
 *
 * Per Circle's onramp-kit testing guide: unenforced in sandbox ("you can
 * test without it, but set it to verify your wiring") but required in
 * production, where a session for an unregistered hostname is refused
 * with a 403. `assertOnrampSandbox` currently blocks production outright,
 * so nothing depends on this yet — but deriving it now, the same way the
 * Gateway webhook URL is derived from the same env vars, means one less
 * thing to break if that guard is ever deliberately relaxed.
 *
 * Never accept this from the client: a caller-supplied value would let
 * them widen Circle's allowlist to a domain of their choosing. `undefined`
 * (an unset/malformed URL) is fine — the kit simply omits the field, which
 * is exactly what "unenforced in sandbox" describes.
 */
export function resolveReferrerDomain(): string | undefined {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.WEBHOOK_ENDPOINT_URL;
  if (!url) return undefined;
  try {
    return new URL(url).hostname || undefined;
  } catch {
    return undefined;
  }
}
