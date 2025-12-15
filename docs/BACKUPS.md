# PROXX — BACKUP & RECOVERY POLICY

## Git

- Small, frequent commits
- Commit at the end of every phase
- No mega commits
- Docs updated alongside code

## Borg Backup

- Incremental Borg backups enabled
- Includes:
  - Repo
  - Configs
  - Presets
  - Logs (rotated)
- Daily automated backup
- Manual snapshot before overnight unattended runs

## Assumption

Developers must assume:
- The machine can die
- Power can be lost
- Jobs may be mid-run

Recovery is a feature, not an afterthought.