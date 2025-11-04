# Discord Crypto Exchange Bot

## Overview
A Discord bot that provides real-time cryptocurrency to fiat and fiat to cryptocurrency conversions using the CoinGecko API. Built with Discord.js and Node.js.

## Features
- **Real-time Conversions**: Convert between cryptocurrencies and fiat currencies
- **Price Checking**: Get current prices with 24h change and market cap
- **Exchange Ticket System**: Manage exchange requests through private ticket channels
- **Payment Options**: Support for PayPal (6%), Cash App, Zelle, Venmo, and Crypto payments
- **Stats Tracking**: Locked voice channel at top of server displaying total exchanged amount
- **User Leaderboard**: Top 10 users with most exchanged, updates hourly
- **Transaction History**: Automatic logging of all completed exchanges in dedicated "history" channel
- **Ticket Claiming**: Admins can claim tickets so other staff know who's handling each case
- **Slash Commands**: Modern Discord slash command interface
- **Multiple Currencies**: Support for major cryptocurrencies and fiat currencies

## Supported Cryptocurrencies
LTC, SOL, ETH, BTC, USDC, USDT, BNB, XRP, ADA, DOGE, MATIC, DOT, LINK, AVAX

### Network Selection for Stablecoins
When selecting **USDC** or **USDT**, users must choose a network:
- **ERC-20** (Ethereum)
- **TRC-20** (Tron)
- **BEP-20** (BSC - Binance Smart Chain)
- **Polygon** (MATIC)
- **Solana** (SPL)
- **Arbitrum**
- **Optimism**

## Supported Fiat Currencies
USD, EUR, GBP, JPY, CNY, CAD, AUD, CHF, INR, KRW

## Commands

### User Commands
- `/convert <amount> <from> <to>` - Convert between currencies
- `/price <crypto> [currency]` - Get current price of a cryptocurrency
- `/supported` - List all supported currencies

### Admin Commands (Require Administrator Permission)
- `/exchange-panel` or `/exchangepanel` - Post the exchange request panel with payment options
- `/close-ticket` - Close an exchange ticket channel without recording
- `/complete-ticket <amount> <from> <to>` - Mark ticket as completed and add amount to user's stats
  - Example: `/complete-ticket 100 PayPal Bitcoin`
  - `<amount>` - Amount exchanged in USD
  - `<from>` - Payment method user sent from (e.g., PayPal, Cash App, BTC)
  - `<to>` - Payment method user received (e.g., Bitcoin, PayPal, ETH)
- `/set-leaderboard` - Set the current channel as the leaderboard channel
- `/update-leaderboard` - Manually update the leaderboard now (also updates automatically every hour)
- `/message <text>` - Make the bot send a message

## Project Structure
```
├── index.js          # Main bot file with Discord.js client and commands
├── package.json      # Node.js dependencies
├── .gitignore        # Git ignore file
└── replit.md         # Project documentation
```

## Setup Instructions

### 1. Create Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" tab and click "Add Bot"
4. Under "Token", click "Reset Token" and copy the token
5. Enable "MESSAGE CONTENT INTENT" under Privileged Gateway Intents
6. Go to "OAuth2" > "General" and copy your "Application ID"

### 2. Configure Environment Variables
Add these secrets in the Replit Secrets tab (🔒 icon):
- `DISCORD_BOT_TOKEN`: Your bot token from step 1.4
- `DISCORD_APPLICATION_ID`: Your application ID from step 1.6

### 3. Invite Bot to Server
1. Go to "OAuth2" > "URL Generator" in Discord Developer Portal
2. Select scopes: `bot` and `applications.commands`
3. Select bot permissions: `Send Messages`, `Use Slash Commands`, `Create Private Threads`, `Manage Threads`
4. Copy the generated URL and open it in your browser
5. Select your server and authorize the bot

### 4. Run the Bot
Click the "Run" button in Replit. The bot will register commands and start listening.

## Using the Exchange Ticket System

