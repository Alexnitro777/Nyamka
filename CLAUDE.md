# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Hard rule: no comments

**Never write comments in any file.** This applies to all source, config, and build files (`.ts`, `.json`, `Dockerfile`, etc.). The only file allowed to contain comments is `docker-compose.example.yml` — it documents the environment variables for humans and its comments must be preserved. Do not add comments anywhere else, and remove any comments you encounter elsewhere. Write self-explanatory code (clear names, small functions) instead of explaining it in prose.

## Docs convention

`README.md`, `CLAUDE.md`, and `docs/` document **only** the Docker workflow (the bot container plus an external MySQL/MariaDB the container connects to). Local development works (the `package.json` scripts — `build`/`start`/`dev` — are real and need only Node ≥ 24 and a reachable MySQL) but must not be documented in these files, and must never be described as unsupported. Frame all DB details as how the Docker image connects to MariaDB.

## What this is

Nyamka — a Discord verification bot (discord.js v14, TypeScript). Members submit application forms; moderators approve/reject/blacklist; rejected/blacklisted users can appeal ("amnesty"). It also auto-grants a role based on the Discord **Server Tag**. The UI is in Russian and slash-command names are Cyrillic (`/верификация`, `/апелляция`, `/анкеты`, `/амнистии`, `/тег`, `/выдатьчсп`, `/снятьчсп`).

The bot is **multi-guild**: one process serves every server it's in, and each guild's roles/channels/category are configured independently (rows in the `guild_settings` table, not a config file). There are **no config files on disk**: the database connection comes from `DB_*` environment variables, and global identity (`token`, `clientId`) lives in the `app_config` table.

The deepest behavioral reference is `docs/verification-and-appeals.md` (every verification/appeal scenario) and `docs/features.md`. Read those before changing decision flows.

## Commands

Build, run, and deploy via Docker Compose:

```bash
docker compose up -d --build
docker compose logs -f
docker compose restart
docker compose down
```

- `docker compose up -d --build` builds the image (multi-stage, `node:24-slim`) and starts the bot. The image `CMD` is just `node dist/index.js`; the bot **registers its own slash commands** on `clientReady` (and on `guildCreate`) for every guild it's in (`commandRegistration.ts`) — there is no separate registration entrypoint.
- **Rebuild** with `up -d --build` after any code change; **restart** with `docker compose restart` after changing environment variables (`DB_*`, `BOT_TOKEN`/`CLIENT_ID`). Slash-command changes (editing `data` in `commands/*.ts`) register automatically the next time the bot starts — there is no separate deploy step. Registration is guild-scoped (`commandRegistration.ts` → `applicationGuildCommands(clientId, guildId)` per guild), so commands appear on every guild the bot is in and update instantly.
- **Configure a guild** by inserting its settings into the `guild_settings` table (SQL/GUI) — see Configuration. After changing a guild's rows, `docker compose restart` to drop the per-guild config cache.
- **No test framework and no linter are configured.** Don't invent `npm test` / `npm run lint`.
- Only `docker-compose.yml` is gitignored — copy from `docker-compose.example.yml`. There are **no config files**; all state and configuration live in an **external MySQL/MariaDB** reached via `DB_*` env vars (no on-disk DB file or `data/` volume).

## Configuration

There are **no configuration files** — everything lives in env vars or the database:

- **Database connection** (`db.ts`) — read **only** from env: `DB_HOST`, `DB_PORT` (default 3306), `DB_USER`, `DB_PASSWORD` (default empty), `DB_NAME`, `DB_CONNECTION_LIMIT` (default 10). Missing `DB_HOST`/`DB_USER`/`DB_NAME` throws at startup. Builds a `mysql2` pool (utf8mb4, `supportBigNumbers`). This is the one piece that can't live in the DB — it's how you reach the DB.
- **Bot identity** (`config.ts`) — `token` and `clientId` from the `app_config` table (keys `token`, `clientId`). `initAppConfig()` (called in `index.ts` after `initStorage()`) reads them via `getAppConfigValue`; if a value is absent it falls back to `BOT_TOKEN`/`CLIENT_ID` env and **persists it** via `setAppConfigValue` (set the env once on first run, or `INSERT` directly). Missing in both → throw. `getAppConfig()` returns the cached `{ token, clientId }` and throws if called before `initAppConfig()` — so never read identity at import time.
- **Per-guild config** — rows in the `guild_settings` table (keyed `(guildId, key)`), entered **directly via SQL/GUI** (no file, no seeder). Dotted keys: `roles.verified`, `roles.blacklist`, `roles.blacklistZ`, `roles.blacklistA`, `roles.staff`, `roles.ststaff`, `roles.roleTag`, `channels.review`, `channels.appealReview`, `channels.welcome|decisions|appeal|tagLog|blacklistLog`, `questionCategoryId`. `roles.staff`/`roles.ststaff` are comma-separated lists. The third tier, **owner**, is **not** in the DB — it's a hardcoded `OWNER_IDS` array in `permissions.ts`.

