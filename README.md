# Session Bot

A Discord bot for managing ER:LC sessions with banners, voting, and configuration.

## Features
- Session start/stop/vote commands
- Configurable banners and roles
- Voting with user tracking
- Setup and config wizards

## Setup
1. Clone the repo and run `npm install`.
2. Create a Discord bot and invite it to your server.
3. Copy your bot token to a `.env` file:
   ```
   DISCORD_TOKEN=your-bot-token-here
   CLIENT_ID=your-bot-client-id
   ```
4. Run the bot:
   ```
   npm start
   ```

## Commands
- `/setup` - Initial setup wizard
- `/config` - Update settings
- `/session start` - Start a session
- `/session stop` - Stop a session
- `/session vote` - Start a session vote

## Configuration
Settings are stored in `config.json` and can be updated via `/config` or `/setup`.

## Banners
You can upload images for session start, shutdown, and vote banners during setup/config. 