# Awaire Proxy — Backup & Recovery Policy

## Git

- Small, frequent commits
- No mega commits
- Docs updated alongside code

## Local Backup

- Incremental backups recommended
- Includes: Repo, Configs, Presets, Logs (rotated)

## Assumption

Developers must assume:
- The machine can die
- Power can be lost
- Jobs may be mid-run

Recovery is a feature, not an afterthought.

## Application Recovery

- SQLite database persists job state
- Restart detection identifies interrupted jobs
- RECOVERY_REQUIRED status for interrupted jobs
- Explicit operator action to resume