At runtime `guildConfig.ts` reads a guild's settings out of `guild_settings`, validates required keys, builds a `GuildConfig`, and **caches it per guild** (`invalidateGuildConfig(guildId)` clears one entry; the bot invalidates on `guildCreate`, so after editing a guild's rows `docker compose restart`). `interactionCreate.ts` resolves the `GuildConfig` for `interaction.guildId` and passes it to every command/button/modal as `execute(interaction, gc)`; a guild with no/invalid settings yields "⚠️ Бот не настроен на этом сервере."

Required per guild: `roles.verified`, `roles.blacklist`, `roles.staff`, `roles.ststaff`, `channels.review`, `channels.appealReview`, `questionCategoryId`. Optional: `roles.blacklistZ`, `roles.blacklistA`, `roles.roleTag`, `channels.welcome|decisions|appeal|tagLog|blacklistLog`.

Privileged **GuildMembers** intent must be enabled in the Discord Developer Portal, and the bot needs **Manage Server** for invite-based "join method" detection.

## Architecture

### Handler autoloading + routing
`handlers/loader.ts` scans `src/commands`, `src/buttons`, `src/modals` at startup and registers each module's `default` export into a `Collection` on the client. To add a feature you just drop a new file that default-exports the right shape (see `types.ts`): `SlashCommand` = `{ data, access?, execute }`; `ButtonHandler`/`ModalHandler` = `{ customId, execute }`. No central registry to edit.

`handlers/interactionCreate.ts` is the single router. For every guild interaction it first resolves that guild's `GuildConfig` (replying "не настроен" when there is none), then passes `gc` into the handler — **every handler's `execute` takes `(interaction, gc)`**. Slash commands dispatch by `commandName` and are gated by `hasCommandAccess(interaction, gc, …)` (default access is the strictest, `'owner'`). Buttons and modals are matched by iterating handlers and testing `customId` (string equality or `RegExp.test`) — **first match wins**, so keep customId patterns mutually exclusive.

### customId convention
Components encode state in the customId as `namespace:action[:targetId]`, e.g. `review:approve:<userId>`, `appeal:deny:<userId>`, `question:close:<channelId>`. Handlers with a dynamic target use a `RegExp` customId and `split(':')` out the action + id. The reason-collection flow chains: a `review:reject`/`blacklist` button opens a modal whose customId is `review:reason:<action>:<userId>`, handled by `modals/reviewReason.ts`. The `/выдатьчсп` slash command chains the same way — `commands/chsp.ts` opens a modal `chsp:reason:<userId>` (handled by `modals/chspReason.ts`) that collects the reason and then applies the blacklist. Its mirror `/снятьчсп` (`commands/unchsp.ts`) opens a modal `unchsp:reason:<userId>` (handled by `modals/unchspReason.ts`) that collects the reason and then lifts the blacklist (removes the ЧС role + restores `removedRoles`). The handler must split the target `userId` out of its own customId; the slash command itself does nothing but show the modal.

### Two domains, one row per user
Everything is **applications** (verification) and **appeals** (amnesty). In `storage.ts` both tables key on a **composite `(guildId, userId)` primary key**, so there is at most one application and one appeal per user *per guild* — saving upserts and overwrites the previous one. Every storage function takes `guildId` as its first argument. Status state machines live in `types.ts`: `ApplicationStatus` = pending→approved/rejected/blacklisted/left/expired; `AppealStatus` = pending→amnestied/denied/left.

