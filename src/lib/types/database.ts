// Hand-written Supabase Database type mirroring supabase/migrations/*.sql.
// Regenerate against a real project later with:
//   npx supabase gen types typescript --project-id <id> > src/lib/types/database.ts
// Keep this file in sync with the migrations until then.

export type UserRole = "owner" | "admin" | "manager" | "employee";
export type PosImportStatus = "uploaded" | "processing" | "completed" | "failed";
export type RevenueLeakStatus = "open" | "challenge_created" | "dismissed" | "resolved";
export type ChallengeStatus = "draft" | "scheduled" | "active" | "completed" | "cancelled";
export type MissionRewardType = "xp" | "points";
export type PointTransactionType = "earn" | "redeem" | "adjustment" | "reversal";
export type RedemptionStatus = "pending" | "approved" | "fulfilled" | "cancelled";
export type NotificationType =
  | "new_challenge"
  | "points_earned"
  | "level_up"
  | "mission_completed"
  | "leaderboard_change"
  | "team_goal_progress"
  | "challenge_completed"
  | "reward_unlocked";

export type MetricCode =
  | "beverage_attachment"
  | "addon_attachment"
  | "premium_upgrade_rate"
  | "average_ticket"
  | "loyalty_enrollment"
  | "dessert_attachment";

