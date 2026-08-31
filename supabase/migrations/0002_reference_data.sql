-- Rev Catcher — reference data: metric definitions, badges, global reward catalog
-- These are platform-level, not tenant-scoped.

insert into metric_definitions (code, name, description, metric_type, numerator_definition, denominator_definition) values
  ('beverage_attachment', 'Beverage Attachment', 'Share of eligible food transactions that also include a beverage.', 'attachment_rate', 'eligible transactions containing a beverage item', 'eligible transactions containing a food/main item'),
  ('addon_attachment', 'Add-On Attachment', 'Share of eligible transactions that include a manager-defined add-on item.', 'attachment_rate', 'eligible transactions containing an add-on item', 'eligible transactions'),
  ('premium_upgrade_rate', 'Premium Upgrade Rate', 'Share of eligible transactions containing an identified premium upgrade item or modifier.', 'attachment_rate', 'eligible transactions containing a premium upgrade', 'eligible transactions'),
  ('average_ticket', 'Average Ticket', 'Average transaction total, excluding refunds, voids, and extreme outliers.', 'average_value', 'sum of transaction totals (excl. refunds/voids/outliers)', 'count of transactions (excl. refunds/voids/outliers)'),
  ('loyalty_enrollment', 'Loyalty Enrollment', 'Share of eligible transactions resulting in a new loyalty enrollment.', 'attachment_rate', 'eligible transactions with a loyalty enrollment', 'eligible transactions'),
  ('dessert_attachment', 'Dessert Attachment', 'Share of eligible transactions that also include a dessert item.', 'attachment_rate', 'eligible transactions containing a dessert item', 'eligible transactions containing a food/main item')
on conflict (code) do nothing;

insert into badges (code, name, description, icon, criteria_type, criteria_value) values
  ('fast_starter', 'Fast Starter', 'Completed your first daily mission.', 'zap', 'missions_completed', 1),
  ('hot_streak', 'Hot Streak', 'Reached a 7-day participation streak.', 'flame', 'streak_days', 7),
  ('top_5', 'Top 5', 'Finished a challenge ranked in the top 5.', 'trophy', 'challenge_rank_max', 5),
  ('top_3', 'Top 3', 'Finished a challenge ranked in the top 3.', 'medal', 'challenge_rank_max', 3),
  ('challenge_winner', 'Challenge Winner', 'Finished a challenge ranked #1.', 'crown', 'challenge_rank_max', 1),
  ('team_player', 'Team Player', 'Helped the team hit a team goal.', 'users', 'team_goals_completed', 1),
  ('level_10', 'Level 10', 'Reached level 10.', 'star', 'level_reached', 10),
  ('level_25', 'Level 25', 'Reached level 25.', 'stars', 'level_reached', 25)
on conflict (code) do nothing;

-- Global reward catalog (organization_id null = available to all orgs by default)
insert into reward_catalog (organization_id, name, description, point_cost, dollar_value, reward_type, active) values
  (null, '$5 Reward', 'Redeem 500 points for a $5 reward.', 500, 5.00, 'gift_card', true),
  (null, '$10 Reward', 'Redeem 1,000 points for a $10 reward.', 1000, 10.00, 'gift_card', true),
  (null, '$25 Reward', 'Redeem 2,500 points for a $25 reward.', 2500, 25.00, 'gift_card', true),
  (null, '$50 Reward', 'Redeem 5,000 points for a $50 reward.', 5000, 50.00, 'gift_card', true);
