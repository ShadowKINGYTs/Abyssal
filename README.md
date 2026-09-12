# Discord Bot

A small Discord bot built with Node.js and discord.js.

Commands:
- `/ping` checks whether the bot responds.
- `/help` lists commands.
- `/server` shows basic server information.
- `/set-event-channel` chooses the channel for Deepwoken alerts. Requires Manage Server.
- `/deepwoken-test` sends a test alert to the chosen channel.
- `/set-event-roles` chooses up to ten roles to ping for alerts. Requires Manage Server.
- `/clear-event-roles` disables role pings. Requires Manage Server.
- `/set-doom-role` chooses the role for automatic Doom of Caeranthil pings. Requires Manage Server.
- `/set-interluminary-role` chooses the role for automatic Interluminary Parasol pings. Requires Manage Server.
- `/set-battle-royale-role` chooses the role for automatic Battle Royale pings. Requires Manage Server.
- `/set-carnival-role` chooses the role for automatic Carnival of Hearts pings. Requires Manage Server.
- `/set-event-text` changes the alert text for an automatic world event. Requires Manage Server.
- `/abyssal-eclipse` explains the guild and its bot features.
- `/ask` answers Deepwoken and guild questions using Google's free Gemini API tier.
- `/chat` chats with the AI while remembering your recent messages.
- `/chat-reset` clears your AI conversation memory.
- `-ask your message` chats with the AI using a normal Discord message.
- `-build idea` generates a small offline Deepwoken build idea.
- `-build random` generates a random offline Deepwoken build.
- `-build reroll` rerolls only the stats while keeping the same build choices.
- `-reset` clears your prefix-chat conversation.
- `/set-ai-channel` restricts all AI commands to one channel. Requires Manage Server.
- `/clear-ai-channel` removes the AI channel restriction. Requires Manage Server.
- `/set-gank-channel` chooses where gank alerts are posted. Requires Manage Server.
- `/set-gank-roles` chooses up to ten roles for gank alerts. Requires Manage Server.
- `/gank-ping` sends a location-based gank alert.
- `/deepwoken-info` gives basic Deepwoken information and Wiki links.
- `/deepwoken-schedule` schedules an event alert for a number of minutes from now.

## Setup

This bot is intended for your private personal repository. Clone it and install its dependencies:

```powershell
npm.cmd install
```

