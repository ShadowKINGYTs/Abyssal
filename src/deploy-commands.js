import 'dotenv/config';
import { ChannelType, PermissionFlagsBits, REST, Routes, SlashCommandBuilder } from 'discord.js';

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
const discordToken = DISCORD_TOKEN?.trim().replace(/^Bot\s+/i, '');
if (!discordToken || !CLIENT_ID || !GUILD_ID) {
  throw new Error('DISCORD_TOKEN, CLIENT_ID, and GUILD_ID are required in .env');
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check whether the bot is responding.'),
  new SlashCommandBuilder().setName('help').setDescription('Show available commands.'),
  new SlashCommandBuilder().setName('server').setDescription('Show information about this server.'),
  new SlashCommandBuilder()
    .setName('set-event-channel')
    .setDescription('Choose where Deepwoken event alerts should be posted.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel for Deepwoken alerts.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Set the gank ping channel and ping role for this server.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel for gank pings.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true))
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('The role to ping for gank alerts.')
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName('deepwoken-test')
    .setDescription('Send a test Deepwoken alert to the configured channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('set-event-roles')
    .setDescription('Choose up to ten roles to ping for Deepwoken alerts.')
    .addRoleOption((option) => option.setName('role1').setDescription('Role to ping.').setRequired(true))
    .addRoleOption((option) => option.setName('role2').setDescription('Another role to ping.'))
    .addRoleOption((option) => option.setName('role3').setDescription('Another role to ping.'))
    .addRoleOption((option) => option.setName('role4').setDescription('Another role to ping.'))
    .addRoleOption((option) => option.setName('role5').setDescription('Another role to ping.'))
    .addRoleOption((option) => option.setName('role6').setDescription('Another role to ping.'))
    .addRoleOption((option) => option.setName('role7').setDescription('Another role to ping.'))
    .addRoleOption((option) => option.setName('role8').setDescription('Another role to ping.'))
    .addRoleOption((option) => option.setName('role9').setDescription('Another role to ping.'))
    .addRoleOption((option) => option.setName('role10').setDescription('Another role to ping.'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('clear-event-roles')
    .setDescription('Stop role pings for Deepwoken alerts.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('set-doom-role')
    .setDescription('Choose the role to ping when Doom of Caeranthil spawns.')
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('The role to ping for Doom spawns.')
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('set-interluminary-role')
    .setDescription('Choose the role to ping for Interluminary Parasol events.')
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('The role to ping for Interluminary Parasol.')
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('set-battle-royale-role')
    .setDescription('Choose the role to ping for Battle Royale events.')
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('The role to ping for Battle Royale.')
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('set-carnival-role')
    .setDescription('Choose the role to ping for Carnival of Hearts events.')
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('The role to ping for Carnival of Hearts.')
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('set-event-text')
    .setDescription('Change the message text for an automatic world event alert.')
    .addStringOption((option) => option
      .setName('event')
      .setDescription('The world event to customize.')
      .setRequired(true)
      .addChoices(
        { name: 'Doom of Caeranthil', value: 'doom' },
        { name: 'Interluminary Parasol', value: 'interluminary' },
        { name: 'Battle Royale', value: 'battleRoyale' },
        { name: 'Carnival of Hearts', value: 'carnival' },
      ))
    .addStringOption((option) => option
      .setName('text')
      .setDescription('The custom alert text. The scheduled time is added automatically.')
      .setMaxLength(1000)
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('world-event-test')
    .setDescription('Test an automatic Deepwoken world-event alert.')
    .addStringOption((option) => option
      .setName('event')
      .setDescription('The world event to test.')
      .setRequired(true)
      .addChoices(
        { name: 'Doom of Caeranthil', value: 'doom' },
        { name: 'Interluminary Parasol', value: 'interluminary' },
        { name: 'Battle Royale', value: 'battleRoyale' },
        { name: 'Carnival of Hearts', value: 'carnival' },
      ))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('deepwoken-info')
    .setDescription('Get Deepwoken information and Wiki links.')
    .addStringOption((option) => option
      .setName('topic')
      .setDescription('The information topic.')
      .setRequired(true)
      .addChoices(
        { name: 'Overview', value: 'overview' },
        { name: 'Events', value: 'events' },
        { name: 'Locations', value: 'locations' },
        { name: 'Wiki', value: 'wiki' },
      )),
  new SlashCommandBuilder()
    .setName('abyssal-eclipse')
    .setDescription('Learn about the Abyssal Eclipse guild.'),
  new SlashCommandBuilder()
    .setName('ally-request')
    .setDescription('Send a guild alliance request to the configured ally request channel.')
    .addStringOption((option) => option
      .setName('guild-name')
      .setDescription('Your guild name.')
      .setMaxLength(100)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('top-rank')
      .setDescription('Your guild top rank or highest member rank.')
      .setMaxLength(100)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('server-id')
      .setDescription('Your Discord server ID.')
      .setMaxLength(64)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('server-link')
      .setDescription('Your Discord server invite or server link.')
      .setMaxLength(500)
      .setRequired(true)),
  new SlashCommandBuilder()
    .setName('ally-list')
    .setDescription('Show the current allied guilds.'),
  new SlashCommandBuilder()
    .setName('set-ally-request-channel')
    .setDescription('Choose the channel where ally requests should be sent.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel for ally requests.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('set-health-channel')
    .setDescription('Choose where bot health alerts are posted.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('The channel for health alerts.')
      .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('gank-ping')
    .setDescription('Send a coordinated gank alert.')
    .addStringOption((option) => option
      .setName('location')
      .setDescription('Where the gank is happening.')
      .setMaxLength(100)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('details')
      .setDescription('The details of the report.')
      .setMaxLength(500)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('target')
      .setDescription('Optional target or enemy description.')
      .setMaxLength(200)),
  new SlashCommandBuilder()
    .setName('deepwoken-schedule')
    .setDescription('Schedule a Deepwoken event alert in the configured channel.')
    .addStringOption((option) => option
      .setName('event')
      .setDescription('The event name, for example Summer Isle or Chaser.')
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName('minutes')
      .setDescription('How many minutes until the alert (1-10080).')
      .setMinValue(1)
      .setMaxValue(10080)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('details')
      .setDescription('Optional details to include in the alert.'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(discordToken);
await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
console.log('Slash commands registered.');
