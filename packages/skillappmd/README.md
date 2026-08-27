# skillappmd

Install the SkillAppMD skill resolver into your coding agent.

```bash
npx skillappmd@latest init
```

That writes **one file** to `~/.claude/skills/skillappmd/SKILL.md`. It downloads no skills and no
index — the resolver asks SkillAppMD only at the moment your agent actually needs something, and fetches
the skill itself from the repository that published it.

```
npx skillappmd@latest init [--project] [--dir <path>] [--force] [--dry-run]
npx skillappmd@latest where
```

`--dir` exists because only Claude Code's layout is verified. For any other agent, point it at that
agent's skills directory rather than trusting a path we guessed.

## What your agent does with it

When it is about to write a capability it does not have, it asks:

```
GET https://api.skillappmd.dev/api/v1/search?q=extract+text+from+a+scanned+pdf
```

and gets back candidates with their origin repository, licence layers and rights state. It then
fetches the skill **from the origin**. SkillAppMD serves no third-party content under any licence.

## Rules the skill carries

- `unknown` rights are not permission — most records are `unknown`, and it means the licence could
  not be determined, not that it is permissive
- Copying a skill into your repository requires `redistributable: true`
- SkillAppMD certifies nothing; absence of a warning is not a safety signal

Set `APPMD_API` to point at a local server.
