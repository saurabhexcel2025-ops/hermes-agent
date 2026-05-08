-- ============================================================
-- Seed: 002_profiles_seed
-- Seeds specialist agent profiles for the PatterTech
-- Development team. These live in SQLite (Control Hub's
-- own registry), separate from Hermes profile directories.
-- ============================================================

INSERT OR IGNORE INTO agent_profiles (id, name, description, role, status, config, created_at, updated_at)
VALUES
  (
    'bob',
    'Bob',
    'CEO of PatterTech. Orchestrates the full operation, sets priorities, and reviews all significant outputs.',
    'leader',
    'active',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'dev-lead',
    'Dev Lead',
    'Senior software engineer who leads the development team. Responsible for architecture decisions, code quality standards, and mentoring junior engineers.',
    'leader',
    'active',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'swe',
    'SWE',
    'Full-stack software engineer. Implements features with high quality, writes comprehensive tests, and conducts peer code reviews.',
    'specialist',
    'active',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'qa',
    'QA Engineer',
    'Quality assurance engineer. Writes test plans and strategies, identifies edge cases, verifies bug fixes, and maintains release quality gates.',
    'specialist',
    'active',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'devops',
    'DevOps',
    'Infrastructure and DevOps engineer. Manages CI/CD pipelines, deployment automation, server monitoring, and system reliability.',
    'specialist',
    'active',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'product',
    'Product',
    'Product manager. Defines product requirements, prioritises the backlog, aligns team output with business goals, and manages stakeholder communication.',
    'specialist',
    'active',
    '{}',
    datetime('now'),
    datetime('now')
  ),
  (
    'ux-design',
    'UI/UX Designer',
    'User experience designer. Creates wireframes and prototypes, reviews UX for usability and accessibility, and ensures consistent visual design language.',
    'specialist',
    'active',
    '{}',
    datetime('now'),
    datetime('now')
  );
