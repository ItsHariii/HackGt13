# Cartel: rules for every agent

Several agents work in this repo at the same time. Before any edit:

1. `git fetch origin`, then start a **new branch off `origin/main`**: `git checkout -b <lane>/<task-id>-<slug> --no-track origin/main`. Never work on `main` or on another agent's branch.
2. If the checkout may be in use by another agent (`git worktree list`, `git status`), don't switch its branch. Use your own worktree: `git worktree add ../HackGt13-<slug> -b <branch> --no-track origin/main`.
3. Stage only your own files. Open a small PR to `main` and merge it only after CI is green.

Full workflow: the "Agent workflow" section in [docs/TASKS.md](docs/TASKS.md). Design: [docs/SDD.md](docs/SDD.md).
