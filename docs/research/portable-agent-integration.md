# Portable agent integration patterns for OpenBPMN

Research date: 2026-08-29  
Wayfinder question: How can one lightweight, local Conversational Modeling workflow work across Codex, Claude Code, GitHub Copilot, and future agents without OpenBPMN-hosted infrastructure?

## Decision summary

OpenBPMN should use a **local CLI as the capability boundary** and an **Agent Skill as the conversational workflow**.

- The CLI owns deterministic behavior: transform a structured process draft into BPMN, validate it, lay it out, render it, and write explicit local artifacts.
- The skill owns the consulting behavior: elicit evidence, ask focused questions, expose assumptions, iterate on a draft, invoke the CLI, and present the result for review.
- `AGENTS.md` supplies only short, always-on project guidance. A small `CLAUDE.md` imports it for Claude Code.
- Repository state, rather than one vendor's chat history, carries the process draft between sessions or agents.
- A local stdio MCP adapter can be added later over the same core library, but it should not be required for the MVP.

This gives the project a credible cross-agent story without pretending that every host uses the same discovery paths, permission model, configuration format, or interaction surface.

## Why this is the smallest portable design

### 1. Keep natural-language reasoning in the user's chosen agent

OpenBPMN does not need to host a model, proxy prompts, retain interview material, or require an OpenBPMN API key. Codex, Claude Code, Copilot, or a later compatible agent conducts the conversation. The OpenBPMN skill tells that host how to run the iterative consulting workflow; the local engine accepts a structured process representation and produces deterministic files.

This separation is important. Natural-language interpretation is probabilistic and host-specific, while BPMN serialization, schema checks, modeling-rule checks, layout, and rendering can be repeatable and testable. It also makes the CLI useful without any agent.

### 2. Make the CLI the stable public interface

All three target agents can run local commands, whereas their native skills, custom agents, plugins, and MCP configuration differ. A single executable therefore provides the broadest compatibility and the easiest fallback for an unknown future agent.

