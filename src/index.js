import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Client, EmbedBuilder, Events, GatewayIntentBits } from 'discord.js';

const {
  DISCORD_TOKEN,
  DEEPWOKEN_EVENTS_URL,
  GEMINI_API_KEY,
  GEMINI_MODEL = 'gemini-3.6-flash',
  GUILD_DESCRIPTION,
  GUILD_RULES_URL,
} = process.env;
if (!DISCORD_TOKEN) throw new Error('DISCORD_TOKEN is required in .env');

const lockPath = path.join(process.cwd(), 'data', 'bot.lock');

async function acquireBotLock() {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  try {
    const lock = await fs.open(lockPath, 'wx');
    await lock.writeFile(String(process.pid));
    await lock.close();
    process.on('exit', () => { fs.unlink(lockPath).catch(() => {}); });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existingPid = Number(await fs.readFile(lockPath, 'utf8').catch(() => '0'));
    try {
      process.kill(existingPid, 0);
      throw new Error(`Another bot instance is already running (PID ${existingPid}).`);
    } catch (processError) {
      if (processError.message.includes('already running')) throw processError;
      await fs.unlink(lockPath).catch(() => {});
      return acquireBotLock();
    }
  }
}

await acquireBotLock();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const chatHistories = new Map();
const buildHistories = new Map();
const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
const eventTimesPath = path.join(process.cwd(), 'data', 'event-times.json');
const eventSchedule = JSON.parse(await fs.readFile(eventTimesPath, 'utf8'));
const pollIntervalMs = 60_000;
const wikiUrl = 'https://deepwoken.fandom.com/wiki/Deepwoken_Wiki';
const timezoneOffsetMatch = eventSchedule.timezone.match(/^(?:GMT|UTC)([+-]\d+)$/i);
if (!timezoneOffsetMatch) throw new Error('event-times.json timezone must use GMT+N or UTC+N format');
const timezoneOffsetMs = Number(timezoneOffsetMatch[1]) * 60 * 60_000;
const eventTimezone = eventSchedule.timezone;
const doomTimesCet = eventSchedule.doomTimes;
let worldEventSendQueue = Promise.resolve();
const recurringEvents = eventSchedule.worldEvents.map((event) => ({
  ...event,
}));
const defaultEventTexts = {
  doom: 'The Doom of Caeranthil should spawn now in the Etrean Luminant.',
  interluminary: 'Interluminary Parasol should be happening now.',
  battleRoyale: 'Battle Royale should be happening now.',
  carnival: 'Carnival of Hearts should be happening now.',
};

function queueWorldEventSend(sendAlert) {
  const nextSend = worldEventSendQueue.then(sendAlert, sendAlert);
  worldEventSendQueue = nextSend.catch(() => {});
  return nextSend;
}

function formatEventTime(date) {
  return `${new Date(date.getTime() + timezoneOffsetMs).toISOString().replace('Z', '')} ${eventTimezone}`;
}

function scheduleAtExactTime(eventTime, callback) {
  const checkTime = () => {
    const remainingMs = eventTime.getTime() - Date.now();
    if (remainingMs > 0) {
      setTimeout(checkTime, Math.min(remainingMs, 1000));
      return;
    }
    callback();
  };
  checkTime();
}