interface Table<Row, Insert, Update> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface Database {
  public: {
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Tables: {
      organizations: Table<
        {
          id: string;
          name: string;
          created_at: string;
          subscription_status: string;
          timezone: string;
          default_point_value: number;
        },
        {
          id?: string;
          name: string;
          created_at?: string;
          subscription_status?: string;
          timezone?: string;
          default_point_value?: number;
        },
        Partial<{
          id: string;
          name: string;
          created_at: string;
          subscription_status: string;
          timezone: string;
          default_point_value: number;
        }>
      >;

      locations: Table<
        {
          id: string;
          organization_id: string;
          name: string;
          external_id: string | null;
          address: string | null;
          timezone: string;
          active: boolean;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          name: string;
          external_id?: string | null;
          address?: string | null;
          timezone?: string;
          active?: boolean;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          name: string;
          external_id: string | null;
          address: string | null;
          timezone: string;
          active: boolean;
          created_at: string;
        }>
      >;

      profiles: Table<
        {
          id: string;
          organization_id: string | null;
          first_name: string;
          last_name: string;
          email: string;
          phone: string | null;
          role: UserRole;
          avatar_url: string | null;
          active: boolean;
          created_at: string;
        },
        {
          id: string;
          organization_id?: string | null;
          first_name?: string;
          last_name?: string;
          email: string;
          phone?: string | null;
          role?: UserRole;
          avatar_url?: string | null;
          active?: boolean;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string | null;
          first_name: string;
          last_name: string;
          email: string;
          phone: string | null;
          role: UserRole;
          avatar_url: string | null;
          active: boolean;
          created_at: string;
        }>
      >;

      employee_locations: Table<
        {
          id: string;
          employee_id: string;
          location_id: string;
          primary_location: boolean;
          created_at: string;
        },
        {
          id?: string;
          employee_id: string;
          location_id: string;
          primary_location?: boolean;
          created_at?: string;
        },
        Partial<{
          id: string;
          employee_id: string;
          location_id: string;
          primary_location: boolean;
          created_at: string;
        }>
      >;

      pos_imports: Table<
        {
          id: string;
          organization_id: string;
          filename: string;
          status: PosImportStatus;
          imported_at: string;
          date_start: string | null;
          date_end: string | null;
          row_count: number;
          error_count: number;
          import_type: string;
        },
        {
          id?: string;
          organization_id: string;
          filename: string;
          status?: PosImportStatus;
          imported_at?: string;
          date_start?: string | null;
          date_end?: string | null;
          row_count?: number;
          error_count?: number;
          import_type?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          filename: string;
          status: PosImportStatus;
          imported_at: string;
          date_start: string | null;
          date_end: string | null;
          row_count: number;
          error_count: number;
          import_type: string;
        }>
      >;

      transactions: Table<
        {
          id: string;
          organization_id: string;
          location_id: string;
          external_transaction_id: string;
          employee_id: string | null;
          transaction_timestamp: string;
          subtotal: number;
          discount_total: number;
          tax_total: number;
          total: number;
          refund_amount: number;
          voided: boolean;
          customer_id: string | null;
          order_channel: string;
          imported_at: string;
        },
        {
          id?: string;
          organization_id: string;
          location_id: string;
          external_transaction_id: string;
          employee_id?: string | null;
          transaction_timestamp: string;
          subtotal?: number;
          discount_total?: number;
          tax_total?: number;
          total?: number;
          refund_amount?: number;
          voided?: boolean;
          customer_id?: string | null;
          order_channel?: string;
          imported_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          location_id: string;
          external_transaction_id: string;
          employee_id: string | null;
          transaction_timestamp: string;
          subtotal: number;
          discount_total: number;
          tax_total: number;
          total: number;
          refund_amount: number;
          voided: boolean;
          customer_id: string | null;
          order_channel: string;
          imported_at: string;
        }>
      >;

      transaction_items: Table<
        {
          id: string;
          transaction_id: string;
          organization_id: string;
          location_id: string;
          employee_id: string | null;
          external_item_id: string | null;
          item_name: string;
          category: string | null;
          quantity: number;
          unit_price: number;
          total_price: number;
          modifier_names: string[];
          refunded: boolean;
          voided: boolean;
          created_at: string;
        },
        {
          id?: string;
          transaction_id: string;
          organization_id: string;
          location_id: string;
          employee_id?: string | null;
          external_item_id?: string | null;
          item_name: string;
          category?: string | null;
          quantity?: number;
          unit_price?: number;
          total_price?: number;
          modifier_names?: string[];
          refunded?: boolean;
          voided?: boolean;
          created_at?: string;
        },
        Partial<{
          id: string;
          transaction_id: string;
          organization_id: string;
          location_id: string;
          employee_id: string | null;
          external_item_id: string | null;
          item_name: string;
          category: string | null;
          quantity: number;
          unit_price: number;
          total_price: number;
          modifier_names: string[];
          refunded: boolean;
          voided: boolean;
          created_at: string;
        }>
      >;

      metric_definitions: Table<
        {
          id: string;
          code: string;
          name: string;
          description: string | null;
          metric_type: string;
          numerator_definition: string | null;
          denominator_definition: string | null;
          active: boolean;
        },
        {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          metric_type?: string;
          numerator_definition?: string | null;
          denominator_definition?: string | null;
          active?: boolean;
        },
        Partial<{
          id: string;
          code: string;
          name: string;
          description: string | null;
          metric_type: string;
          numerator_definition: string | null;
          denominator_definition: string | null;
          active: boolean;
        }>
      >;

      metric_snapshots: Table<
        {
          id: string;
          organization_id: string;
          location_id: string;
          employee_id: string | null;
          metric_code: string;
          period_start: string;
          period_end: string;
          numerator: number;
          denominator: number;
          value: number;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          location_id: string;
          employee_id?: string | null;
          metric_code: string;
          period_start: string;
          period_end: string;
          numerator?: number;
          denominator?: number;
          value?: number;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          location_id: string;
          employee_id: string | null;
          metric_code: string;
          period_start: string;
          period_end: string;
          numerator: number;
          denominator: number;
          value: number;
          created_at: string;
        }>
      >;

      revenue_leaks: Table<
        {
          id: string;
          organization_id: string;
          location_id: string;
          metric_code: string;
          current_value: number;
          benchmark_value: number;
          gap: number;
          estimated_incremental_revenue: number;
          estimated_contribution_profit: number;
          confidence_score: number;
          status: RevenueLeakStatus;
          detected_at: string;
        },
        {
          id?: string;
          organization_id: string;
          location_id: string;
          metric_code: string;
          current_value: number;
          benchmark_value: number;
          gap: number;
          estimated_incremental_revenue?: number;
          estimated_contribution_profit?: number;
          confidence_score?: number;
          status?: RevenueLeakStatus;
          detected_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          location_id: string;
          metric_code: string;
          current_value: number;
          benchmark_value: number;
          gap: number;
          estimated_incremental_revenue: number;
          estimated_contribution_profit: number;
          confidence_score: number;
          status: RevenueLeakStatus;
          detected_at: string;
        }>
      >;

      challenges: Table<
        {
          id: string;
          organization_id: string;
          location_id: string;
          revenue_leak_id: string | null;
          title: string;
          description: string | null;
          metric_code: string;
          start_date: string;
          end_date: string;
          baseline_value: number;
          target_value: number;
          projected_incremental_revenue: number;
          projected_contribution_profit: number;
          reward_budget: number;
          status: ChallengeStatus;
          created_by: string | null;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          location_id: string;
          revenue_leak_id?: string | null;
          title: string;
          description?: string | null;
          metric_code: string;
          start_date: string;
          end_date: string;
          baseline_value?: number;
          target_value: number;
          projected_incremental_revenue?: number;
          projected_contribution_profit?: number;
          reward_budget?: number;
          status?: ChallengeStatus;
          created_by?: string | null;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          location_id: string;
          revenue_leak_id: string | null;
          title: string;
          description: string | null;
          metric_code: string;
          start_date: string;
          end_date: string;
          baseline_value: number;
          target_value: number;
          projected_incremental_revenue: number;
          projected_contribution_profit: number;
          reward_budget: number;
          status: ChallengeStatus;
          created_by: string | null;
          created_at: string;
        }>
      >;

      challenge_tiers: Table<
        {
          id: string;
          challenge_id: string;
          name: string;
          threshold_value: number;
          points_awarded: number;
          rank_order: number;
        },
        {
          id?: string;
          challenge_id: string;
          name: string;
          threshold_value: number;
          points_awarded: number;
          rank_order: number;
        },
        Partial<{
          id: string;
          challenge_id: string;
          name: string;
          threshold_value: number;
          points_awarded: number;
          rank_order: number;
        }>
      >;

      challenge_participants: Table<
        {
          id: string;
          challenge_id: string;
          employee_id: string;
          baseline_value: number;
          current_value: number;
          best_value: number;
          points_earned: number;
          rank: number | null;
          completed: boolean;
          updated_at: string;
        },
        {
          id?: string;
          challenge_id: string;
          employee_id: string;
          baseline_value?: number;
          current_value?: number;
          best_value?: number;
          points_earned?: number;
          rank?: number | null;
          completed?: boolean;
          updated_at?: string;
        },
        Partial<{
          id: string;
          challenge_id: string;
          employee_id: string;
          baseline_value: number;
          current_value: number;
          best_value: number;
          points_earned: number;
          rank: number | null;
          completed: boolean;
          updated_at: string;
        }>
      >;

      team_goals: Table<
        {
          id: string;
          challenge_id: string;
          location_id: string;
          target_value: number;
          current_value: number;
          points_awarded_per_employee: number;
          completed: boolean;
        },
        {
          id?: string;
          challenge_id: string;
          location_id: string;
          target_value: number;
          current_value?: number;
          points_awarded_per_employee?: number;
          completed?: boolean;
        },
        Partial<{
          id: string;
          challenge_id: string;
          location_id: string;
          target_value: number;
          current_value: number;
          points_awarded_per_employee: number;
          completed: boolean;
        }>
      >;

      daily_missions: Table<
        {
          id: string;
          organization_id: string;
          challenge_id: string | null;
          location_id: string;
          title: string;
          description: string | null;
          metric_code: string | null;
          target_value: number;
          reward_type: MissionRewardType;
          reward_amount: number;
          active_date: string;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          challenge_id?: string | null;
          location_id: string;
          title: string;
          description?: string | null;
          metric_code?: string | null;
          target_value: number;
          reward_type?: MissionRewardType;
          reward_amount?: number;
          active_date: string;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          challenge_id: string | null;
          location_id: string;
          title: string;
          description: string | null;
          metric_code: string | null;
          target_value: number;
          reward_type: MissionRewardType;
          reward_amount: number;
          active_date: string;
          created_at: string;
        }>
      >;

      employee_mission_progress: Table<
        {
          id: string;
          mission_id: string;
          employee_id: string;
          current_value: number;
          completed: boolean;
          reward_issued: boolean;
          updated_at: string;
        },
        {
          id?: string;
          mission_id: string;
          employee_id: string;
          current_value?: number;
          completed?: boolean;
          reward_issued?: boolean;
          updated_at?: string;
        },
        Partial<{
          id: string;
          mission_id: string;
          employee_id: string;
          current_value: number;
          completed: boolean;
          reward_issued: boolean;
          updated_at: string;
        }>
      >;

      point_ledger: Table<
        {
          id: string;
          organization_id: string;
          employee_id: string;
          transaction_type: PointTransactionType;
          source_type: string;
          source_id: string | null;
          points: number;
          dollar_value: number;
          description: string | null;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          employee_id: string;
          transaction_type: PointTransactionType;
          source_type: string;
          source_id?: string | null;
          points: number;
          dollar_value?: number;
          description?: string | null;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          employee_id: string;
          transaction_type: PointTransactionType;
          source_type: string;
          source_id: string | null;
          points: number;
          dollar_value: number;
          description: string | null;
          created_at: string;
        }>
      >;

      xp_ledger: Table<
        {
          id: string;
          organization_id: string;
          employee_id: string;
          source_type: string;
          source_id: string | null;
          xp: number;
          description: string | null;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          employee_id: string;
          source_type: string;
          source_id?: string | null;
          xp: number;
          description?: string | null;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          employee_id: string;
          source_type: string;
          source_id: string | null;
          xp: number;
          description: string | null;
          created_at: string;
        }>
      >;

      employee_levels: Table<
        {
          id: string;
          employee_id: string;
          current_level: number;
          current_xp: number;
          lifetime_xp: number;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          current_level?: number;
          current_xp?: number;
          lifetime_xp?: number;
          updated_at?: string;
        },
        Partial<{
          id: string;
          employee_id: string;
          current_level: number;
          current_xp: number;
          lifetime_xp: number;
          updated_at: string;
        }>
      >;

      streaks: Table<
        {
          id: string;
          employee_id: string;
          streak_type: string;
          current_streak: number;
          longest_streak: number;
          last_qualified_date: string | null;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          streak_type?: string;
          current_streak?: number;
          longest_streak?: number;
          last_qualified_date?: string | null;
          updated_at?: string;
        },
        Partial<{
          id: string;
          employee_id: string;
          streak_type: string;
          current_streak: number;
          longest_streak: number;
          last_qualified_date: string | null;
          updated_at: string;
        }>
      >;

      badges: Table<
        {
          id: string;
          code: string;
          name: string;
          description: string | null;
          icon: string | null;
          criteria_type: string;
          criteria_value: number | null;
        },
        {
          id?: string;
          code: string;
          name: string;
          description?: string | null;
          icon?: string | null;
          criteria_type: string;
          criteria_value?: number | null;
        },
        Partial<{
          id: string;
          code: string;
          name: string;
          description: string | null;
          icon: string | null;
          criteria_type: string;
          criteria_value: number | null;
        }>
      >;

      employee_badges: Table<
        {
          id: string;
          employee_id: string;
          badge_id: string;
          earned_at: string;
        },
        {
          id?: string;
          employee_id: string;
          badge_id: string;
          earned_at?: string;
        },
        Partial<{
          id: string;
          employee_id: string;
          badge_id: string;
          earned_at: string;
        }>
      >;

      reward_catalog: Table<
        {
          id: string;
          organization_id: string | null;
          name: string;
          description: string | null;
          point_cost: number;
          dollar_value: number;
          reward_type: string;
          active: boolean;
        },
        {
          id?: string;
          organization_id?: string | null;
          name: string;
          description?: string | null;
          point_cost: number;
          dollar_value: number;
          reward_type?: string;
          active?: boolean;
        },
        Partial<{
          id: string;
          organization_id: string | null;
          name: string;
          description: string | null;
          point_cost: number;
          dollar_value: number;
          reward_type: string;
          active: boolean;
        }>
      >;

      reward_redemptions: Table<
        {
          id: string;
          organization_id: string;
          employee_id: string;
          reward_id: string;
          points_spent: number;
          dollar_value: number;
          status: RedemptionStatus;
          redeemed_at: string;
          fulfilled_at: string | null;
        },
        {
          id?: string;
          organization_id: string;
          employee_id: string;
          reward_id: string;
          points_spent: number;
          dollar_value: number;
          status?: RedemptionStatus;
          redeemed_at?: string;
          fulfilled_at?: string | null;
        },
        Partial<{
          id: string;
          organization_id: string;
          employee_id: string;
          reward_id: string;
          points_spent: number;
          dollar_value: number;
          status: RedemptionStatus;
          redeemed_at: string;
          fulfilled_at: string | null;
        }>
      >;

      notifications: Table<
        {
          id: string;
          organization_id: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body: string | null;
          read: boolean;
          link: string | null;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body?: string | null;
          read?: boolean;
          link?: string | null;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body: string | null;
          read: boolean;
          link: string | null;
          created_at: string;
        }>
      >;

      pos_column_mappings: Table<
        {
          id: string;
          organization_id: string;
          name: string;
          mapping: Record<string, string | null>;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          name?: string;
          mapping: Record<string, string | null>;
          created_at?: string;
          updated_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          name: string;
          mapping: Record<string, string | null>;
          created_at: string;
          updated_at: string;
        }>
      >;
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type Inserts<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type Updates<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
