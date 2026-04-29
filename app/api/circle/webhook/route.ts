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

import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

type CircleNotification = {
  id: string;
  state: string;
  txHash?: string;
  errorReason?: string;
  [k: string]: unknown;
};

interface CircleWebhookPayload {
  notificationType: string;
  notification: CircleNotification;
  [k: string]: unknown;
}

async function verifyCircleSignature(
  bodyString: string,
  signature: string,
  keyId: string
): Promise<boolean> {
  try {
    const publicKey = await getCirclePublicKey(keyId);
    const verifier = crypto.createVerify("SHA256");
    verifier.update(bodyString);
    verifier.end();
    const signatureUint8Array = Uint8Array.from(Buffer.from(signature, "base64"));
    return verifier.verify(publicKey, signatureUint8Array);
  } catch (e) {
    console.error("Signature verification failure:", e);
    return false;
  }
}

async function getCirclePublicKey(keyId: string) {
  if (!process.env.CIRCLE_API_KEY) throw new Error("Circle API key is not set");
  const response = await fetch(
    `https://api.circle.com/v2/notifications/publicKey/${keyId}`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
      },
    }
  );
  if (!response.ok) throw new Error(`Failed to fetch public key`);
  const data = await response.json();
  const rawPublicKey = data?.data?.publicKey;
  return [
    "-----BEGIN PUBLIC KEY-----",
    ...(rawPublicKey.match(/.{1,64}/g) ?? []),
    "-----END PUBLIC KEY-----",
  ].join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-circle-signature");
    const keyId = req.headers.get("x-circle-key-id");

    if (!signature || !keyId) {
      return NextResponse.json({ error: "Missing headers" }, { status: 400 });
    }

    const rawBody = await req.text();
    const isVerified = await verifyCircleSignature(rawBody, signature, keyId);
    if (!isVerified) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
    }

    const body: CircleWebhookPayload = JSON.parse(rawBody);
    const { notificationType, notification } = body;

    // Idempotency: try to insert the event. If the notification id has been
    // seen before, the unique constraint on webhook_events.notification_id
    // rejects the insert and we ack with 200 without doing the side effects
    // again. This replaces the previous in-handler 30s retry loop, which
    // both blocked the response and could double-apply state on retries.
    const { error: insertErr } = await supabaseAdmin
      .from("webhook_events")
      .insert({
        notification_id: notification.id,
        notification_type: notificationType,
        circle_transaction_id: notification.id,
        state: notification.state,
        payload: body as unknown as Record<string, unknown>,
      });

    if (insertErr) {
      // Postgres unique-violation code is 23505. Anything else is a real error.
      const code = (insertErr as { code?: string }).code;
      if (code === "23505") {
        return NextResponse.json({ received: true, duplicate: true }, { status: 200 });
      }
      console.error("Failed to record webhook event:", insertErr);
      // Fall through: still try to apply the update so we don't lose data when
      // the dedupe table is misconfigured.
    }

    if (
      notificationType === "transactions.outbound" ||
      notificationType === "transactions.inbound"
    ) {
      // The transaction_status enum only contains PENDING, CONFIRMED, COMPLETE,
      // FAILED. Anything outside that maps to a no-op.
      const allowedStates = ["PENDING", "CONFIRMED", "COMPLETE", "FAILED"] as const;
      type AllowedState = (typeof allowedStates)[number];
      const newStatus: AllowedState | null = (allowedStates as readonly string[]).includes(
        notification.state
      )
        ? (notification.state as AllowedState)
        : null;

      if (notification.state === "FAILED") {
        console.error(
          `Transaction ${notification.id} FAILED on chain. Reason: ${notification.errorReason ?? "unknown"}`
        );
      }

      if (newStatus) {
        const txHash = notification.txHash;
        const updatePayload: Record<string, unknown> = {
          status: newStatus,
          circle_transaction_id: notification.id,
          updated_at: new Date().toISOString(),
        };
        if (txHash) {
          updatePayload.tx_hash = txHash;
        }

        // Single-pass update. We try matching by circle_transaction_id first
        // (the common case), and if no rows match and we have a tx_hash, also
        // try matching REBALANCE rows by tx_hash. There is no inline retry
        // loop: if neither matches, the originating API call hasn't written
        // its row yet and a later webhook (or polling) will reconcile.
        const { data: stdRows, error: stdErr } = await supabaseAdmin
          .from("transactions")
          .update(updatePayload)
          .eq("circle_transaction_id", notification.id)
          .select("id");

        if (stdErr) {
          console.error("Supabase update error (standard):", stdErr);
        }

        if ((stdRows?.length ?? 0) === 0 && txHash) {
          const { error: rebalErr } = await supabaseAdmin
            .from("transactions")
            .update(updatePayload)
            .eq("tx_hash", txHash)
            .eq("type", "REBALANCE")
            .select("id");

          if (rebalErr) {
            console.error("Supabase update error (rebalance):", rebalErr);
          }
        }
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function HEAD() {
  return NextResponse.json({}, { status: 200 });
}
