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
 * Which Circle onramp environment the app talks to, and the one place that
 * decides it.
 *
 * The onramp kit is configured by two independent URLs — the API base URL, used
 * by the server when minting a session, and the widget origin, used by both
 * halves — and falls back to its *production* endpoints when either is unset.
 * That default is the wrong one for this app: every wallet it can create is on
 * a testnet (see `SupportedChain` in `@/lib/circle/gateway-sdk`), so a session
 * minted against production would charge a real payment method to deliver funds
 * to a chain this app never reads. Hence the sandbox endpoints below, and hence
 * {@link assertOnrampSandbox} on the server.
 *
 * Safe to import from client components: it reads only `NEXT_PUBLIC_*`.
 */

export type OnrampEnvironment = "production" | "sandbox";

export const PRODUCTION_API_BASE_URL = "https://api.circle.com";
export const PRODUCTION_WIDGET_BASE_URL = "https://onramp.arc.io";
export const SANDBOX_API_BASE_URL = "https://api-test.circle.com";
export const SANDBOX_WIDGET_BASE_URL = "https://onramp-sandbox.arc.io";

/**
 * A variable that is unset, empty, or whitespace all mean the same thing to the
 * kit — use its built-in (production) default — so they collapse to `undefined`
 * here. `.env.local` files in the wild carry the key with an empty value more
 * often than they omit it, so this case is the common one, not the edge.
 */
export function readUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The origin of a configured URL. The widget value is written both ways in the
 * wild — bare origin, and origin plus `/launch/onramp/v1` — so the comparison
 * has to ignore the path. The kit still receives the value verbatim.
 */
function originOf(url: string, name: string): string {
  try {
    return new URL(url).origin;
  } catch {
    throw new Error(`${name} is not a valid URL: ${JSON.stringify(url)}`);
  }
}

/**
 * Production has to be named explicitly (or left unset, which is the kit's own
 * default). Anything else — sandbox, staging, a local proxy — is classified as
 * non-production, which is the safe direction to be wrong in: it keeps a
 * testnet build away from mainnet rather than the reverse.
 */
export function resolveEnvironment(
  url: string | undefined,
  productionUrl: string,
  name: string
): OnrampEnvironment {
  if (!url) return "production";
  return originOf(url, name) === productionUrl ? "production" : "sandbox";
}

/**
 * Read as this exact expression because Next inlines `NEXT_PUBLIC_*` at build
 * time: a dynamic lookup would come back undefined in the browser. `next dev`
 * only picks up a change on restart.
 */
export const ONRAMP_WIDGET_BASE_URL = readUrl(
  process.env.NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL
);

export const ONRAMP_CLIENT_ENVIRONMENT = resolveEnvironment(
  ONRAMP_WIDGET_BASE_URL,
  PRODUCTION_WIDGET_BASE_URL,
  "NEXT_PUBLIC_ONRAMP_WIDGET_BASE_URL"
);