**Use the `claim*` functions for status transitions, not `updateApplication`/`saveApplication`.** `claimApplication`/`claimAppeal` (signature `(guildId, userId, …)`) do a guarded `UPDATE ... WHERE guildId=? AND userId=? AND status='pending'` and return a boolean — this is the race guard that prevents two moderators clicking simultaneously from both succeeding. Always check the returned boolean and bail if `false` (the action was already processed). `review.ts` shows the pattern, including rolling the status back to `pending` (via `updateApplication`) if the subsequent `roles.add` fails. The **submit** path is the mirror guard: `reserveApplication`/`reserveAppeal` run a `SELECT … FOR UPDATE` inside a transaction, return `false` if a `pending` row already exists, and otherwise upsert the new row — `verifySubmit.ts`/`appealSubmit.ts` delete the just-posted review message when `reserve*` returns `false`. Claiming a question channel uses `claimApplicationQuestionChannel`/`claimAppealQuestionChannel` (NULL-safe `<=>` compare). The exception to all of this is `/выдатьчсп` (`modals/chspReason.ts`): it's a direct moderator blacklist of any member — who may have no application row at all — so it upserts via `getApplication` + `updateApplication`/`saveApplication` rather than `claim*`. Don't "fix" it to use `claim*`. Its mirror `/снятьчсп` (`modals/unchspReason.ts`) likewise doesn't use `claim*` — it leaves the application status untouched and only removes the ЧС role and restores `removedRoles` (same as accepting an amnesty).

### Role stripping & restore (the `removedRoles` round-trip)
`roles.ts` is the only place that bulk-strips and restores a member's roles. `blacklistMemberRoles(member, gc)` removes every role positioned **below the bot's highest** (skipping `@everyone`, the blacklist role, and `managed`/integration roles), sets the member to `[…kept, roles.blacklist]`, and returns `{ ok, removed }`. The `removed` IDs are persisted to the application's **`removedRoles`** column — by `modals/reviewReason.ts` on a review-blacklist and `modals/chspReason.ts` on `/выдатьчсп`. The reverse, `restoreMemberRoles(member, gc, removedRoles)`, re-adds those IDs (skipping `roles.verified`, `managed`, and anything now at/above the bot) when a blacklist is lifted — `buttons/appealReview.ts` amnesty and `modals/unchspReason.ts` `/снятьчсп` — and then clears `removedRoles`. Roles at/above the bot are never touched, so both helpers degrade gracefully when the bot's role sits too low and report it via `ok` / the boolean return (handlers surface this as a "проверьте иерархию ролей" warning).

### Schema migrations
`initStorage()` (called once at boot, idempotent) runs `CREATE TABLE IF NOT EXISTS` for `applications`, `appeals`, `counters`, `join_methods`, `guild_settings`, and `app_config` (all InnoDB/utf8mb4), then a series of `addColumnIfMissing(table, def)` calls — each is an `ALTER TABLE ADD COLUMN` that swallows MySQL's `ER_DUP_FIELDNAME` so re-runs are no-ops. When you add a field to `Application`/`Appeal`, you must (1) add the column to the `CREATE TABLE`, (2) add an `addColumnIfMissing` for existing DBs, and (3) thread it through the row interface, `rowToApp`/`rowToAppeal`, the `INSERT … ON DUPLICATE KEY UPDATE` upsert (column list, placeholders, and the `VALUES()` assignment block), and the `reserve*` `UPDATE … SET` path. The `counters` table (keyed `(guildId, name)`, bumped via `LAST_INSERT_ID(value+1)`) backs per-guild `nextApplicationNumber`/`nextAppealNumber`; `join_methods` stores the invite-derived join method per `(guildId, userId)`; `guild_settings` (keyed `(guildId, key)`) is the per-guild config store read by `guildConfig.ts`; `app_config` (keyed `key`) holds the bot's `token`/`clientId`.

