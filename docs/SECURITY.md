# Security Policy

## Reporting a vulnerability

- **Do not** open public issues for suspected vulnerabilities.
- **Preferred:** Use GitHub **private vulnerability reporting** for this repository when it is enabled (**Settings → Security → Code security → Private vulnerability reporting**). That keeps details off the public tracker.
- Otherwise, report privately to the maintainers (see [.github/CODEOWNERS](../.github/CODEOWNERS)) using a channel suitable for confidential material.
- Include reproduction steps, affected files, and impact assessment.

**Conduct vs security:** Reports about harassment or Code of Conduct violations are **not** handled through this security path—see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Response targets

- Initial acknowledgement: within 72 hours.
- Triage decision: within 7 days.
- Fix or mitigation plan: as soon as a verified patch path is available.

## Scope

- Dashboard API routes, authentication gates, scheduling, deployment hooks, and OSS export boundaries.
- Secrets exposure in docs, logs, or config templates.

## Disclosure

- Coordinated disclosure after a fix is available and validated.
- Changelog entries should describe impact and remediation at a high level.
