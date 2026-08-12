# Real Estate Lead Collector — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that collects real-estate leads (name, phone, intent, note) with user confirmation, notifies the owner instantly, and provides an owner-exclusive lead list with status management (New/Done).

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- potential real estate clients
- real estate agent (owner)

## Success criteria

- User submits lead with confirmation
- Owner receives lead notification
- Owner marks leads as New/Done

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open main menu with 'Submit a lead' button
- **/leads** (command, actor: owner, command: /leads) — Access private lead list (owner-only)

## Flows

### Lead submission
_Trigger:_ /start

1. Show welcome + 'Submit a lead' button
2. Collect name
3. Collect phone (typed or contact)
4. Select intent (Buy/Rent/Sell)
5. Enter short note
6. Show confirmation summary
7. Save and notify owner on Confirm

_Data touched:_ Lead

### Owner inbox
_Trigger:_ /leads

1. Show paginated lead list (10 per page)
2. Display lead details with Mark New/Done buttons
3. Update lead status on button press

_Data touched:_ Lead, Owner

## Owner-supplied settings

The OWNER provides these; they are collected in chat and injected into the environment at deploy. Read each one from the environment where it is used (`ctx.env.<KEY>` / `env.<KEY>` on Cloudflare Workers; `process.env.<KEY>` only as a Node/harness fallback — never the sole read). Do NOT invent your own way of learning the value, do NOT ask for it in a bot message, and do NOT hardcode a default.

- **ADMIN_CHAT_ID** — Telegram user/chat ID to receive lead notifications and access owner menu
  - this is the OWNER's own chat id; the platform already knows it. Read `ADMIN_CHAT_ID` via `ctx.env` (prefer toolkit `adminChatId` / `requireOwner`) — never ask a user, never treat whoever writes first as the admin, never invent claim-admin or open manage for everyone.
  - may be UNSET at runtime: the bot must still start, and the feature needing ADMIN_CHAT_ID must say so plainly instead of failing.

Your behavioral specs run WITHOUT these values, so no spec may depend on one.

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

An entity that merely NAMES an owner-supplied setting above (an admin chat, an API account) is not something to store or discover — read it from the environment.

- **Lead** _(retention: persistent)_ — Submitted real estate inquiry
  - fields: id, submitter_telegram_id, name, phone, intent, note, status, timestamp
- **Owner** _(retention: persistent)_ — Lead manager account
  - fields: telegram_id

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- View and update lead statuses (New/Done)
- Receive lead submission notifications

## Notifications

- Lead submission alert to owner with full details
- Status change confirmation to owner

## Permissions & privacy

- Only owner can access /leads and modify lead statuses
- Leads stored privately until marked Done
- Submitter Telegram ID optional for privacy

## Edge cases

- User submits invalid phone number
- Owner tries to access /leads without ADMIN_CHAT_ID
- Lead status toggle when already in target state

## Required tests

- End-to-end lead submission with confirmation and owner notification
- Owner pagination through 20+ leads
- Unauthorized user access attempts blocked

## Assumptions

- Single owner account via ADMIN_CHAT_ID
- No external integrations beyond Telegram
- Leads retained until explicitly marked Done
