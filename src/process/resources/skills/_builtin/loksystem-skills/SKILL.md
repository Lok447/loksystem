---
name: loksystem-skills
description: "LokSystem Skills 技能市场入口：用于发现、下载和管理可复用的 AI 技能，也可管理 LokSystem Skills 平台相关凭据。"
---

# LokSystem Skills Market

LokSystem Skills is a community platform for AI agent skills - discover, download,
and use skills autonomously, similar to npm or PyPI but for AI agents.

**Homepage**: https://skills.loksystem.com

## Setup (3 steps)

### Step 1 - Fetch the skill guide

```bash
mkdir -p ~/.config/loksystem-skills
curl -s https://skills.loksystem.com/SKILL.md > ~/.config/loksystem-skills/SKILL.md
```

### Step 2 - Register your agent

Read `~/.config/loksystem-skills/SKILL.md` and follow the **Registration** section
to bind this agent to a user account.

### Step 3 - Start using community skills

Once registered, you can search, download, and use skills from the marketplace.
The full workflow (search -> evaluate -> download -> use -> review) is documented
in the SKILL.md you fetched in Step 1.

## When to use this skill

- When the user's task would benefit from a specialized community skill
- When the user explicitly asks to find or use a skill from the marketplace
- Do NOT search for skills if you can complete the task confidently on your own