### For Admins
1. Use `/exchange-panel` in a channel to post the exchange request panel
2. Users will see a select menu with payment options (PayPal 5-8%, Cash App, Zelle, Venmo, Crypto)
3. After selecting a payment method, users choose which crypto they want to receive
4. A private channel is created automatically in the "Tickets" category that only the user and admins can see
5. Click the "Claim Ticket" button to claim a ticket and let other admins know you're handling it
6. After completing the exchange, use `/complete-ticket <amount>` to record the amount and update stats
7. Or use `/close-ticket` to close without recording (for cancelled/invalid tickets)

### Stats Voice Channel
- A locked voice channel appears at the top of your server showing total exchanged amount
- Updates automatically when you use `/complete-ticket <amount>`
- Example: "💰 $150.00 Exchanged" means $150 total has been exchanged
- The channel is locked so users cannot join it - it's display-only
- ✅ **Persistent**: Stats are stored in the database and survive bot restarts!

### Leaderboard System
1. **Auto-Setup**: Bot automatically detects any channel with "leaderboard" in the name on startup
2. **Manual Setup**: Or use `/set-leaderboard` in your designated leaderboard channel
3. **How it works**: When you complete a ticket with `/complete-ticket <amount>`, the amount is added to that user's stats
4. **Auto-updates**: The leaderboard updates automatically every hour (you'll see "📊 Hourly leaderboard update completed" in logs)
5. **Manual update**: The leaderboard also updates immediately when you complete a ticket
6. **Display**: Shows top 10 users with 🥇🥈🥉 medals for top 3
7. ✅ **Persistent**: All user stats are stored in the database and survive bot restarts!

### For Users
1. Click the "Select Option" dropdown in the exchange panel
2. Choose your preferred payment method (PayPal, Cash App, Zelle, Venmo, Apple Pay, Bank Transfer, or Crypto)
3. Choose which cryptocurrency you want to receive (LTC, SOL, ETH, BTC, USDC, USDT, etc.)
4. **If you selected USDC or USDT:** Choose the network you want to receive on (ERC-20, TRC-20, BEP-20, Polygon, Solana, Arbitrum, or Optimism)
5. Enter the amount you're sending in the popup modal
6. Review the confirmation showing:
   - Amount you're sending
   - Fee amount (calculated from the percentage)
   - Amount you'll receive (sending amount minus fee)
7. Click "Confirm Exchange" to create your ticket
8. A private ticket channel will be created with all your exchange details (including network if applicable)
9. Provide your payment/wallet details as instructed
10. Wait for staff assistance
11. You can have up to 3 tickets open at the same time

### Payment Options
Updated fee structure:
- **PayPal**: 5-8% fee (minimum $5.00)
- **Cash App**: 5% fee (minimum $5.00)
- **Zelle**: 5% fee (minimum $5.00)
- **Venmo**: 5% fee (minimum $5.00)
- **Apple Pay**: 5% fee (minimum $5.00)
- **Bank Transfer**: 5% fee (minimum $5.00)
- **Cryptocurrency**: 5% fee (minimum $5.00)

**Note:** The minimum service fee of $5.00 USD is applied to all exchanges, even if the percentage fee is lower. For PayPal, the fee is 8% (the maximum in the 5-8% range).

## Recent Changes
- 2025-10-28: Initial project setup with Discord.js integration
- 2025-10-28: Added CoinGecko API integration for real-time prices
- 2025-10-28: Implemented /convert, /price, and /supported commands
- 2025-10-28: Added exchange ticket system with private channels
- 2025-10-28: Implemented /exchange-panel and /close-ticket admin commands
- 2025-10-28: Added PayPal 6% and other payment method options
- 2025-10-28: Updated ticket system with two-step selection (payment method → crypto)
- 2025-10-28: Changed from threads to private channels visible only to user and all admins
- 2025-10-28: Fixed admin permissions to grant access to all administrator roles
- 2025-10-28: Added "Tickets" category to organize all ticket channels
- 2025-10-28: Added "Claim Ticket" button for admins to claim and manage tickets
- 2025-10-28: Added locked stats voice channel at top displaying total exchanged amount
- 2025-10-28: Implemented /complete-ticket command to record completed exchanges and update stats
- 2025-10-28: Added user stats tracking - amounts are added to individual user totals
- 2025-10-28: Implemented leaderboard system showing top 10 users with most exchanged
- 2025-10-28: Added /set-leaderboard command to designate leaderboard channel
- 2025-10-28: Configured hourly auto-updates for leaderboard
- 2025-10-28: Added HTTP server for Autoscale deployment compatibility
- 2025-10-29: Fixed "Unknown interaction" timeout error by deferring reply immediately
- 2025-10-29: Added /message command for admins to make the bot send messages
- 2025-10-29: Updated ticket system to allow up to 3 tickets per user simultaneously
- 2025-10-29: Updated all payment methods to unified fee structure: 6% fee with a $5 min
- 2025-10-29: Added amount input modal after users select payment and crypto methods
- 2025-10-29: Implemented fee calculation and confirmation screen before ticket creation
- 2025-10-29: Confirmation shows: sending amount, fee amount, and receiving amount
- 2025-10-29: Added /exchangepanel command as alternative to /exchange-panel
- 2025-10-29: Changed minimum service fee from $7.00 to $5.00 USD
- 2025-10-29: Fee calculation now enforces $5.00 minimum (whichever is higher: percentage or minimum)
- 2025-10-29: Added /update-leaderboard command to manually trigger leaderboard updates
- 2025-10-29: Confirmed hourly auto-update for leaderboard is still active (every 3600000ms)
- 2025-10-29: Updated /complete-ticket to require from/to payment methods: `/complete-ticket <amount> <from> <to>`
- 2025-10-29: Added comprehensive debugging logs to track ticket completion, stats updates, and leaderboard updates
- 2025-10-29: Fixed /close-ticket validation to check channel name pattern instead of memory (works after bot restarts)
- 2025-10-29: Added duplicate interaction prevention to avoid "Interaction already acknowledged" errors
- 2025-10-29: Created automatic "history" channel that logs all completed transactions with exchange details
- 2025-10-29: **MAJOR UPDATE**: Implemented PostgreSQL database for persistent data storage
  - User stats now persist across bot restarts
  - Total exchanged amount is permanently stored in database
  - Leaderboard data survives bot crashes/restarts
  - No more data loss on bot restart! 🎉
- 2025-10-29: **PERSISTENCE FIX**: Channel IDs now stored in database to prevent data loss on restart
  - Added `bot_config` table to store channel IDs persistently
  - Stats voice channel, leaderboard channel, and history channel IDs all saved in database
  - Bot automatically detects existing "leaderboard" channel on startup
  - Hourly leaderboard updates verified working (logs every hour with "📊 Hourly leaderboard update completed")
  - Stats voice channel now correctly displays actual database total on startup
  - All channel settings survive bot restarts! 🎉
- 2025-10-29: **CRYPTO ORDERING**: Reordered crypto selection list - LTC, SOL, ETH, BTC now at top
- 2025-10-29: **NETWORK SELECTION**: Added network selection for USDC and USDT
  - When users select USDC or USDT, they now choose a network (ERC-20, TRC-20, BEP-20, Polygon, Solana, Arbitrum, Optimism)
  - Network information is displayed in the ticket embed
  - Users are reminded to use the correct network in ticket instructions
- 2025-10-31: **NEW PAYMENT METHODS**: Added Apple Pay and Bank Transfer as payment options
- 2025-10-31: **FEE STRUCTURE UPDATE**: Changed all fees from 6% to 5%, except PayPal which is now 5-8% (calculated as 8%)

## Technical Details
- **API**: CoinGecko API v3 (no API key required)
- **Rate Limiting**: CoinGecko free tier allows 10-30 requests/minute
- **Database**: PostgreSQL (Neon) for persistent storage of user stats and total exchanged amounts
  - Tables: 
    - `user_stats` (user_id, total_exchanged) - Individual user exchange totals
    - `global_stats` (id, total_exchanged) - Total exchanged amount across all users
    - `bot_config` (key, value) - Channel IDs and bot configuration settings
  - All exchange data and channel settings persist across bot restarts
- **Package**: pg (PostgreSQL client for Node.js)
- **Data Source**: Real-time cryptocurrency market data
- **Auto-Detection**: Bot automatically finds and configures existing channels on startup
- **Hourly Updates**: Leaderboard updates every 3600000ms (1 hour) automatically
