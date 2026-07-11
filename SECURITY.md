# Security Policy

## Supported Versions

Telgrarr is a personal-scale self-hosted project maintained by a single
developer. Only the most recently published release receives security
fixes; please upgrade to the latest release before reporting an issue.
## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use GitHub's private security advisory feature instead:

1. Visit https://github.com/Fahad-Beta/telgrarr/security/advisories
2. Click "Report a vulnerability"
3. Provide as much detail as possible (steps to reproduce, affected version,
   potential impact)

You should receive an acknowledgement within a few days. Credible reports
are investigated and coordinated disclosures are published alongside fixes.

## Scope

In scope:

- Authentication bypass or session compromise
- Webhook endpoint authentication weaknesses
- Secret leakage via logs, error responses, or persisted state
- Path traversal or arbitrary file read / write
- Remote code execution
- Privilege escalation inside the container or host process

Out of scope:

- Issues requiring a malicious operator with shell access to the host
- Self-XSS or other attacks requiring social engineering of the operator
- Vulnerabilities in third-party services Telgrarr integrates with
  (Sonarr, Radarr, Telegram, Emby, TMDB, OMDb) — report those to the
  respective project
- Missing security headers on endpoints that are not user-facing
- Denial-of-service via legitimate-looking but high-volume traffic

## Security Posture

Telgrarr is designed for a single operator running on infrastructure they
control. It is not multi-tenant and should not be exposed to untrusted
users. Always run behind a reverse proxy with TLS in production, and set
`WEBHOOK_SECRET` before exposing any webhook endpoint.