### Background workers (all registered in `index.ts`)
Each worker is guild-aware: the event-driven ones (`roleTag`, `leaveCleanup`, `inviteTracker`) take `guildId` from the gateway event; the periodic sweeps (`applicationCleanup`, `questionCleanup`) iterate `client.guilds.cache`. Workers that need roles/channels (`roleTag`, `applicationCleanup`) resolve a full `GuildConfig` via `getGuildConfig(guild.id)` and skip guilds with none; the others operate on `guildId` alone.
- `roleTag.ts` — detects the Discord **Server Tag** (`user.primaryGuild`, read in both camelCase and snake_case) and adds/removes `roles.roleTag`. It listens on `guildMemberAdd`/`guildMemberUpdate`/`userUpdate` **and a raw `GUILD_MEMBER_UPDATE` gateway packet**, because discord.js doesn't reliably surface tag changes. A per-member mutex (`runExclusive`) serializes role edits. `syncAllTagRoles` runs a full sweep on `clientReady`.
- `applicationCleanup.ts` — sweeps pending applications past a 48h TTL → `expired` (DMs user, deletes question channel, marks the review message resolved).
- `questionCleanup.ts` / `questionRestore.ts` — auto-delete **application** question channels past a 48h TTL (2 days, same as the application TTL, so an application and its question channel close together). **Appeal** question channels are deliberately exempt from the TTL sweep (`ttlDelete=false`) — they are only removed on appeal resolution or when the member leaves; the sweep still self-heals a stale DB reference (restores the "Ask a question" button) for both domains when a channel is already gone.
- `leaveCleanup.ts` — on `guildMemberRemove`, marks a pending application/appeal `left`, flips its review message to the disabled "left" row, and **deletes its question channel** (this is what removes appeal question channels, since they have no TTL).
- `inviteTracker.ts` — tracks which invite a member used (the "join method" shown on the form).

### Rendering layer
`ui.ts` is the single source of every embed and button row — the application/appeal review cards, the moderator decision buttons (`buildReviewButtons`/`buildAppealReviewButtons` encode the `review:*`/`appeal:*` customIds), the disabled "processed/left/expired" rows, DM embeds, the welcome embed, and the mirrored summary posted via `postDecisionMessage(client, channelId, …)` (called with `gc.channels.decisions` for verification/appeal decisions, and `gc.channels.blacklistLog` for `/выдатьчсп`·`/снятьчсп`). Field values are wrapped in inline code and truncated to 1000 chars. Change UI here, not inline in handlers, so every flow stays consistent.

### Permissions
`permissions.ts` is **three-tier** and reads roles from the passed `GuildConfig`. The levels, from highest to lowest, are `owner` ⊇ `ststaff` ⊇ `staff` (ranked via the `RANK` map). `resolveAccessLevel(member, userId, gc)` is the single source of truth: it returns `owner` when `userId` is in the hardcoded `OWNER_IDS` array, else `ststaff` for a `gc.roles.ststaff` role, else `staff` for a `gc.roles.staff` role, else `null`. It is **strict** — no Discord permission (Administrator / Manage Roles / Manage Channels) grants anything; only configured roles and the owner ID do. Slash commands: `commandAccessLevel(interaction, gc)` wraps the resolver and `hasCommandAccess(interaction, gc, required)` passes when `RANK[level] >= RANK[required]`. Buttons call `hasButtonAccess(interaction, gc, required)` themselves (review buttons require `staff`, appeal buttons require `ststaff`, `question:close` requires `staff`) since the router only auth-checks slash commands. Per-tier map: **staff** = `/анкеты`, `/тег`, application review buttons; **ststaff** = those plus `/амнистии`, `/выдатьчсп`, `/снятьчсп`, appeal review buttons; **owner** = everything, including `/верификация` and `/апелляция` (usable only by an `OWNER_IDS` user, on every guild). The `setDefaultMemberPermissions(...)` on each command is **only a Discord UI visibility hint** (Discord can't gate by user ID) — the real enforcement is always `hasCommandAccess`/`hasButtonAccess` in code, so changing it never changes who can actually run a command.

### Constraints to respect
- Discord modals allow **max 5 input fields** — `verifyQuestions` in `questions.ts` is already at the limit.
- Question channels are created under `gc.questionCategoryId` with explicit permission overwrites for the applicant + the staff roles that may review that domain: application question channels grant `staff` + `ststaff` (`[...new Set([...gc.roles.staff, ...gc.roles.ststaff])]`), appeal question channels grant `ststaff` only (so `staff` never sees appeal channels).
- `index.ts` requests intents `Guilds`, `GuildMembers`, `GuildInvites`, `GuildVoiceStates` and `Partials.GuildMember`; SIGINT/SIGTERM trigger a clean `client.destroy()` + `closeDb()` (the latter ends the `mysql2` pool).