For a TypeScript implementation, an npm package can expose an executable through the `package.json` `bin` field; npm links it into the executable path for global and dependency installs, including a Windows command shim. A locally installed binary is also available through `npm exec` and package scripts ([npm `package.json` documentation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#bin)). `npx` can run a locally installed package or fetch one into npm's cache, and it prompts before fetching by default ([npm `npx` documentation](https://docs.npmjs.com/cli/v11/commands/npx/)).

Recommended packaging:

- Publish one versioned package that exposes both a library API and an `openbpmn` command.
- Document a pinned local-development dependency as the reproducible path.
- Offer `npx openbpmn@<version>` as an explicit try-it path, not as an invisible `-y` download embedded in a skill.
- Keep stdout machine-readable when `--json` is selected; send diagnostics to stderr and use stable exit codes.
- Let every mutating command name its output path. Do not silently overwrite an existing `.bpmn` file.

The exact command vocabulary remains a product-design decision, but it should cover the same primitives an eventual MCP adapter would expose: create/update from a structured draft, validate, render, and inspect capabilities.

### 3. Use Agent Skills for the consulting workflow

The Agent Skills specification defines a directory containing `SKILL.md` plus optional scripts, references, and assets. It standardizes the required `name` and `description` fields and recommends progressive disclosure; `allowed-tools` is explicitly experimental and may vary between implementations ([Agent Skills specification](https://agentskills.io/specification)). That is a good fit for a substantial iterative method that should load when the user asks to model a process, rather than occupying every conversation.

Codex discovers repository skills from `.agents/skills` between the working directory and repository root, and describes direct skill folders as appropriate for repository-scoped workflows ([OpenAI Codex skill documentation](https://developers.openai.com/codex/skills)). Copilot accepts project skills from `.github/skills`, `.claude/skills`, or `.agents/skills`, and its docs recommend skills for detailed, task-specific workflows rather than always-on instructions ([GitHub Copilot skill documentation](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills)). Claude Code, however, discovers project skills under `.claude/skills`, including parent directories up to the repository root ([Claude Code skill documentation](https://code.claude.com/docs/en/skills#discovery-from-parent-and-nested-directories)).

There is therefore **no single checked-in discovery path shared by all three hosts**. The practical repository layout is:

```text
skills/openbpmn-modeling/           # canonical source; not auto-discovered
.agents/skills/openbpmn-modeling/   # generated distribution for Codex + Copilot
.claude/skills/openbpmn-modeling/   # generated Claude Code distribution
AGENTS.md                            # short, agent-neutral standing guidance
CLAUDE.md                            # imports AGENTS.md; Claude-only additions if needed
```

Do not maintain the two skill copies by hand. Generate them from one source during release/build and fail CI if they diverge. Avoid relying on symlinks as the distribution mechanism because Git checkout and Windows symlink behavior add unnecessary friction. Keep host-specific frontmatter out of the common source unless every target safely ignores it.

For installation into another process repository, ship a small reviewed installer or documented copy command that places the skill in the host's supported project or user directory. GitHub's current `gh skill` flow can install a skill for a selected agent and records provenance metadata, but it is in public preview and should be treated as a convenience rather than OpenBPMN's only distribution path ([GitHub Copilot skill documentation](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills#managing-skills-with-github-cli)).

### 4. Use instruction files as pointers, not as the workflow

Codex reads `AGENTS.md` before work and composes instructions from the repository root toward the current directory, with nearer guidance later in the chain ([OpenAI `AGENTS.md` documentation](https://developers.openai.com/codex/guides/agents-md)). Copilot supports `AGENTS.md` as agent instructions and gives the nearest file precedence ([GitHub repository-instructions documentation](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/add-custom-instructions/add-repository-instructions)). Claude Code does not directly read `AGENTS.md`; Anthropic recommends a `CLAUDE.md` that imports `@AGENTS.md` when a repository already uses the neutral file ([Claude Code memory documentation](https://code.claude.com/docs/en/memory#agentsmd)).

This makes `AGENTS.md` useful for a compact statement such as “use the OpenBPMN Modeling skill for process-model requests; write generated artifacts only to user-selected paths.” It should not contain the full interview tree. Large always-on instructions consume context, are only behavioral guidance, and are less reliable than a focused skill plus deterministic validation.

### 5. Persist a portable local work state

Conversation history is not a portable protocol. A user may switch from Codex to Claude Code, resume later, or ask a colleague to review the model. The skill should therefore maintain explicit local working artifacts containing the current structured process draft, source/evidence references, and quality findings. The exact file schema belongs in the later product specification, but the principle should be fixed now:

- the `.bpmn` artifact is always exportable and contains no OpenBPMN status tags, review notes, or private interview text;
- any assumptions, issues, evidence, or quality findings live in optional sidecar working files;
- the user can delete or exclude sidecars and keep only the clean BPMN deliverable;
- an agent can reconstruct the next modeling round from those local artifacts without access to another vendor's chat transcript.

This is the bridge that makes the *workflow* portable, not merely the command syntax.

## Pattern comparison

| Pattern | Portability | Local-first | Determinism | Setup/support cost | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `AGENTS.md` / `CLAUDE.md` only | Medium | Yes | Low | Very low | Use only for routing and standing constraints |
| Agent Skill only | Medium-high | Yes | Low-medium | Low | Use for the iterative consulting method, but back it with the CLI |
| Local CLI only | Very high | Yes | High for technical operations | Low | Stable capability foundation and universal fallback |
| Skill + local CLI | High | Yes | High where it matters | Low-medium | **MVP recommendation** |
| Local stdio MCP over the same core | Medium-high at protocol level; medium in installation | Yes | High | Medium | Add after the CLI/tool contract stabilizes |
| Vendor custom agent/plugin as primary | Low | Varies | Varies | High | Do not make this the portable core |
| Hosted OpenBPMN service | High client reach | No | High | High operational/privacy burden | Out of scope |

## MCP: valuable adapter, wrong MVP dependency

MCP provides typed, discoverable tools with JSON Schema inputs and optional output schemas. The protocol recommends keeping a human able to deny tool invocations and requires servers to validate inputs, control access, and sanitize outputs ([MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)). A local stdio server is technically compatible with all three target ecosystems:

- Codex supports local STDIO servers and project-scoped `.codex/config.toml` configuration ([OpenAI Codex MCP documentation](https://developers.openai.com/codex/mcp)).
- Claude Code supports local stdio servers and shareable project configuration in `.mcp.json`; interactive sessions prompt before using project-scoped servers ([Claude Code MCP documentation](https://code.claude.com/docs/en/mcp#project-scope)).
- Copilot IDE integrations support local servers, but configuration locations and feature availability vary by surface; VS Code uses `.vscode/mcp.json` and asks the user to trust a server before starting it ([GitHub Copilot MCP documentation](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp-in-your-ide/extend-copilot-chat-with-mcp)). GitHub's own support matrix shows that customization features differ across VS Code, Visual Studio, JetBrains, Eclipse, Xcode, GitHub.com, and Copilot CLI ([Copilot customization matrix](https://docs.github.com/en/copilot/reference/customization-cheat-sheet#ide-and-surface-support)).

The protocol is shared; installation is not. Requiring MCP in the MVP would introduce multiple configuration adapters, lifecycle/debugging work, approval differences, and surface-specific documentation before it adds capability beyond the CLI.

When MCP is added, implement it as a thin `openbpmn mcp` stdio entry point over exactly the same application services as the CLI. Prefer a small tool set with strict schemas and explicit paths. Separate non-mutating inspection/validation from file-writing operations, return previews before applying destructive changes, and expose structured results as well as human-readable summaries. Do not put conversational state inside the server; keep it in project artifacts so the CLI and non-MCP agents remain peers.

## Portability limits to state honestly

1. **Discovery paths differ.** `.agents/skills` covers Codex and Copilot; Claude Code needs `.claude/skills`.
2. **Instruction semantics differ.** `AGENTS.md` is native to Codex and Copilot, while Claude Code needs a `CLAUDE.md` import.
3. **Skill frontmatter is not uniformly enforced.** The common Agent Skills format is useful, but optional fields such as `allowed-tools` have varying support.
4. **MCP configuration is not portable as one file.** The server implementation can be shared, but Codex, Claude Code, and Copilot surfaces use different configuration paths and approval flows.
5. **Tool availability differs by product surface.** “Works with Copilot” cannot imply identical support in every IDE and GitHub surface.
6. **Model behavior differs.** The same skill and process evidence can yield different clarifying questions or draft interpretations. Deterministic validation and golden acceptance cases must catch the consequential differences.
7. **Local tooling does not mean local inference.** Interview text still goes to the AI provider chosen by the user unless that provider itself runs locally. OpenBPMN can promise no OpenBPMN-hosted backend and no OpenBPMN telemetry; it cannot promise that Codex, Claude, or Copilot keeps prompts on-device.

## Security and consent boundary

The recommended default is deliberately conservative:

- No OpenBPMN network service, account, token, or telemetry.
- No network access from the core workflow by default.
- No credentials in repository MCP configuration or skill files.
- No broad `allowed-tools: shell`/`bash` grant in the skill. GitHub warns that pre-approving shell execution removes confirmation and can let malicious instructions execute arbitrary commands; Anthropic likewise warns that a project skill can grant broad tools even in an untrusted folder ([GitHub skill security guidance](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills#enabling-a-skill-to-run-a-script), [Claude Code skill permission guidance](https://code.claude.com/docs/en/skills#pre-approve-tools-for-a-skill)).
- Reviewable, pinned installation. Do not silently use `npx -y ...@latest`; npm's default install prompt exists to reduce typo and package-execution risk ([npm `npx` documentation](https://docs.npmjs.com/cli/v11/commands/npx/#compatibility-with-older-npx-versions)).
- Filesystem scope limited to user-selected inputs and output directories. A local MCP process runs with the user's OS permissions, so application-level path checks are still required; the MCP guide explicitly cautions that a local server can perform operations available to that user account ([MCP local-server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers#understanding-the-configuration)).
- Preview before overwrite, atomic writes, and explicit consent for any operation that replaces or deletes a file.
- Treat imported interview documents and existing BPMN text as untrusted content, never as agent instructions.
- Keep modeling warnings in sidecars or the chat UI, never hidden inside the exported BPMN.

The MCP specification recommends showing exposed tools, indicating invocations, and requesting confirmation, but hosts implement those controls differently. OpenBPMN must enforce its own input validation and path boundary even when a host has already approved a tool ([MCP tools security considerations](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#security-considerations)).

## Recommended delivery sequence

### MVP

1. A provider-neutral core library and `openbpmn` CLI.
2. One canonical, spec-conformant Modeling skill source, released into both `.agents/skills` and `.claude/skills` with a divergence check.
3. A concise root `AGENTS.md` plus a small `CLAUDE.md` importing it.
4. Local, explicit working artifacts that allow another agent/session to continue the modeling round.
5. Security defaults above, with no hosted infrastructure and no telemetry.
6. Acceptance tests that run the same structured fixtures through the CLI independently of any model.

### After the CLI contract is stable

1. A thin local stdio MCP adapter over the same application services.
2. Setup documentation or an opt-in setup command for Codex, Claude Code, and major Copilot surfaces.
3. Cross-host evaluation fixtures that compare whether each skill-guided agent gathers the required process facts and reaches a valid deliverable.

### Avoid until demonstrated demand

- A standalone chat UI or BPMN editor.
- Vendor-specific custom-agent bundles as the primary distribution.
- A hosted prompt/model gateway.
- Automatic background installation or broad pre-approved shell access.

## Resolution gist

Use **Agent Skill + local CLI** as OpenBPMN's portable MVP: the skill carries the iterative consulting method, the CLI carries deterministic BPMN capabilities, and local sidecar state carries the work between agents. Add a local stdio MCP adapter only after the CLI contract stabilizes. This preserves a lightweight, no-infrastructure product while making the portability claim concrete and honest.
