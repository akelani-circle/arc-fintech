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
 * Maximum slippage tolerated on a swap, in basis points (300 = 3%, which is
 * also App Kit's own default).
 *
 * This is a server-side policy, not a user input: the execute route does not
 * read a slippage from the request body, because a caller could otherwise ask
 * for 100% tolerance and accept any output amount at all. The panel imports it
 * purely to display the figure it knows the server will apply.
 *
 * Lives here rather than in `lib/circle/app-kit-swap.ts` so the client bundle
 * can read it — that module is `server-only`.
 */
export const SWAP_SLIPPAGE_BPS = 300
