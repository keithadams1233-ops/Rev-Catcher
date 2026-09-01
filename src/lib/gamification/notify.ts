import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { NotificationType } from "@/lib/types/database";

/**
 * Shared `notifications` writer (spec's `notification_type` enum: new
 * challenge, points earned, level up, mission completed, leaderboard
 * change, team goal progress, challenge completed, reward unlocked).
 * Phase 2's goal builder already inserted `new_challenge` rows directly;
 * this is the one helper every other write (Phase 7's tier/team-goal
 * points, Phase 8's XP/level/mission/badge events) goes through instead
 * of each engine re-shaping the insert payload itself.
 *
 * A thin wrapper around one table's insert, same category as
 * `update-progress.ts`'s `insertPointLedgerIfMissing` — no business logic
 * to unit test, so no Vitest suite (consistent with every other writer in
 * this app: pure calculation gets tests, DB writes don't).
 */
export type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export interface NotificationInput {
  organizationId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
}

export async function sendNotification(supabase: ServiceClient, input: NotificationInput): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    organization_id: input.organizationId,
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    link: input.link ?? null,
  });
  if (error) throw error;
}

/** Batched form for fan-out events (e.g. a team goal completing for every
 * participant at once) — one insert instead of N round trips. */
export async function sendNotifications(supabase: ServiceClient, inputs: NotificationInput[]): Promise<void> {
  if (inputs.length === 0) return;

  const { error } = await supabase.from("notifications").insert(
    inputs.map((input) => ({
      organization_id: input.organizationId,
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    })),
  );
  if (error) throw error;
}
