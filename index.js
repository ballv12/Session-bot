import { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, RoleSelectMenuBuilder } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs-extra';

// Load environment variables
dotenv.config();

// Load config
const configPath = './config.json';
let config = {};
if (fs.existsSync(configPath)) {
  config = fs.readJsonSync(configPath);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Run the initial setup wizard for the session bot.'),
  new SlashCommandBuilder()
    .setName('config')
    .setDescription('Reconfigure the session bot settings.'),
  new SlashCommandBuilder()
    .setName('session')
    .setDescription('Session management commands')
    .addSubcommand(sub =>
      sub.setName('start').setDescription('Start a session')
    )
    .addSubcommand(sub =>
      sub.setName('stop').setDescription('Stop a session')
    )
    .addSubcommand(sub =>
      sub.setName('vote').setDescription('Start a session vote')
    ),
  new SlashCommandBuilder()
    .setName('confirm')
    .setDescription('Confirm and save a new banner image')
    .addSubcommand(sub =>
      sub.setName('banner')
        .setDescription('Confirm a new banner image')
        .addStringOption(opt =>
          opt.setName('type')
            .setDescription('Which banner to update')
            .setRequired(true)
            .addChoices(
              { name: 'Session Start', value: 'sessionStart' },
              { name: 'Session Shutdown', value: 'sessionShutdown' },
              { name: 'Session Vote', value: 'sessionVote' }
            )
        )
    )
].map(cmd => cmd.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );
    console.log('Slash commands registered.');
  } catch (error) {
    console.error(error);
  }
}