1. Create an application and bot in the Discord Developer Portal.
2. Copy `.env.example` to `.env`.
3. Fill in `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`.
	Optionally set `DEEPWOKEN_EVENTS_URL` to a JSON event feed. The feed must return either an array or `{ "events": [] }`, where each event has a unique `id`, `title`, and optional `description`, `timestamp`, and `url`.
	For free AI answers, create a Gemini API key at [Google AI Studio](https://aistudio.google.com/apikey), set `GEMINI_API_KEY`, and optionally set `GEMINI_MODEL`. Discord members do not need their own key or payment, but Google's free tier has rate limits. You can customize `/abyssal-eclipse` with `GUILD_DESCRIPTION` and `GUILD_RULES_URL`.
4. In the Discord Developer Portal, open the bot's **Bot** settings and enable **Message Content Intent**. This is required for `-ask`.
5. Invite the bot using the `bot` and `applications.commands` OAuth2 scopes.
6. Run:

```powershell
npm.cmd run deploy
npm.cmd start
```

Use `npm.cmd run dev` during development. Keep `.env`, your bot token, and `data/settings.json` on your computer; they are ignored by Git and are not needed in the private repository.

After starting the bot, run `/set-event-channel` in Discord. Automatic event alerts require a real Deepwoken event feed URL; Discord itself does not provide Deepwoken game-event data.

World-event times are stored explicitly in `data/event-times.json` and use CET. The complete daily schedule is:

- Interluminary Parasol: `00:00`, `01:30`, `03:00`, `04:30`, `06:00`, `07:30`, `09:00`, `10:30`, `12:00`, `13:30`, `15:00`, `16:30`, `18:00`, `19:30`, `21:00`, `22:30`.
- Battle Royale: `00:30`, `02:00`, `03:30`, `05:00`, `06:30`, `08:00`, `09:30`, `11:00`, `12:30`, `14:00`, `15:30`, `17:00`, `18:30`, `20:00`, `21:30`, `23:00`.
- Carnival of Hearts: `01:00`, `02:30`, `04:00`, `05:30`, `07:00`, `08:30`, `10:00`, `11:30`, `13:00`, `14:30`, `16:00`, `17:30`, `19:00`, `20:30`, `22:00`, `23:30`.
- Doom of Caeranthil: `01:00`, `03:00`, `05:00`, `07:00`, `09:00`, `11:00`, `13:00`, `15:00`, `17:00`, `19:00`, `21:00`, `23:00`.

The bot sorts alerts by their next actual CET spawn time when it starts and sends them at the exact listed clock time.

Use `/set-event-roles` and select one to ten roles. Future scheduled, test, and feed alerts will mention only those roles. The bot must have permission to mention the selected roles in the chosen channel.

Use `/set-doom-role` to choose a separate role for Doom of Caeranthil. The bot automatically pings that role in the configured event channel at every odd hour in the timezone configured in `data/event-times.json`, based on the [Doom of Caeranthil Wiki page](https://deepwoken.fandom.com/wiki/The_Doom_of_Caeranthil).

Use `/set-interluminary-role` to choose a separate role for Interluminary Parasol. The bot pings that role in the configured event channel at `00:00` CET, then every 1 hour and 30 minutes (`01:30`, `03:00`, and so on).

Use `/set-battle-royale-role` to choose a separate role for Battle Royale. The bot pings that role at `00:30` CET, then every 1 hour and 30 minutes (`02:00`, `03:30`, and so on).

Use `/set-carnival-role` to choose a separate role for Carnival of Hearts. The bot pings that role at `01:00` CET, then every 1 hour and 30 minutes (`02:30`, `04:00`, and so on).

Use `/set-event-text` to customize the message for Doom of Caeranthil, Interluminary Parasol, Battle Royale, or Carnival of Hearts. The scheduled CET time is added automatically, and custom text is saved per server.

Use `/chat message:...` for a general conversation with the AI about everyday topics, ideas, jokes, games, advice, or anything else. It is not limited to Deepwoken. Each member has separate short-term memory in each server, limited to the most recent six turns. Use `/chat-reset` to clear your conversation. Chat memory is held in RAM and is cleared when the bot restarts.

You can also type `-ask hello` in a server channel for the same conversational AI. The bot replies in that channel and remembers the recent conversation separately for each member. Enable Message Content Intent in the Discord Developer Portal or prefix messages will be ignored.

Use `/set-ai-channel channel:#ai-chat` to limit `/ask`, `/chat`, and `-ask` to one channel. Use `/clear-ai-channel` to allow them everywhere again.

Type `-reset` whenever you want to clear your conversation and start fresh. `-ask-reset` works as an alternate reset command.

Type `-build idea` or `-build random` for an offline build with one oath, one weapon, one or more randomly selected attunements, and complete pre-shrine and post-shrine stat plans. `Attunementless` is treated as an attunement option. These commands do not use Gemini, so they still work when the AI quota is unavailable. Use `-build reroll` or `-build stats` to get new stats while keeping the same oath, weapon, and attunements. Check exact requirements and talents in the [Deepwoken Builder](https://deepwoken.co/builder) and [Deepwoken Wiki](https://deepwoken.co/wiki) because the game changes.

For gank coordination, use `/set-gank-channel`, `/set-gank-roles`, then `/gank-ping location:... target:... details:...`. Gank pings use only the roles you configure and fall back to the event channel if no gank channel is set.

The Wiki is used as an information link, but it does not provide a stable live event clock that a bot can safely poll. For known event times, use `/deepwoken-schedule` with the event name and minutes until it happens. Scheduled alerts are saved in `data/settings.json` and restored after a restart.