async function readSettings() {
  try {
    return JSON.parse(await fs.readFile(settingsPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeSettings(settings) {
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

async function getAiChannelId(guildId) {
  if (!guildId) return null;
  const settings = await readSettings();
  return settings[guildId]?.aiChannelId || null;
}

function eventEmbed(event) {
  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(`Deepwoken event: ${event.title}`)
    .setDescription(event.description || 'A new Deepwoken event was reported.')
    .setTimestamp(event.timestamp ? new Date(event.timestamp) : new Date());
  if (event.url) embed.setURL(event.url);
  return embed;
}

function gankEmbed(location, target, details) {
  return new EmbedBuilder()
    .setColor(0xdc2626)
    .setTitle('Abyssal Eclipse gank ping')
    .addFields(
      { name: 'Location', value: location },
      { name: 'Target', value: target || 'Not specified' },
      { name: 'Details', value: details || 'Group up and confirm before engaging.' },
    )
    .setTimestamp();
}

async function askAi(question, history = [], generalConversation = false) {
  if (!GEMINI_API_KEY) {
    return 'Free AI help is not configured yet. Create a free Gemini API key at https://aistudio.google.com/apikey, add it as GEMINI_API_KEY in .env, restart the bot, and try again.';
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const systemPrompt = generalConversation
    ? 'You are a friendly, relaxed conversation partner in a Discord server. Chat naturally, respond warmly, ask follow-up questions when appropriate, and help with everyday topics, jokes, ideas, games, advice, and casual conversation. You are not limited to Deepwoken or guild topics. Be honest when you do not know something, avoid pretending to be a real person, and keep replies concise enough for Discord.'
    : `You are the helpful assistant for Abyssal Eclipse, a Discord guild for the Roblox game Deepwoken. Answer questions clearly and concisely. Do not invent current game mechanics, guild rules, player information, or event times. Say when you are unsure and link to the Deepwoken Wiki when useful. Guild description: ${GUILD_DESCRIPTION || 'A Deepwoken guild focused on coordinated events, gank response, and helping members.'}`;
  const requestBody = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [...history, { role: 'user', parts: [{ text: question }] }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 500 },
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('AI quota is exhausted for this Gemini project. Wait for the quota reset or replace GEMINI_API_KEY with a key from a project that has available quota.');
    }
    throw new Error(`AI service returned HTTP ${response.status}`);
  }
  const payload = await response.json();
  return payload.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('')
    || 'The AI did not return an answer.';
}

function aiErrorMessage(error) {
  if (error.message.includes('quota')) return 'The Gemini free-tier quota is exhausted. Wait for it to reset or add a Gemini key from a project with available quota.';
  return 'I could not reach the AI service right now. Try again in a moment.';
}

async function respondToMessage(message, content) {
  try {
    await message.reply(content);
  } catch (error) {
    console.error('Message reply failed, using channel fallback:', error.message);
    await message.channel.send(content).catch((sendError) => {
      console.error('Message channel fallback failed:', sendError.message);
    });
  }
}

const buildTemplates = [
  {
    name: 'Gale Striker',
    oath: 'Jetstriker',
    weapon: 'Katana',
    attunements: ['Galebreathe'],
    statPlans: [
      { pre: 'Strength 25 | Fortitude 40 | Agility 40 | Intelligence 0 | Willpower 0 | Charisma 0 | Medium Weapon 100 | Galebreathe 80', post: 'Strength 40 | Fortitude 50 | Agility 55 | Intelligence 0 | Willpower 0 | Charisma 0 | Medium Weapon 100 | Galebreathe 80' },
      { pre: 'Strength 40 | Fortitude 25 | Agility 55 | Intelligence 0 | Willpower 0 | Charisma 0 | Medium Weapon 100 | Galebreathe 80', post: 'Strength 55 | Fortitude 40 | Agility 65 | Intelligence 0 | Willpower 0 | Charisma 0 | Medium Weapon 100 | Galebreathe 80' },
    ],
    reason: 'Gale mobility and Katana pressure make a fast roaming build that can chase or disengage.',
  },
  {
    name: 'Attunementless Striker',
    oath: 'Jetstriker',
    weapon: 'Katana',
    attunements: ['Attunementless'],
    statPlans: [
      { pre: 'Strength 40 | Fortitude 50 | Agility 40 | Intelligence 0 | Willpower 0 | Charisma 0 | Medium Weapon 100', post: 'Strength 60 | Fortitude 70 | Agility 55 | Intelligence 0 | Willpower 0 | Charisma 0 | Medium Weapon 100' },
      { pre: 'Strength 55 | Fortitude 35 | Agility 55 | Intelligence 0 | Willpower 0 | Charisma 0 | Medium Weapon 100', post: 'Strength 75 | Fortitude 50 | Agility 70 | Intelligence 0 | Willpower 0 | Charisma 0 | Medium Weapon 100' },
    ],
    reason: 'Attunementless keeps the build focused on weapon fundamentals while Jetstriker adds mobility and chase power.',
  },
  {
    name: 'Flame Dawnwalker',
    oath: 'Dawnwalker',
    weapon: 'Greatsword',
    attunements: ['Flamecharm'],
    statPlans: [
      { pre: 'Strength 40 | Fortitude 50 | Agility 25 | Intelligence 0 | Willpower 0 | Charisma 0 | Heavy Weapon 100 | Flamecharm 80', post: 'Strength 60 | Fortitude 65 | Agility 35 | Intelligence 0 | Willpower 0 | Charisma 0 | Heavy Weapon 100 | Flamecharm 80' },
      { pre: 'Strength 55 | Fortitude 35 | Agility 35 | Intelligence 0 | Willpower 0 | Charisma 0 | Heavy Weapon 100 | Flamecharm 80', post: 'Strength 75 | Fortitude 50 | Agility 45 | Intelligence 0 | Willpower 0 | Charisma 0 | Heavy Weapon 100 | Flamecharm 80' },
    ],
    reason: 'Flame damage adds pressure while the Greatsword gives strong trades and Dawnwalker supports aggression.',
  },
  {
    name: 'Shadow Seer',
    oath: 'Blindseer',
    weapon: 'Quarterstaff',
    attunements: ['Shadowcast'],
    statPlans: [
      { pre: 'Strength 25 | Fortitude 40 | Agility 25 | Intelligence 20 | Willpower 40 | Charisma 0 | Medium Weapon 100 | Shadowcast 80', post: 'Strength 40 | Fortitude 60 | Agility 35 | Intelligence 30 | Willpower 50 | Charisma 0 | Medium Weapon 100 | Shadowcast 80' },
      { pre: 'Strength 40 | Fortitude 25 | Agility 35 | Intelligence 30 | Willpower 40 | Charisma 0 | Medium Weapon 100 | Shadowcast 80', post: 'Strength 55 | Fortitude 45 | Agility 45 | Intelligence 45 | Willpower 50 | Charisma 0 | Medium Weapon 100 | Shadowcast 80' },
    ],
    reason: 'Shadowcast utility pairs with Quarterstaff range while Blindseer fits a defensive, information-focused style.',
  },
  {
    name: 'Thunder Linkstrider',
    oath: 'Linkstrider',
    weapon: 'Rapier',
    attunements: ['Thundercall'],
    statPlans: [
      { pre: 'Strength 25 | Fortitude 35 | Agility 40 | Intelligence 0 | Willpower 0 | Charisma 25 | Light Weapon 100 | Thundercall 80', post: 'Strength 40 | Fortitude 50 | Agility 60 | Intelligence 0 | Willpower 0 | Charisma 35 | Light Weapon 100 | Thundercall 80' },
      { pre: 'Strength 40 | Fortitude 25 | Agility 55 | Intelligence 0 | Willpower 0 | Charisma 15 | Light Weapon 100 | Thundercall 80', post: 'Strength 55 | Fortitude 40 | Agility 75 | Intelligence 0 | Willpower 0 | Charisma 25 | Light Weapon 100 | Thundercall 80' },
    ],
    reason: 'Thundercall burst and Rapier speed create a mobile duelist that benefits from Linkstrider support.',
  },
  {
    name: 'Storm Runner',
    oath: 'Jetstriker',
    weapon: 'Spear',
    attunements: ['Thundercall', 'Galebreathe'],
    statPlans: [
      { pre: 'Strength 25 | Fortitude 40 | Agility 40 | Intelligence 0 | Willpower 0 | Charisma 0 | Medium Weapon 100 | Thundercall 60 | Galebreathe 60', post: 'Strength 40 | Fortitude 55 | Agility 60 | Intelligence 0 | Willpower 0 | Charisma 0 | Medium Weapon 100 | Thundercall 75 | Galebreathe 75' },
      { pre: 'Strength 40 | Fortitude 25 | Agility 55 | Intelligence 0 | Willpower 0 | Charisma 0 | Medium Weapon 100 | Thundercall 60 | Galebreathe 60', post: 'Strength 55 | Fortitude 40 | Agility 75 | Intelligence 0 | Willpower 0 | Charisma 0 | Medium Weapon 100 | Thundercall 75 | Galebreathe 75' },
    ],
    reason: 'Thunder burst and Gale movement create a fast control build with two ways to start pressure.',
  },
  {
    name: 'Elemental Dawnwalker',
    oath: 'Dawnwalker',
    weapon: 'Greatsword',
    attunements: ['Flamecharm', 'Frostdraw'],
    statPlans: [
      { pre: 'Strength 40 | Fortitude 50 | Agility 25 | Intelligence 0 | Willpower 0 | Charisma 0 | Heavy Weapon 100 | Flamecharm 60 | Frostdraw 60', post: 'Strength 60 | Fortitude 65 | Agility 35 | Intelligence 0 | Willpower 0 | Charisma 0 | Heavy Weapon 100 | Flamecharm 75 | Frostdraw 75' },
      { pre: 'Strength 55 | Fortitude 35 | Agility 35 | Intelligence 0 | Willpower 0 | Charisma 0 | Heavy Weapon 100 | Flamecharm 60 | Frostdraw 60', post: 'Strength 75 | Fortitude 50 | Agility 45 | Intelligence 0 | Willpower 0 | Charisma 0 | Heavy Weapon 100 | Flamecharm 75 | Frostdraw 75' },
    ],
    reason: 'Flame and Frost give different pressure options while Greatsword and Dawnwalker support strong trades.',
  },
  {
    name: 'Three-Path Seer',
    oath: 'Blindseer',
    weapon: 'Quarterstaff',
    attunements: ['Shadowcast', 'Ironsing', 'Bloodrend'],
    statPlans: [
      { pre: 'Strength 25 | Fortitude 50 | Agility 25 | Intelligence 20 | Willpower 40 | Charisma 0 | Medium Weapon 100 | Shadowcast 50 | Ironsing 50 | Bloodrend 50', post: 'Strength 40 | Fortitude 65 | Agility 35 | Intelligence 35 | Willpower 55 | Charisma 0 | Medium Weapon 100 | Shadowcast 60 | Ironsing 60 | Bloodrend 60' },
      { pre: 'Strength 40 | Fortitude 35 | Agility 35 | Intelligence 30 | Willpower 40 | Charisma 0 | Medium Weapon 100 | Shadowcast 50 | Ironsing 50 | Bloodrend 50', post: 'Strength 55 | Fortitude 50 | Agility 45 | Intelligence 45 | Willpower 55 | Charisma 0 | Medium Weapon 100 | Shadowcast 60 | Ironsing 60 | Bloodrend 60' },
    ],
    reason: 'Three utility attunements give flexible options while Blindseer and Quarterstaff keep the build controlled.',
  },
];

function randomBuildTemplate() {
  return buildTemplates[Math.floor(Math.random() * buildTemplates.length)];
}

function buildIdeaText(mode, buildKey) {
  let savedBuild = buildHistories.get(buildKey);
  if (mode === 'reroll' && !savedBuild) return 'Make a build first with `-build idea` or `-build random`, then use `-build reroll` to change only its stats.';

  const build = mode === 'reroll' ? savedBuild.template : randomBuildTemplate();
  const currentPlanIndex = savedBuild?.planIndex ?? -1;
  let planIndex = Math.floor(Math.random() * build.statPlans.length);
  if (build.statPlans.length > 1 && planIndex === currentPlanIndex) planIndex = (planIndex + 1) % build.statPlans.length;
  buildHistories.set(buildKey, { template: build, planIndex });
  const plan = build.statPlans[planIndex];
  return `**${build.name}**\n\n**Oath:** ${build.oath}\n**Weapon:** ${build.weapon}\n**Attunements:** ${build.attunements.join(', ')}\n\n**Pre-Shrine stats:** ${plan.pre}\n**Post-Shrine stats:** ${plan.post}\n\n**Why it works:** ${build.reason}\n\nCheck exact requirements and talents before investing:\nBuilder: https://deepwoken.co/builder\nWiki: https://deepwoken.co/wiki`;
}

function guildInfo() {
  const description = GUILD_DESCRIPTION || 'A Deepwoken guild focused on coordinated events, gank response, and helping members.';
  const rules = GUILD_RULES_URL ? `\nGuild rules: ${GUILD_RULES_URL}` : '';
  return `**Abyssal Eclipse**\n${description}\n\nUse \`/ask\` for one-off Deepwoken questions, \`/chat\` or \`-ask\` for a conversation with the AI, \`/gank-ping\` to coordinate a response, and the event commands for scheduled alerts.${rules}`;
}

function nextDoomSpawn(now = new Date()) {
  const localNow = new Date(now.getTime() + timezoneOffsetMs);
  for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
    for (const time of doomTimesCet) {
      const [hour, minute] = time.split(':').map(Number);
      const candidate = new Date(Date.UTC(
        localNow.getUTCFullYear(),
        localNow.getUTCMonth(),
        localNow.getUTCDate() + dayOffset,
        hour,
        minute,
        0,
      ) - timezoneOffsetMs);
      if (candidate > now) return candidate;
    }
  }
  throw new Error('Could not calculate the next Doom spawn time');
}

async function sendDoomAlert(spawnTime) {
  const settings = await readSettings();

  for (const guild of client.guilds.cache.values()) {
    const guildSettings = settings[guild.id] || {};
    if (!guildSettings.doomRoleId) continue;
    const event = {
      title: 'Doom of Caeranthil',
      description: `${guildSettings.eventTexts?.doom || defaultEventTexts.doom} Scheduled time: <t:${Math.floor(spawnTime.getTime() / 1000)}:F> ${eventTimezone}.`,
      timestamp: spawnTime.toISOString(),
      url: 'https://deepwoken.fandom.com/wiki/The_Doom_of_Caeranthil',
    };
    const channelId = guildSettings.eventChannelId;
    const channel = channelId ? await guild.channels.fetch(channelId).catch(() => null) : null;
    if (!channel?.isTextBased()) continue;
    await channel.send({
      content: `<@&${guildSettings.doomRoleId}> ${event.title} is starting now! <t:${Math.floor(spawnTime.getTime() / 1000)}:T>`,
      allowedMentions: { roles: [guildSettings.doomRoleId] },
    });
  }
}

function scheduleNextDoomAlert() {
  const spawnTime = nextDoomSpawn();
  scheduleAtExactTime(spawnTime, async () => {
    try {
      await queueWorldEventSend(() => sendDoomAlert(spawnTime));
    } catch (error) {
      console.error('Doom of Caeranthil alert failed:', error.message);
    } finally {
      scheduleNextDoomAlert();
    }
  });
  console.log(`Next Doom of Caeranthil alert: ${formatEventTime(spawnTime)}`);
}

function nextRecurringEvent(now = new Date(), timesCet) {
  const localNow = new Date(now.getTime() + timezoneOffsetMs);
  for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
    for (const time of timesCet) {
      const [hour, minute] = time.split(':').map(Number);
      const candidate = new Date(Date.UTC(
        localNow.getUTCFullYear(),
        localNow.getUTCMonth(),
        localNow.getUTCDate() + dayOffset,
        hour,
        minute,
        0,
      ) - timezoneOffsetMs);
      if (candidate > now) return candidate;
    }
  }
  throw new Error('Could not calculate the next recurring event time');
}

async function sendRecurringAlert(eventTime, title, roleKey, descriptionKey, defaultDescription) {
  const settings = await readSettings();

  for (const guild of client.guilds.cache.values()) {
    const guildSettings = settings[guild.id] || {};
    if (!guildSettings[roleKey]) continue;
    const event = {
      title,
      description: `${guildSettings.eventTexts?.[descriptionKey] || defaultDescription} Scheduled time: <t:${Math.floor(eventTime.getTime() / 1000)}:F> ${eventTimezone}.`,
      timestamp: new Date(eventTime).toISOString(),
    };
    const channel = guildSettings.eventChannelId
      ? await guild.channels.fetch(guildSettings.eventChannelId).catch(() => null)
      : null;
    if (!channel?.isTextBased()) continue;
    await channel.send({
      content: `<@&${guildSettings[roleKey]}> ${event.title} is starting now! <t:${Math.floor(eventTime.getTime() / 1000)}:T>`,
      allowedMentions: { roles: [guildSettings[roleKey]] },
    });
  }
}

function scheduleNextRecurringAlert(eventDefinition) {
  const eventTime = nextRecurringEvent(new Date(), eventDefinition.times);
  scheduleAtExactTime(eventTime, async () => {
    try {
      await queueWorldEventSend(() => sendRecurringAlert(eventTime, eventDefinition.title, eventDefinition.roleKey, eventDefinition.textKey, eventDefinition.defaultText));
    } catch (error) {
      console.error(`${eventDefinition.title} alert failed:`, error.message);
    } finally {
      scheduleNextRecurringAlert(eventDefinition);
    }
  });
  console.log(`Next ${eventDefinition.title} alert: ${formatEventTime(eventTime)}`);
}

function infoForTopic(topic) {
  const topics = {
    overview: `Deepwoken is an action RPG on Roblox focused on exploration, builds, progression, and permadeath. Read more on the [Deepwoken Wiki](${wikiUrl}).`,
    events: `The Wiki documents Deepwoken events, but it does not expose a dependable live schedule for automated timing. Use \`/deepwoken-schedule\` when you know an event time. [Open the event information on the Wiki](${wikiUrl}).`,
    locations: `Deepwoken has regions including the Etrean Luminant and Erisia, with many islands, areas, and dungeons. Location details change as the game updates, so use the [Deepwoken Wiki](${wikiUrl}) for the current list.`,
    wiki: `[Open the Deepwoken Wiki](${wikiUrl}) for quests, locations, enemies, items, talents, oaths, and event details.`,
  };
  return topics[topic] || topics.overview;
}

async function scheduleAlert(guildId, event, minutes) {
  const settings = await readSettings();
  const scheduled = settings._scheduledEvents || [];
  const item = {
    id: `${guildId}-${Date.now()}`,
    guildId,
    event,
    runAt: Date.now() + minutes * 60_000,
  };
  settings._scheduledEvents = [...scheduled, item];
  await writeSettings(settings);
  setTimeout(() => deliverScheduledAlert(item), minutes * 60_000);
  return item;
}

async function deliverScheduledAlert(item) {
  const settings = await readSettings();
  const guild = await client.guilds.fetch(item.guildId).catch(() => null);
  if (guild) await sendEvent(guild, { ...item.event, title: item.event.title }, settings);
  settings._scheduledEvents = (settings._scheduledEvents || []).filter((event) => event.id !== item.id);
  await writeSettings(settings);
}

async function restoreScheduledAlerts() {
  const settings = await readSettings();
  for (const item of settings._scheduledEvents || []) {
    const remainingMs = item.runAt - Date.now();
    if (remainingMs <= 0) await deliverScheduledAlert(item);
    else setTimeout(() => deliverScheduledAlert(item), remainingMs);
  }
}

async function sendEvent(guild, event, settings) {
  const guildSettings = settings[guild.id] || {};
  const channelId = guildSettings.eventChannelId;
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId);
  if (!channel?.isTextBased()) return;
  const roleIds = guildSettings.eventRoleIds || [];
  const content = roleIds.length > 0
    ? roleIds.map((roleId) => `<@&${roleId}>`).join(' ')
    : 'Deepwoken event alert';
  await channel.send({ content, embeds: [eventEmbed(event)], allowedMentions: { roles: roleIds } });
}

async function pollDeepwokenEvents() {
  if (!DEEPWOKEN_EVENTS_URL) return;

  try {
    const response = await fetch(DEEPWOKEN_EVENTS_URL);
    if (!response.ok) throw new Error(`Feed returned HTTP ${response.status}`);
    const payload = await response.json();
    const events = Array.isArray(payload) ? payload : payload.events;
    if (!Array.isArray(events)) throw new Error('Feed must return an array or an object with an events array');

    const settings = await readSettings();
    const seenEvents = settings._seenEvents || [];
    const newEvents = events.filter((event) => event.id && !seenEvents.includes(String(event.id)));
    for (const guild of client.guilds.cache.values()) {
      for (const event of newEvents) await sendEvent(guild, event, settings);
    }
    settings._seenEvents = [...seenEvents, ...newEvents.map((event) => String(event.id))].slice(-100);
    await writeSettings(settings);
  } catch (error) {
    console.error('Deepwoken event poll failed:', error.message);
  }
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply(`Pong! API latency: ${client.ws.ping}ms`);
    return;
  }

  if (interaction.commandName === 'help') {
    await interaction.reply({
      content: '**Commands**\n`/ping` Check the bot response.\n`/help` Show this list.\n`/server` Show detailed server information.\n`/abyssal-eclipse` Guild information.\n`/ask` Ask the AI one question.\n`/chat` Have a conversation with the AI.\n`-ask message` Chat with the AI using a prefix.\n`-build idea` Get an offline build idea.\n`-build random` Get a random offline build.\n`-build reroll` Reroll only the build stats.\n`-reset` Start a new AI conversation.\n`/chat-reset` Clear your AI conversation.\n`/set-ai-channel` Restrict AI commands to one channel.\n`/clear-ai-channel` Remove the AI channel restriction.\n`/gank-ping` Send a gank alert.\n`/set-event-channel` Choose the Deepwoken alert channel.\n`/set-gank-channel` Choose the gank alert channel.\n`/set-event-roles` Choose the roles to ping.\n`/set-gank-roles` Choose gank roles to ping.\n`/clear-event-roles` Disable role pings.\n`/set-doom-role` Choose the Doom alert role.\n`/set-interluminary-role` Choose the Interluminary Parasol role.\n`/set-battle-royale-role` Choose the Battle Royale role.\n`/set-carnival-role` Choose the Carnival of Hearts role.\n`/set-event-text` Customize world event text.\n`/world-event-test` Test a world event alert.\n`/deepwoken-schedule` Schedule an event alert.\n`/deepwoken-test` Test the configured alert channel.',
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === 'server') {
    const { guild } = interaction;
    await interaction.reply({
      content: guild
        ? `**${guild.name}**\nOwner: <@${guild.ownerId}>\nMembers: ${guild.memberCount}\nCreated: <t:${Math.floor(guild.createdTimestamp / 1000)}:D>\nChannels: ${guild.channels.cache.size}\nRoles: ${guild.roles.cache.size}\nBoost level: ${guild.premiumTier}\nBoosts: ${guild.premiumSubscriptionCount ?? 0}`
        : 'This command can only be used inside a server.',
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === 'set-event-channel') {
    const channel = interaction.options.getChannel('channel', true);
    const settings = await readSettings();
    settings[interaction.guildId] = { ...settings[interaction.guildId], eventChannelId: channel.id };
    await writeSettings(settings);
    await interaction.reply({ content: `Deepwoken events will be posted in ${channel}.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'set-ai-channel') {
    const channel = interaction.options.getChannel('channel', true);
    const settings = await readSettings();
    settings[interaction.guildId] = { ...settings[interaction.guildId], aiChannelId: channel.id };
    await writeSettings(settings);
    await interaction.reply({ content: `AI commands will only work in ${channel}.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'clear-ai-channel') {
    const settings = await readSettings();
    settings[interaction.guildId] = { ...settings[interaction.guildId], aiChannelId: null };
    await writeSettings(settings);
    await interaction.reply({ content: 'The AI channel restriction has been removed.', ephemeral: true });
    return;
  }

  if (interaction.commandName === 'set-gank-channel') {
    const channel = interaction.options.getChannel('channel', true);
    const settings = await readSettings();
    settings[interaction.guildId] = { ...settings[interaction.guildId], gankChannelId: channel.id };
    await writeSettings(settings);
    await interaction.reply({ content: `Gank pings will be posted in ${channel}.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'deepwoken-test') {
    const settings = await readSettings();
    const channelId = settings[interaction.guildId]?.eventChannelId;
    const channel = channelId ? await interaction.guild.channels.fetch(channelId) : null;
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: 'Choose an event channel first with `/set-event-channel`.', ephemeral: true });
      return;
    }
    const roleIds = settings[interaction.guildId]?.eventRoleIds || [];
    const content = roleIds.length > 0
      ? roleIds.map((roleId) => `<@&${roleId}>`).join(' ')
      : 'Deepwoken event alert test';
    await channel.send({ content, embeds: [eventEmbed({ title: 'Test alert', description: 'Deepwoken event alerts are working.' })], allowedMentions: { roles: roleIds } });
    await interaction.reply({ content: `Test alert sent to ${channel}.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'set-event-roles') {
    const roleIds = ['role1', 'role2', 'role3', 'role4', 'role5', 'role6', 'role7', 'role8', 'role9', 'role10']
      .map((name) => interaction.options.getRole(name)?.id)
      .filter(Boolean);
    const settings = await readSettings();
    settings[interaction.guildId] = { ...settings[interaction.guildId], eventRoleIds: roleIds };
    await writeSettings(settings);
    await interaction.reply({ content: `Deepwoken alerts will ping ${roleIds.map((roleId) => `<@&${roleId}>`).join(', ')}.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'set-gank-roles') {
    const roleIds = ['role1', 'role2', 'role3', 'role4', 'role5', 'role6', 'role7', 'role8', 'role9', 'role10']
      .map((name) => interaction.options.getRole(name)?.id)
      .filter(Boolean);
    const settings = await readSettings();
    settings[interaction.guildId] = { ...settings[interaction.guildId], gankRoleIds: roleIds };
    await writeSettings(settings);
    await interaction.reply({ content: `Gank pings will mention ${roleIds.map((roleId) => `<@&${roleId}>`).join(', ')}.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'clear-event-roles') {
    const settings = await readSettings();
    settings[interaction.guildId] = { ...settings[interaction.guildId], eventRoleIds: [] };
    await writeSettings(settings);
    await interaction.reply({ content: 'Deepwoken role pings have been disabled.', ephemeral: true });
    return;
  }

  if (interaction.commandName === 'set-doom-role') {
    const role = interaction.options.getRole('role', true);
    const settings = await readSettings();
    settings[interaction.guildId] = { ...settings[interaction.guildId], doomRoleId: role.id };
    await writeSettings(settings);
    await interaction.reply({ content: `${role} will be pinged for Doom of Caeranthil spawns at every odd ${eventTimezone} hour.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'set-interluminary-role') {
    const role = interaction.options.getRole('role', true);
    const settings = await readSettings();
    settings[interaction.guildId] = { ...settings[interaction.guildId], interluminaryRoleId: role.id };
    await writeSettings(settings);
    await interaction.reply({ content: `${role} will be pinged for Interluminary Parasol events every 1 hour and 30 minutes.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'set-battle-royale-role') {
    const role = interaction.options.getRole('role', true);
    const settings = await readSettings();
    settings[interaction.guildId] = { ...settings[interaction.guildId], battleRoyaleRoleId: role.id };
    await writeSettings(settings);
    await interaction.reply({ content: `${role} will be pinged for Battle Royale events every 1 hour and 30 minutes, starting at 00:30 ${eventTimezone}.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'set-carnival-role') {
    const role = interaction.options.getRole('role', true);
    const settings = await readSettings();
    settings[interaction.guildId] = { ...settings[interaction.guildId], carnivalRoleId: role.id };
    await writeSettings(settings);
    await interaction.reply({ content: `${role} will be pinged for Carnival of Hearts events every 1 hour and 30 minutes, starting at 01:00 ${eventTimezone}.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'set-event-text') {
    const eventKey = interaction.options.getString('event', true);
    const text = interaction.options.getString('text', true).trim();
    const settings = await readSettings();
    settings[interaction.guildId] = {
      ...settings[interaction.guildId],
      eventTexts: {
        ...settings[interaction.guildId]?.eventTexts,
        [eventKey]: text,
      },
    };
    await writeSettings(settings);
    await interaction.reply({ content: `The ${eventKey} alert text was updated.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'world-event-test') {
    const eventKey = interaction.options.getString('event', true);
    const eventDefinitions = {
      doom: { title: 'Doom of Caeranthil', roleKey: 'doomRoleId', textKey: 'doom' },
      interluminary: { title: 'Interluminary Parasol', roleKey: 'interluminaryRoleId', textKey: 'interluminary' },
      battleRoyale: { title: 'Battle Royale', roleKey: 'battleRoyaleRoleId', textKey: 'battleRoyale' },
      carnival: { title: 'Carnival of Hearts', roleKey: 'carnivalRoleId', textKey: 'carnival' },
    };
    const eventDefinition = eventDefinitions[eventKey];
    const settings = await readSettings();
    const guildSettings = settings[interaction.guildId] || {};
    const channel = guildSettings.eventChannelId
      ? await interaction.guild.channels.fetch(guildSettings.eventChannelId).catch(() => null)
      : null;
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: 'Choose an event channel first with `/set-event-channel`.', ephemeral: true });
      return;
    }
    const roleId = guildSettings[eventDefinition.roleKey];
    await channel.send({
      content: `${roleId ? `<@&${roleId}> ` : ''}${eventDefinition.title} is starting now!`,
      allowedMentions: { roles: roleId ? [roleId] : [] },
    });
    await interaction.reply({ content: `${eventDefinition.title} test alert sent to ${channel}.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'deepwoken-info') {
    await interaction.reply({
      content: infoForTopic(interaction.options.getString('topic', true)),
      ephemeral: true,
    });
    return;
  }

  if (interaction.commandName === 'abyssal-eclipse') {
    await interaction.reply({ content: guildInfo(), ephemeral: true });
    return;
  }

  if (interaction.commandName === 'ask') {
    const aiChannelId = await getAiChannelId(interaction.guildId);
    if (aiChannelId && interaction.channelId !== aiChannelId) {
      await interaction.reply({ content: `AI commands can only be used in <#${aiChannelId}>.`, ephemeral: true });
      return;
    }
    await interaction.deferReply();
    try {
      const answer = await askAi(interaction.options.getString('question', true));
      await interaction.editReply(answer.slice(0, 2000));
    } catch (error) {
      console.error('AI request failed:', error.message);
      await interaction.editReply(aiErrorMessage(error));
    }
    return;
  }

  if (interaction.commandName === 'chat') {
    const aiChannelId = await getAiChannelId(interaction.guildId);
    if (aiChannelId && interaction.channelId !== aiChannelId) {
      await interaction.reply({ content: `AI commands can only be used in <#${aiChannelId}>.`, ephemeral: true });
      return;
    }
    const message = interaction.options.getString('message', true);
    const chatKey = `${interaction.guildId || 'direct-message'}:${interaction.user.id}`;
    const history = chatHistories.get(chatKey) || [];
    await interaction.deferReply();
    try {
      const answer = await askAi(message, history, true);
      chatHistories.set(chatKey, [
        ...history,
        { role: 'user', parts: [{ text: message }] },
        { role: 'model', parts: [{ text: answer }] },
      ].slice(-12));
      await interaction.editReply(answer.slice(0, 2000));
    } catch (error) {
      console.error('Chat AI request failed:', error.message);
      await interaction.editReply(aiErrorMessage(error));
    }
    return;
  }

  if (interaction.commandName === 'chat-reset') {
    const chatKey = `${interaction.guildId || 'direct-message'}:${interaction.user.id}`;
    chatHistories.delete(chatKey);
    await interaction.reply({ content: 'Your AI conversation has been cleared.', ephemeral: true });
    return;
  }

  if (interaction.commandName === 'gank-ping') {
    const settings = await readSettings();
    const guildSettings = settings[interaction.guildId] || {};
    const channelId = guildSettings.gankChannelId || guildSettings.eventChannelId;
    const channel = channelId ? await interaction.guild.channels.fetch(channelId) : null;
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: 'Choose a gank channel first with `/set-gank-channel`.', ephemeral: true });
      return;
    }
    const roleIds = guildSettings.gankRoleIds || [];
    const location = interaction.options.getString('location', true);
    const target = interaction.options.getString('target');
    const details = interaction.options.getString('details');
    const content = roleIds.length > 0 ? roleIds.map((roleId) => `<@&${roleId}>`).join(' ') : 'Gank ping';
    await channel.send({ content, embeds: [gankEmbed(location, target, details)], allowedMentions: { roles: roleIds } });
    await interaction.reply({ content: `Gank ping sent to ${channel}.`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'deepwoken-schedule') {
    const settings = await readSettings();
    const channelId = settings[interaction.guildId]?.eventChannelId;
    const channel = channelId ? await interaction.guild.channels.fetch(channelId) : null;
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: 'Choose an event channel first with `/set-event-channel`.', ephemeral: true });
      return;
    }
    const event = {
      title: interaction.options.getString('event', true),
      description: interaction.options.getString('details') || 'Scheduled Deepwoken event alert.',
    };
    const minutes = interaction.options.getInteger('minutes', true);
    await scheduleAlert(interaction.guildId, event, minutes);
    await interaction.reply({ content: `Scheduled **${event.title}** in ${channel} for <t:${Math.floor((Date.now() + minutes * 60_000) / 1000)}:R>.`, ephemeral: true });
  }
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.inGuild()) return;

  const command = message.content.trim().toLowerCase();
  const chatKey = `${message.guildId}:${message.author.id}`;
  if (command === '-reset' || command === '-ask-reset') {
    chatHistories.delete(chatKey);
    await respondToMessage(message, 'Your AI conversation has been reset. Start a new one with `-ask`.');
    return;
  }
  if (/^-build\s+(?:idea|random|reroll|stats)(?:\s|$)/i.test(message.content)) {
    const aiChannelId = await getAiChannelId(message.guildId);
    if (aiChannelId && message.channelId !== aiChannelId) return;
    const buildCommand = message.content.trim().toLowerCase().split(/\s+/)[1];
    const buildKey = `${message.guildId}:${message.author.id}`;
    const mode = buildCommand === 'reroll' || buildCommand === 'stats' ? 'reroll' : 'new';
    await respondToMessage(message, buildIdeaText(mode, buildKey));
    return;
  }
  if (!/^-ask(?:\s|$)/i.test(message.content)) return;

  const aiChannelId = await getAiChannelId(message.guildId);
  if (aiChannelId && message.channelId !== aiChannelId) return;

  const question = message.content.slice(4).trim();
  if (!question) {
    await respondToMessage(message, 'Use `-ask your message here` to chat with me.');
    return;
  }

  const history = chatHistories.get(chatKey) || [];
  await message.channel.sendTyping().catch(() => {});
  try {
    const answer = await askAi(question, history, true);
    chatHistories.set(chatKey, [
      ...history,
      { role: 'user', parts: [{ text: question }] },
      { role: 'model', parts: [{ text: answer }] },
    ].slice(-12));
    await respondToMessage(message, answer.slice(0, 2000));
  } catch (error) {
    console.error('Prefix chat AI request failed:', error.message);
    await respondToMessage(message, aiErrorMessage(error));
  }
});

client.login(DISCORD_TOKEN);

client.once(Events.ClientReady, () => {
  restoreScheduledAlerts();
  const scheduledWorldEvents = [
    { nextTime: nextDoomSpawn(), schedule: scheduleNextDoomAlert },
    ...recurringEvents.map((eventDefinition) => ({
      nextTime: nextRecurringEvent(new Date(), eventDefinition.times),
      schedule: () => scheduleNextRecurringAlert(eventDefinition),
    })),
  ].sort((left, right) => left.nextTime - right.nextTime);
  for (const event of scheduledWorldEvents) event.schedule();
  if (DEEPWOKEN_EVENTS_URL) {
    pollDeepwokenEvents();
    setInterval(pollDeepwokenEvents, pollIntervalMs);
  } else {
    console.log('Deepwoken polling is disabled: DEEPWOKEN_EVENTS_URL is not configured.');
  }
});