registerCommands();

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, options } = interaction;

  if (commandName === 'setup') {
    // Step 1: Ask for banner uploads
    const embed = new EmbedBuilder()
      .setTitle('Session Bot Setup: Step 1/4')
      .setDescription('Please upload your **Session Start Banner**, **Session Shutdown Banner**, and **Session Vote Banner** as image attachments in this thread.\n\nWhen you are done, click **Next** or **Skip** to proceed without uploading images.');
    const nextBtn = new ButtonBuilder()
      .setCustomId('setup_banners_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary);
    const skipBtn = new ButtonBuilder()
      .setCustomId('setup_banners_skip')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Secondary);
    const actionRow = new ActionRowBuilder().addComponents(nextBtn, skipBtn);
    await interaction.reply({ embeds: [embed], components: [actionRow], ephemeral: true });
  } else if (commandName === 'config') {
    // Step 1: Show dropdown for config sections
    const configMenu = new StringSelectMenuBuilder()
      .setCustomId('config_section_select')
      .setPlaceholder('Select a section to configure')
      .addOptions([
        { label: 'Graphics', value: 'graphics', description: 'Banners and emojis' },
        { label: 'Roles and Channels', value: 'roles', description: 'Roles for session management' },
        { label: 'Server Information', value: 'server', description: 'Server info, join code, votes' }
      ]);
    const row = new ActionRowBuilder().addComponents(configMenu);
    await interaction.reply({
      content: 'Select a section to reconfigure:',
      components: [row],
      ephemeral: true
    });
  } else if (commandName === 'session') {
    const sub = options.getSubcommand();
    if (sub === 'start') {
      // Check permissions
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.roles.cache.has(config.roles.canStartSession)) {
        await interaction.reply({ content: 'You do not have permission to start a session.', ephemeral: true });
        return;
      }
      // Post session start embed
      const pingRole = config.roles.pingOnStart ? `<@&${config.roles.pingOnStart}>` : '';
      const embed = new EmbedBuilder()
        .setTitle('Session Start!')
        .setDescription(`A session startup has been started by <@${interaction.user.id}>!\n\n**Server:** ${config.serverName}\n**Server code:** ${config.joinCode}\n**Server owner:** ${config.ownerUsername}`)
        .setColor(0x57F287)
        .setTimestamp();
      if (config.banners.sessionStart) {
        embed.setImage(config.banners.sessionStart);
      }
      await interaction.reply({ content: pingRole, embeds: [embed] });
    } else if (sub === 'stop') {
      // Check permissions
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (!member.roles.cache.has(config.roles.canStartSession)) {
        await interaction.reply({ content: 'You do not have permission to stop a session.', ephemeral: true });
        return;
      }
      // Post session shutdown embed
      const embed = new EmbedBuilder()
        .setTitle('Session shutdown!')
        .setDescription('Session shutdown. You must not join the in-game server or else there will be moderation action taken against you!')
        .setColor(0xED4245)
        .setTimestamp();
      if (config.banners.sessionShutdown) {
        embed.setImage(config.banners.sessionShutdown);
      }
      await interaction.reply({ embeds: [embed] });
    } else if (sub === 'vote') {
      // Start a session vote
      const votesNeeded = config.votesRequired || 5;
      const voteBanner = config.banners.sessionVote || null;
      const voters = new Set();
      const embed = new EmbedBuilder()
        .setTitle('Session Vote!')
        .setDescription(`A session vote has been started by <@${interaction.user.id}>!\nReact below to show us you're going to join our session!\n\nVotes needed: **${votesNeeded}**\nTime: **5 Minutes**`)
        .setColor(0xFEE75C)
        .setTimestamp();
      if (config.banners.sessionVote) {
        embed.setImage(config.banners.sessionVote);
      }
      const voteBtn = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('session_vote_btn')
          .setLabel('Vote')
          .setStyle(ButtonStyle.Success)
      );
      const voteMsg = await interaction.reply({ embeds: [embed], components: [voteBtn] });
      // Store vote state in memory
      const voteState = {
        messageId: (await voteMsg.fetch()).id,
        voters: new Set(),
        votesNeeded,
        timeout: null,
        ended: false
      };
      // Timer to end vote after 5 minutes
      voteState.timeout = setTimeout(async () => {
        voteState.ended = true;
        const updatedEmbed = EmbedBuilder.from(embed)
          .setDescription(`Session vote ended!\n\nVotes received: **${voteState.voters.size}**/${votesNeeded}\nVoters: ${[...voteState.voters].map(id => `<@${id}>`).join(', ') || 'None'}`);
        await interaction.editReply({ embeds: [updatedEmbed], components: [] });
      }, 5 * 60 * 1000);
      // Store vote state globally (in-memory, per message)
      if (!global.sessionVotes) global.sessionVotes = {};
      global.sessionVotes[voteState.messageId] = voteState;
    }
  } else if (commandName === 'confirm') {
    const sub = options.getSubcommand();
    if (sub === 'banner') {
      const type = options.getString('type');
      // Find the user's most recent image attachment in the channel
      const messages = await interaction.channel.messages.fetch({ limit: 20 });
      let found = false;
      for (const msg of messages.values()) {
        if (msg.author.id === interaction.user.id && msg.attachments.size > 0) {
          for (const att of msg.attachments.values()) {
            if (att.contentType?.startsWith('image/')) {
              config.banners[type] = att.url;
              fs.writeJsonSync(configPath, config, { spaces: 2 });
              const embed = new EmbedBuilder()
                .setTitle('Banner Updated!')
                .setDescription(`The **${type.replace('session', '').replace(/([A-Z])/g, ' $1').trim()}** banner has been updated.`);
              if (att.url) {
                embed.setImage(att.url);
              }
              await interaction.reply({ embeds: [embed], ephemeral: true });
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }
      if (!found) {
        await interaction.reply({ content: 'No recent image attachment found from you in this channel. Please upload an image and try again.', ephemeral: true });
      }
    }
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId === 'setup_banners_next') {
    // Check for attachments in the channel/thread
    const messages = await interaction.channel.messages.fetch({ limit: 20 });
    const banners = { sessionStart: '', sessionShutdown: '', sessionVote: '' };
    for (const msg of messages.values()) {
      for (const att of msg.attachments.values()) {
        if (!banners.sessionStart && att.name.toLowerCase().includes('start')) banners.sessionStart = att.url;
        else if (!banners.sessionShutdown && att.name.toLowerCase().includes('shutdown')) banners.sessionShutdown = att.url;
        else if (!banners.sessionVote && att.name.toLowerCase().includes('vote')) banners.sessionVote = att.url;
      }
    }
    if (!banners.sessionStart || !banners.sessionShutdown || !banners.sessionVote) {
      await interaction.reply({ content: 'Please upload all three banners (start, shutdown, vote) as images before proceeding.', ephemeral: true });
      return;
    }
    // Save to config
    config.banners = banners;
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    // Proceed to next step (roles)
    const roles = interaction.guild.roles.cache.filter(r => r.name !== '@everyone');
    const roleOptions = roles.map(role => ({
      label: role.name,
      value: role.id,
      description: `Role ID: ${role.id}`
    })).slice(0, 25);
    const selectStart = new RoleSelectMenuBuilder()
      .setCustomId('setup_role_start')
      .setPlaceholder('Select who can start the session');
    const selectPing = new RoleSelectMenuBuilder()
      .setCustomId('setup_role_ping')
      .setPlaceholder('Select which role to ping for session start');
    const row1 = new ActionRowBuilder().addComponents(selectStart);
    const row2 = new ActionRowBuilder().addComponents(selectPing);
    await interaction.reply({
      content: 'Step 2/4: Select the roles for session management.',
      components: [row1, row2],
      ephemeral: true
    });
  } else if (interaction.customId === 'setup_banners_skip') {
    // User chose to skip uploading banners
    config.banners = { sessionStart: '', sessionShutdown: '', sessionVote: '' };
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    // Proceed to next step (roles)
    const roles = interaction.guild.roles.cache.filter(r => r.name !== '@everyone');
    const roleOptions = roles.map(role => ({
      label: role.name,
      value: role.id,
      description: `Role ID: ${role.id}`
    })).slice(0, 25);
    const selectStart = new RoleSelectMenuBuilder()
      .setCustomId('setup_role_start')
      .setPlaceholder('Select who can start the session');
    const selectPing = new RoleSelectMenuBuilder()
      .setCustomId('setup_role_ping')
      .setPlaceholder('Select which role to ping for session start');
    const row1 = new ActionRowBuilder().addComponents(selectStart);
    const row2 = new ActionRowBuilder().addComponents(selectPing);
    await interaction.reply({
      content: 'Step 2/4: Select the roles for session management.',
      components: [row1, row2],
      ephemeral: true
    });
  } else if (interaction.customId === 'session_vote_btn') {
    // Find vote state
    const msgId = interaction.message.id;
    const voteState = global.sessionVotes?.[msgId];
    if (!voteState || voteState.ended) {
      await interaction.reply({ content: 'This vote has ended.', ephemeral: true });
      return;
    }
    // Add voter
    voteState.voters.add(interaction.user.id);
    // Update embed with voter list
    const embed = EmbedBuilder.from(interaction.message.embeds?.[0])
      .setDescription(
        `A session vote has been started!\n\nVotes needed: **${voteState.votesNeeded}**\nTime: **5 Minutes**\n\nVotes received: **${voteState.voters.size}**/${voteState.votesNeeded}\nVoters: ${[...voteState.voters].map(id => `<@${id}>`).join(', ') || 'None'}`
      );
    await interaction.update({ embeds: [embed], components: interaction.message.components ? [interaction.message.components[0]] : [] });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu() && !interaction.isRoleSelectMenu()) return;
  
  if (interaction.customId === 'setup_role_start' || interaction.customId === 'config_role_start') {
    const roleId = interaction.values[0];
    config.roles = config.roles || {};
    config.roles.canStartSession = roleId;
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    await interaction.reply({ content: 'Role for who can start the session updated!', ephemeral: true });
  } else if (interaction.customId === 'setup_role_ping' || interaction.customId === 'config_role_ping') {
    const roleId = interaction.values[0];
    config.roles = config.roles || {};
    config.roles.pingOnStart = roleId;
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    await interaction.reply({ content: 'Role to ping for session start updated!', ephemeral: true });
  } else if (interaction.customId === 'config_section_select') {
    const value = interaction.values[0];
    if (value === 'graphics') {
      // Step 2: Show dropdown for which banner to update
      const bannerMenu = new StringSelectMenuBuilder()
        .setCustomId('config_banner_select')
        .setPlaceholder('Select a banner to update')
        .addOptions([
          { label: 'Session Start Banner', value: 'sessionStart' },
          { label: 'Session Shutdown Banner', value: 'sessionShutdown' },
          { label: 'Session Vote Banner', value: 'sessionVote' }
        ]);
      const row = new ActionRowBuilder().addComponents(bannerMenu);
      await interaction.reply({
        content: 'Select which banner you want to update:',
        components: [row],
        ephemeral: true
      });
    } else if (value === 'roles') {
      // Show dropdowns for roles
      const selectStart = new RoleSelectMenuBuilder()
        .setCustomId('config_role_start')
        .setPlaceholder('Select who can start the session');

      const selectPing = new RoleSelectMenuBuilder()
        .setCustomId('config_role_ping')
        .setPlaceholder('Select which role to ping for session start');

      const row1 = new ActionRowBuilder().addComponents(selectStart);
      const row2 = new ActionRowBuilder().addComponents(selectPing);

      await interaction.reply({
        content: 'Update the roles for session management:',
        components: [row1, row2],
        ephemeral: true
      });
    } else if (value === 'server') {
      // Show modal for server info
      const modal = new ModalBuilder()
        .setCustomId('config_server_info')
        .setTitle('Update Server Information')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('server_name')
              .setLabel('Server Name')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(config.serverName || '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('owner_username')
              .setLabel('Server Owner Username')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(config.ownerUsername || '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('join_code')
              .setLabel('Join Code')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(config.joinCode || '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('votes_required')
              .setLabel('Votes Required to Start Session')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(config.votesRequired ? config.votesRequired.toString() : '5')
          )
        );
      await interaction.showModal(modal);
    }
  } else if (interaction.customId === 'config_banner_select') {
    // Step 3: Prompt for image upload
    const bannerType = interaction.values[0];
    await interaction.reply({
      content: `Please upload a new image for the **${bannerType.replace('session', '').replace(/([A-Z])/g, ' $1').trim()}** as an attachment in this channel. After uploading, type "/confirm banner ${bannerType}" to save it.`,
      ephemeral: true
    });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isModalSubmit()) return;
  if (interaction.customId === 'setup_server_info') {
    config.serverName = interaction.fields.getTextInputValue('server_name');
    config.ownerUsername = interaction.fields.getTextInputValue('owner_username');
    config.joinCode = interaction.fields.getTextInputValue('join_code');
    const votes = Number.parseInt(interaction.fields.getTextInputValue('votes_required'), 10);
    config.votesRequired = Number.isNaN(votes) ? 5 : votes;
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    // Proceed to summary step
    const guild = interaction.guild;
    const canStartRole = guild.roles.cache.get(config.roles.canStartSession);
    const pingRole = guild.roles.cache.get(config.roles.pingOnStart);
    const summaryEmbed = new EmbedBuilder()
      .setTitle('Session Bot Setup: Success!')
      .setDescription('Your session bot is now configured with the following settings:')
      .addFields(
        { name: 'Server Name', value: config.serverName, inline: true },
        { name: 'Owner Username', value: config.ownerUsername, inline: true },
        { name: 'Join Code', value: config.joinCode, inline: true },
        { name: 'Votes Required', value: config.votesRequired.toString(), inline: true },
        { name: 'Can Start Session Role', value: canStartRole ? `<@&${canStartRole.id}>` : 'Not set', inline: true },
        { name: 'Ping On Start Role', value: pingRole ? `<@&${pingRole.id}>` : 'Not set', inline: true }
      )
      .setFooter({ text: 'You can re-run /setup or use /config to update these settings.' });
    if (config.banners.sessionStart) {
      summaryEmbed.setImage(config.banners.sessionStart);
    }
    const configBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('goto_config')
        .setLabel('Go to /config')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('rerun_setup')
        .setLabel('Re-run Setup')
        .setStyle(ButtonStyle.Primary)
    );
    await interaction.reply({ embeds: [summaryEmbed], components: [configBtn], ephemeral: true });
  } else if (interaction.customId === 'config_server_info') {
    config.serverName = interaction.fields.getTextInputValue('server_name');
    config.ownerUsername = interaction.fields.getTextInputValue('owner_username');
    config.joinCode = interaction.fields.getTextInputValue('join_code');
    const votes = Number.parseInt(interaction.fields.getTextInputValue('votes_required'), 10);
    config.votesRequired = Number.isNaN(votes) ? 5 : votes;
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    await interaction.reply({ content: 'Server information updated!', ephemeral: true });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId === 'goto_config') {
    await interaction.reply({ content: 'Use /config to update your settings at any time!', ephemeral: true });
  } else if (interaction.customId === 'rerun_setup') {
    await interaction.reply({ content: 'Re-running setup...', ephemeral: true });
    // Restart setup wizard
    const embed = new EmbedBuilder()
      .setTitle('Session Bot Setup: Step 1/4')
      .setDescription('Please upload your **Session Start Banner**, **Session Shutdown Banner**, and **Session Vote Banner** as image attachments in this thread.\n\nWhen you are done, click **Next** or **Skip** to proceed without uploading images.');
    const nextBtn = new ButtonBuilder()
      .setCustomId('setup_banners_next')
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary);
    const skipBtn = new ButtonBuilder()
      .setCustomId('setup_banners_skip')
      .setLabel('Skip')
      .setStyle(ButtonStyle.Secondary);
    const actionRow = new ActionRowBuilder().addComponents(nextBtn, skipBtn);
    await interaction.followUp({ embeds: [embed], components: [actionRow], ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN); 