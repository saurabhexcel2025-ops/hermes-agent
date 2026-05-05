-- ============================================================
-- Seed: 003_mighty_ducks
-- Seeds the Mighty Ducks organisation and Development team.
-- Must run AFTER 002_orgs.sql and 002_profiles_seed.sql.
-- ============================================================

-- Create Mighty Ducks organisation (Bob is org leader — use seed-bob from 002_dev_team_seed)
INSERT OR IGNORE INTO organisations (id, name, description, leader_id, created_at, updated_at)
VALUES (
  'org-mighty-ducks',
  'Mighty Ducks',
  'PatterTech''s elite autonomous development unit.',
  'seed-bob',
  datetime('now'),
  datetime('now')
);

-- Create Development team
INSERT OR IGNORE INTO teams (id, name, description, leader_id, created_at, updated_at)
VALUES (
  'team-development',
  'Development',
  'Core software engineering team responsible for product development.',
  'dev-lead',
  datetime('now'),
  datetime('now')
);

-- Add specialists to Development team
INSERT OR IGNORE INTO team_members (id, team_id, profile_id, role, joined_at) VALUES
  ('tm-dev-lead', 'team-development', 'dev-lead', 'leader', datetime('now')),
  ('tm-swe',       'team-development', 'swe',       'specialist', datetime('now')),
  ('tm-qa',        'team-development', 'qa',        'specialist', datetime('now')),
  ('tm-devops',    'team-development', 'devops',     'specialist', datetime('now')),
  ('tm-product',   'team-development', 'product',   'specialist', datetime('now')),
  ('tm-ux-design', 'team-development', 'ux-design', 'specialist', datetime('now'));

-- Assign Development team to Mighty Ducks org
INSERT OR IGNORE INTO organisation_teams (id, org_id, team_id, position, joined_at) VALUES
  ('ot-mighty-ducks-dev', 'org-mighty-ducks', 'team-development', 0, datetime('now'));
