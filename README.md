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
- `/ally-request` submits a guild alliance request with guild name, top rank, server ID, and server link.
- `/set-ally-request-channel` configures the channel that ally requests are forwarded to. Only the guild owner can use it.
- `/ally-list` publicly shows the accepted allies with a `Join here` link for each server.
- `/remove-ally` removes an ally by name. Requires Manage Server.
- `/set-health-channel` chooses where bot failures are reported. Requires Manage Server.
- `/setup` chooses the gank alert channel and gank ping role for the server. Only the guild owner can use it.
- `/gank-ping` sends a location-based gank alert with a required location and details.
- `/deepwoken-info` gives basic Deepwoken information and Wiki links.
- `/deepwoken-schedule` schedules an event alert for a number of minutes from now.

## Setup

This bot is ready to be published to GitHub. Clone the repository and install its dependencies:

```powershell
npm.cmd install
```

1. Create an application and bot in the Discord Developer Portal.
2. Copy `.env.example` to `.env`.
3. Fill in `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`.
	Optionally set `DEEPWOKEN_EVENTS_URL` to a JSON event feed. The feed must return either an array or `{ "events": [] }`, where each event has a unique `id`, `title`, and optional `description`, `timestamp`, and `url`.
	You can customize `/abyssal-eclipse` with `GUILD_DESCRIPTION` and `GUILD_RULES_URL`.
4. Invite the bot using the `bot` and `applications.commands` OAuth2 scopes.
5. Run:

```powershell
npm.cmd run deploy
npm.cmd start
```

Use `npm.cmd run dev` during development. Keep `.env`, your bot token, and `data/settings.json` on your computer; they are ignored by Git and should not be committed to the repository.

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

Use `/ally-request guild-name:... top-rank:... server-id:... server-link:...` to send a guild alliance request to the configured ally-request channel. The target channel is set with `/set-ally-request-channel channel:#ally-requests`, and the guild owner is the only user allowed to configure it.

Use `/ally-list` to publicly show the accepted allies. Each numbered entry includes a `Join here` link to that ally's Discord server. Use `/remove-ally name:...` to remove an ally by its listed name; this requires Manage Server permission.

Use `/set-health-channel channel:#bot-health` to receive a notification when Discord reports an error. Alerts are rate-limited so one outage does not flood the channel.

For gank coordination, use `/setup channel:#ganks role:@Gank Ping`, then `/gank-ping location:... target:... details:...` to send a ping from that server using the configured gank channel and role. The gank alert includes the origin server name and the details you report.

The Wiki is used as an information link, but it does not provide a stable live event clock that a bot can safely poll. For known event times, use `/deepwoken-schedule` with the event name and minutes until it happens. Scheduled alerts are saved in `data/settings.json` and restored after a restart.
