# Replica Skill installation

Installed project-locally using the upstream documented folder-copy method.

- Source: https://github.com/Jakeschincariol/replica-skill
- Pinned upstream commit: `77c9436fb3d18c3d58169efb8caf4fe906b0dc51`
- Installed: 2026-11-27
- License: MIT; see `REPLICA-LICENSE.txt` in this directory.
- Scope: this repository only, not a global or personal-device installation.
- The 11 skill directories are unmodified copies of the pinned source.
- No plugin registration, hooks, global configuration, or Python packages were installed.

## Usage

In Claude Code, open this repository and invoke `/replica-recon` with the
reference app URL, platform, and scope. Project-local skills are discovered
from `.claude/skills/`; restart the session if newly added skills are not shown.
Slash-command discovery has not been verified in a running Claude Code client.

In Arena or another agent that does not discover Claude Code skills, ask it
to read `.claude/skills/replica-recon/SKILL.md` and follow that workflow.
Installing skill files does not add browser tools, network access, hosting
accounts, credentials, or automatic slash-command support to another client.
If reference sites cannot be reached, provide screenshots and descriptions.

Recommended order:

1. replica-recon
2. replica-architect
3. replica-design
4. replica-build
5. replica-backend
6. replica-test
7. replica-diff
8. replica-entrepreneur
9. replica-brand
10. replica-launch
11. replica-deploy

Outputs belong in the project's `replica/` directory, not in the installed
skill folders. Build functionality with fresh code and your own brand,
assets, and copy; do not copy proprietary code or bypass access controls.
Skills are workflow guidance, not autonomous services or a guarantee of parity.
Installation is not permission to commit, push, spend money, or deploy; ask
for explicit user approval for those actions regardless of skill examples.

## Python tools

Python 3.8+; standard library only. Run from the repository root:

```bash
python3 .claude/skills/replica-design/contrast.py replica/design/tokens.json
python3 .claude/skills/replica-diff/parity.py replica/features.csv
python3 .claude/skills/replica-diff/imgdiff.py original.png clone.png --out diff.png
python3 .claude/skills/replica-entrepreneur/reviews.py replica/reviews.csv
python3 .claude/skills/replica-brand/sweep.py . --config replica/brand.json
python3 .claude/skills/replica-launch/listing.py replica/launch/listing.json
```

Use these installed paths in place of upstream examples using `../replica-*`
or `~/.claude/skills/`. Run a tool with `--help` for its options.

## Installation verification

- All 11 `SKILL.md` files and their supporting files were copied.
- Installed skill files were compared byte-for-byte with the pinned source.
- All six installed Python CLIs passed a `--help` smoke test.
- All 57 upstream unit tests passed against the downloaded pinned source.
  The upstream test suite itself is not installed in this project.

To reproduce the upstream tests, download the pinned commit into a separate
temporary directory and run there:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
```

The tools were checked for imports and obvious shell/network/dynamic-execution
operations before testing; this is not a comprehensive security audit.
