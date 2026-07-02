/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { withAuth } from "@/lib/api/with-auth"
import { handleEarnWrite } from "@/lib/earn/write-route"

/** Withdraw USDC from an Earn vault (redeem shares) via EarnKit's `withdraw`. */
export const POST = withAuth((req, ctx) => handleEarnWrite("withdraw", req, ctx))
