# Security Policy

## Supported Versions

Security updates are provided for the latest `master` branch and the latest tagged release.

## Reporting a Vulnerability

Please do not open public issues for security vulnerabilities.

Report privately with:

- Affected version or commit
- Reproduction steps
- Impact assessment
- Any proposed remediation

If private reporting channels are not configured yet, open a minimal issue asking maintainers to establish a private disclosure channel before sharing details.

## Security Expectations

This project handles filesystem, git, and command execution operations and follows a security-first approach:

- Path traversal is blocked
- Project boundary access is enforced
- Mutating operations require safeguards
- Command execution is allowlist-based
- Operation output and file sizes are limited
