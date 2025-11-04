const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js")
const axios = require("axios")
const express = require("express")
const { Pool } = require("pg")

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Initialize database tables
async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_stats (
        user_id TEXT PRIMARY KEY,
        total_exchanged DECIMAL(10, 2) DEFAULT 0
      )
    `)

    await pool.query(`
      CREATE TABLE IF NOT EXISTS global_stats (
        id INTEGER PRIMARY KEY DEFAULT 1,
        total_exchanged DECIMAL(10, 2) DEFAULT 0,
        CHECK (id = 1)
      )
    `)

    // Store channel IDs in database for persistence
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bot_config (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `)

    // Initialize global stats if not exists
    await pool.query(`
      INSERT INTO global_stats (id, total_exchanged)
      VALUES (1, 0)
      ON CONFLICT (id) DO NOTHING
    `)

    console.log("✅ Database tables initialized")
  } catch (error) {
    console.error("❌ Database initialization error:", error)
  }
}

// Database helper functions
async function getUserStats(userId) {
  const result = await pool.query("SELECT total_exchanged FROM user_stats WHERE user_id = $1", [userId])
  return result.rows[0]?.total_exchanged || 0
}

async function updateUserStats(userId, amount) {
  await pool.query(
    `
    INSERT INTO user_stats (user_id, total_exchanged)
    VALUES ($1, $2)
    ON CONFLICT (user_id) 
    DO UPDATE SET total_exchanged = user_stats.total_exchanged + $2
  `,
    [userId, amount],
  )
}

async function getAllUserStats() {
  const result = await pool.query("SELECT user_id, total_exchanged FROM user_stats ORDER BY total_exchanged DESC")
  return result.rows
}

async function getTotalExchanged() {
  const result = await pool.query("SELECT total_exchanged FROM global_stats WHERE id = 1")
  return Number.parseFloat(result.rows[0]?.total_exchanged || 0)
}

async function updateTotalExchanged(amount) {
  await pool.query("UPDATE global_stats SET total_exchanged = total_exchanged + $1 WHERE id = 1", [amount])
}

// Save and load channel IDs from database
async function saveChannelId(key, channelId) {
  await pool.query(
    `
    INSERT INTO bot_config (key, value)
    VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = $2
  `,
    [key, channelId],
  )
}

async function getChannelId(key) {
  const result = await pool.query("SELECT value FROM bot_config WHERE key = $1", [key])
  return result.rows[0]?.value || null
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
})

const COINGECKO_API = "https://api.coingecko.com/api/v3"

const CRYPTO_IDS = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  usdt: "tether",
  tether: "tether",
  bnb: "binancecoin",
  binancecoin: "binancecoin",
  sol: "solana",
  solana: "solana",
  xrp: "ripple",
  ripple: "ripple",
  usdc: "usd-coin",
  "usd-coin": "usd-coin",
  ada: "cardano",
  cardano: "cardano",
  doge: "dogecoin",
  dogecoin: "dogecoin",
  matic: "matic-network",
  polygon: "matic-network",
  dot: "polkadot",
  polkadot: "polkadot",
  link: "chainlink",
  chainlink: "chainlink",
  avax: "avalanche-2",
  avalanche: "avalanche-2",
  ltc: "litecoin",
  litecoin: "litecoin",
}

const FIAT_CURRENCIES = ["usd", "eur", "gbp", "jpy", "cny", "cad", "aud", "chf", "inr", "krw"]

// Track processed interactions to prevent duplicates
const processedInteractions = new Set()

const CRYPTO_OPTIONS = [
  { id: "ltc", label: "Litecoin (LTC)", description: "Receive Litecoin" },
  { id: "sol", label: "Solana (SOL)", description: "Receive Solana" },
  { id: "eth", label: "Ethereum (ETH)", description: "Receive Ethereum" },
  { id: "btc", label: "Bitcoin (BTC)", description: "Receive Bitcoin" },
  { id: "usdc", label: "USD Coin (USDC)", description: "Receive USDC - Choose Network" },
  { id: "usdt", label: "Tether (USDT)", description: "Receive USDT - Choose Network" },
  { id: "bnb", label: "BNB", description: "Receive Binance Coin" },
  { id: "xrp", label: "Ripple (XRP)", description: "Receive XRP" },
  { id: "ada", label: "Cardano (ADA)", description: "Receive Cardano" },
  { id: "doge", label: "Dogecoin (DOGE)", description: "Receive Dogecoin" },
  { id: "matic", label: "Polygon (MATIC)", description: "Receive Polygon" },
  { id: "dot", label: "Polkadot (DOT)", description: "Receive Polkadot" },
  { id: "link", label: "Chainlink (LINK)", description: "Receive Chainlink" },
  { id: "avax", label: "Avalanche (AVAX)", description: "Receive Avalanche" },
]

const NETWORK_OPTIONS = [
  { id: "erc20", label: "ERC-20 (Ethereum)", description: "Ethereum Network" },
  { id: "trc20", label: "TRC-20 (Tron)", description: "Tron Network" },
  { id: "bep20", label: "BEP-20 (BSC)", description: "Binance Smart Chain" },
  { id: "polygon", label: "Polygon (MATIC)", description: "Polygon Network" },
  { id: "solana", label: "Solana (SPL)", description: "Solana Network" },
  { id: "arbitrum", label: "Arbitrum", description: "Arbitrum Network" },
  { id: "optimism", label: "Optimism", description: "Optimism Network" },
]

const EXCHANGE_OPTIONS = [
  {
    id: "paypal",
    label: "PayPal",
    description: "5-8% fee",
    feeInfo: "5-8% fee",
  },
  {
    id: "cashapp",
    label: "Cash App",
    description: "5% fee",
    feeInfo: "5% fee",
  },
  {
    id: "zelle",
    label: "Zelle",
    description: "5% fee",
    feeInfo: "5% fee",
  },
  {
    id: "venmo",
    label: "Venmo",
    description: "5% fee",
    feeInfo: "5% fee",
  },
  {
    id: "applepay",
    label: "Apple Pay",
    description: "5% fee",
    feeInfo: "5% fee",
  },
  {
    id: "banktransfer",
    label: "Bank Transfer",
    description: "5% fee",
    feeInfo: "5% fee",
  },
  {
    id: "crypto",
    label: "Cryptocurrency",
    description: "5% fee",
    feeInfo: "5% fee",
  },
]

const CRYPTO_RECEIVE_OPTIONS = [
  {
    id: "paypal_receive",
    label: "PayPal",
    description: "5-8% fee",
    feeInfo: "5-8% fee",
  },
  {
    id: "cashapp_receive",
    label: "Cash App",
    description: "5% fee",
    feeInfo: "5% fee",
  },
  {
    id: "zelle_receive",
    label: "Zelle",
    description: "5% fee",
    feeInfo: "5% fee",
  },
  {
    id: "venmo_receive",
    label: "Venmo",
    description: "5% fee",
    feeInfo: "5% fee",
  },
  {
    id: "applepay_receive",
    label: "Apple Pay",
    description: "5% fee",
    feeInfo: "5% fee",
  },
  {
    id: "banktransfer_receive",
    label: "Bank Transfer",
    description: "5% fee",
    feeInfo: "5% fee",
  },
]

const activeTickets = new Map()
const pendingSelections = new Map()
const userStats = new Map()
const totalExchanged = 0
let statsChannelId = null
let leaderboardChannelId = null
let leaderboardMessageId = null
let historyChannelId = null

async function getCryptoPrice(cryptoId, vsCurrency) {
  try {
    const response = await axios.get(`${COINGECKO_API}/simple/price`, {
      params: {
        ids: cryptoId,
        vs_currencies: vsCurrency,
        include_24hr_change: true,
        include_market_cap: true,
      },
    })
    return response.data[cryptoId]
  } catch (error) {
    console.error("Error fetching crypto price:", error.message)
    return null
  }
}

function formatCurrency(amount, currency) {
  const currencyCode = currency.toUpperCase()

  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits: currencyCode === "JPY" || currencyCode === "KRW" ? 0 : 2,
      maximumFractionDigits: currencyCode === "JPY" || currencyCode === "KRW" ? 0 : 2,
    })
    return formatter.format(amount)
  } catch (error) {
    return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode}`
  }
}

function formatCrypto(amount, crypto) {
  return `${amount.toLocaleString("en-US", { maximumFractionDigits: 8 })} ${crypto.toUpperCase()}`
}

const commands = [
  {
    name: "convert",
    description: "Convert between crypto and fiat currencies",
    options: [
      {
        name: "amount",
        type: 10,
        description: "Amount to convert",
        required: true,
      },
      {
        name: "from",
        type: 3,
        description: "Currency to convert from (e.g., BTC, USD, ETH)",
        required: true,
      },
      {
        name: "to",
        type: 3,
        description: "Currency to convert to (e.g., USD, EUR, BTC)",
        required: true,
      },
    ],
  },
  {
    name: "price",
    description: "Get current price of a cryptocurrency",
    options: [
      {
        name: "crypto",
        type: 3,
        description: "Cryptocurrency symbol (e.g., BTC, ETH, SOL)",
        required: true,
      },
      {
        name: "currency",
        type: 3,
        description: "Fiat currency (default: USD)",
        required: false,
      },
    ],
  },
  {
    name: "supported",
    description: "List all supported cryptocurrencies and fiat currencies",
  },
  {
    name: "exchange-panel",
    description: "Post the exchange request panel (Admin only)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  },
  {
    name: "exchangepanel",
    description: "Post the UPDATED exchange request panel (Admin only)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  },
  {
    name: "yespanelok",
    description: "Post the exchange panel with all updates (Admin only)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  },
  {
    name: "newwexc",
    description: "Post the WORKING exchange panel (Admin only)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  },
  {
    name: "close-ticket",
    description: "Close an exchange ticket channel (Admin only)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  },
  {
    name: "complete-ticket",
    description: "Mark ticket as completed and add amount to total exchanged (Admin only)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        name: "amount",
        type: 10,
        description: "Amount exchanged in USD (e.g., 10.50)",
        required: true,
      },
      {
        name: "from",
        type: 3,
        description: "Payment method user sent from (e.g., PayPal, Cash App, BTC)",
        required: true,
      },
      {
        name: "to",
        type: 3,
        description: "Payment method user received (e.g., Bitcoin, PayPal, ETH)",
        required: true,
      },
    ],
  },
  {
    name: "give",
    description: "Add amount to user stats (Admin only)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        name: "user",
        type: 6,
        description: "User to add stats for",
        required: true,
      },
      {
        name: "amount",
        type: 10,
        description: "Amount to add to this user",
        required: true,
      },
    ],
  },
  {
    name: "remove",
    description: "Remove amount from user stats (Admin only)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        name: "user",
        type: 6,
        description: "User to remove stats from",
        required: true,
      },
      {
        name: "amount",
        type: 10,
        description: "Amount to remove from this user",
        required: true,
      },
    ],
  },
  {
    name: "set-leaderboard",
    description: "Set the current channel as the leaderboard channel (Admin only)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  },
  {
    name: "message",
    description: "Make the bot send a message (Admin only)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        name: "text",
        type: 3,
        description: "The message content",
        required: true,
      },
    ],
  },
  {
    name: "update-leaderboard",
    description: "Manually update the leaderboard now (Admin only)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  },
]

client.once("ready", async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`)

  // Initialize database
  await initializeDatabase()

  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN)

  try {
    console.log("🔄 Clearing old commands and registering slash commands...")
    const guildId = "1328732668023537686"

    // Clear global commands
    await rest.put(Routes.applicationCommands(process.env.DISCORD_APPLICATION_ID), { body: [] })

    // Clear and re-register guild commands
    await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_APPLICATION_ID, guildId), { body: commands })
    console.log(`✅ Slash commands registered successfully to server ${guildId}!`)
  } catch (error) {
    console.error("Error registering commands:", error)
  }

  try {
    const guild = client.guilds.cache.get("1328732668023537686")
    if (guild) {
      // Load channel IDs from database
      statsChannelId = await getChannelId("statsChannelId")
      leaderboardChannelId = await getChannelId("leaderboardChannelId")
      historyChannelId = await getChannelId("historyChannelId")
      leaderboardMessageId = await getChannelId("leaderboardMessageId")

      console.log(
        `📂 Loaded from database: stats=${statsChannelId}, leaderboard=${leaderboardChannelId}, history=${historyChannelId}`,
      )

      // Auto-detect leaderboard channel if not set
      if (!leaderboardChannelId) {
        const leaderboardChannel = guild.channels.cache.find(
          (channel) => channel.type === ChannelType.GuildText && channel.name.toLowerCase().includes("leaderboard"),
        )
        if (leaderboardChannel) {
          leaderboardChannelId = leaderboardChannel.id
          await saveChannelId("leaderboardChannelId", leaderboardChannelId)
          console.log(`✅ Auto-detected leaderboard channel: ${leaderboardChannel.name}`)
        }
      }

      // Find or create stats voice channel
      let statsChannel = statsChannelId ? guild.channels.cache.get(statsChannelId) : null

      if (!statsChannel) {
        statsChannel = guild.channels.cache.find(
          (channel) => channel.type === ChannelType.GuildVoice && channel.name.includes("Exchanged"),
        )
      }

      if (!statsChannel) {
        const currentTotal = await getTotalExchanged()
        statsChannel = await guild.channels.create({
          name: `💰 $${currentTotal.toFixed(2)} Exchanged`,
          type: ChannelType.GuildVoice,
          position: 0,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.Connect],
            },
          ],
        })
        console.log("✅ Created stats voice channel")
      }

      statsChannelId = statsChannel.id
      await saveChannelId("statsChannelId", statsChannelId)
      await updateStatsChannel(guild)

      // Find or create history channel
      let historyChannel = historyChannelId ? guild.channels.cache.get(historyChannelId) : null

      if (!historyChannel) {
        historyChannel = guild.channels.cache.find(
          (channel) => channel.type === ChannelType.GuildText && channel.name === "history",
        )
      }

      if (!historyChannel) {
        historyChannel = await guild.channels.create({
          name: "history",
          type: ChannelType.GuildText,
          topic: "Exchange transaction history",
        })
        console.log("✅ Created history text channel")
      }

      historyChannelId = historyChannel.id
      await saveChannelId("historyChannelId", historyChannelId)

      console.log(
        `✅ Channel IDs saved: stats=${statsChannelId}, leaderboard=${leaderboardChannelId}, history=${historyChannelId}`,
      )

      // Update leaderboard on startup
      if (leaderboardChannelId) {
        await updateLeaderboard(guild)
        console.log("📊 Initial leaderboard update completed")
      }
    }
  } catch (error) {
    console.error("Error setting up channels:", error)
  }

  // Hourly leaderboard update
  setInterval(async () => {
    try {
      const guild = client.guilds.cache.get("1328732668023537686")
      if (guild && leaderboardChannelId) {
        await updateLeaderboard(guild)
        console.log("📊 Hourly leaderboard update completed")
      } else {
        console.log("⚠️ Leaderboard channel not set - skipping hourly update")
      }
    } catch (error) {
      console.error("Error updating leaderboard:", error)
    }
  }, 3600000) // Every hour
})

client.on("interactionCreate", async (interaction) => {
  try {
    // CRITICAL: Defer complete-ticket and close-ticket IMMEDIATELY (within 3 seconds)
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction
      if (commandName === "close-ticket" || commandName === "complete-ticket") {
        try {
          await interaction.deferReply()
          console.log(`✅ Deferred ${commandName} in channel: ${interaction.channel.name}`)
        } catch (err) {
          console.error(`❌ Failed to defer ${commandName}:`, err.message)
          return
        }
      }
    }

    // Prevent duplicate interaction handling
    if (processedInteractions.has(interaction.id)) {
      console.log(`⚠️ Skipping duplicate interaction: ${interaction.id}`)
      return
    }
    processedInteractions.add(interaction.id)

    // Clean up old interactions after 5 minutes
    setTimeout(() => {
      processedInteractions.delete(interaction.id)
    }, 300000)

    if (interaction.isButton()) {
      if (interaction.customId === "claim_ticket") {
        await handleClaimTicket(interaction)
      } else if (interaction.customId === "confirm_exchange") {
        await handleConfirmExchange(interaction)
      }
      return
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === "amount_modal" || interaction.customId === "amount_modal_crypto") {
        await handleAmountModal(interaction)
      }
      return
    }

    if (interaction.isStringSelectMenu()) {
      if (
        interaction.customId === "exchange_select_v4" ||
        interaction.customId === "exchange_select_v3" ||
        interaction.customId === "exchange_select" ||
        interaction.customId === "exchange_select_v2"
      ) {
        await handleExchangeSelection(interaction)
      } else if (
        interaction.customId === "crypto_select_v4" ||
        interaction.customId === "crypto_select_v3" ||
        interaction.customId === "crypto_select" ||
        interaction.customId === "crypto_select_v2"
      ) {
        await handleCryptoSelection(interaction)
      } else if (
        interaction.customId === "crypto_send_select_v4" ||
        interaction.customId === "crypto_send_select_v3" ||
        interaction.customId === "crypto_send_select" ||
        interaction.customId === "crypto_send_select_v2"
      ) {
        await handleCryptoSendSelection(interaction)
      } else if (
        interaction.customId === "crypto_receive_select_v4" ||
        interaction.customId === "crypto_receive_select_v3" ||
        interaction.customId === "crypto_receive_select" ||
        interaction.customId === "crypto_receive_select_v2"
      ) {
        await handleCryptoReceiveSelection(interaction)
      } else if (
        interaction.customId === "network_select_v4" ||
        interaction.customId === "network_select_v3" ||
        interaction.customId === "network_select" ||
        interaction.customId === "network_select_v2"
      ) {
        await handleNetworkSelection(interaction)
      } else if (
        interaction.customId === "network_send_select_v4" ||
        interaction.customId === "network_send_select_v3" ||
        interaction.customId === "network_send_select" ||
        interaction.customId === "network_send_select_v2"
      ) {
        await handleNetworkSendSelection(interaction)
      }
      return
    }

    if (!interaction.isChatInputCommand()) return

    const { commandName } = interaction

    if (commandName === "exchange-panel") {
      await handleExchangePanel(interaction)
      return
    }

    if (commandName === "exchangepanel") {
      await handleExchangePanel(interaction)
      return
    }

    if (commandName === "yespanelok") {
      await handleExchangePanel(interaction)
      return
    }

    if (commandName === "newwexc") {
      await handleNewExchangePanel(interaction)
      return
    }

    if (commandName === "close-ticket") {
      await handleCloseTicket(interaction)
      return
    }

    if (commandName === "complete-ticket") {
      await handleCompleteTicket(interaction)
      return
    }

    if (commandName === "give") {
      await interaction.deferReply({ ephemeral: true })
      const user = interaction.options.getUser("user")
      const amount = interaction.options.getNumber("amount")

      if (amount <= 0) {
        return interaction.editReply({ content: "❌ Amount must be greater than 0." })
      }

      const currentStats = await getUserStats(user.id)
      await updateUserStats(user.id, amount)
      const newStats = await getUserStats(user.id)

      await updateLeaderboard(interaction.guild)

      // Send update message to leaderboard channel
      if (leaderboardChannelId) {
        const leaderboardChannel = interaction.guild.channels.cache.get(leaderboardChannelId)
        if (leaderboardChannel) {
          const updateEmbed = new EmbedBuilder()
            .setTitle("📈 Stats Updated")
            .setDescription(
              `${interaction.user} gave **$${amount.toFixed(2)}** to ${user}\n\n` +
                `**Previous:** $${Number.parseFloat(currentStats).toFixed(2)}\n` +
                `**New Total:** $${Number.parseFloat(newStats).toFixed(2)}\n` +
                `**Change:** +$${amount.toFixed(2)}`,
            )
            .setColor("#57F287")
            .setTimestamp()

          await leaderboardChannel.send({ embeds: [updateEmbed] })
        }
      }

      await interaction.editReply({
        content:
          `✅ Added $${amount.toFixed(2)} to ${user.username}'s stats!\n` +
          `Previous: $${Number.parseFloat(currentStats).toFixed(2)} → New: $${Number.parseFloat(newStats).toFixed(2)}`,
      })
      return
    }

    if (commandName === "remove") {
      await interaction.deferReply({ ephemeral: true })
      const user = interaction.options.getUser("user")
      const amount = interaction.options.getNumber("amount")

      if (amount <= 0) {
        return interaction.editReply({ content: "❌ Amount must be greater than 0." })
      }

      const currentStats = await getUserStats(user.id)
      const newAmount = Math.max(0, Number.parseFloat(currentStats) - amount)

      await pool.query(
        `INSERT INTO user_stats (user_id, total_exchanged)
         VALUES ($1, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET total_exchanged = $2`,
        [user.id, newAmount],
      )

      await updateLeaderboard(interaction.guild)

      // Send update message to leaderboard channel
      if (leaderboardChannelId) {
        const leaderboardChannel = interaction.guild.channels.cache.get(leaderboardChannelId)
        if (leaderboardChannel) {
          const updateEmbed = new EmbedBuilder()
            .setTitle("📉 Stats Updated")
            .setDescription(
              `${interaction.user} removed **$${amount.toFixed(2)}** from ${user}\n\n` +
                `**Previous:** $${Number.parseFloat(currentStats).toFixed(2)}\n` +
                `**New Total:** $${newAmount.toFixed(2)}\n` +
                `**Change:** -$${amount.toFixed(2)}`,
            )
            .setColor("#ED4245")
            .setTimestamp()

          await leaderboardChannel.send({ embeds: [updateEmbed] })
        }
      }

      await interaction.editReply({
        content:
          `✅ Removed $${amount.toFixed(2)} from ${user.username}'s stats!\n` +
          `Previous: $${Number.parseFloat(currentStats).toFixed(2)} → New: $${newAmount.toFixed(2)}`,
      })
      return
    }

    if (commandName === "set-leaderboard") {
      await handleSetLeaderboard(interaction)
      return
    }

    if (commandName === "message") {
      await handleMessage(interaction)
      return
    }

    if (commandName === "update-leaderboard") {
      await handleUpdateLeaderboard(interaction)
      return
    }

    if (commandName === "convert") {
      await interaction.deferReply()

      const amount = interaction.options.getNumber("amount")
      const from = interaction.options.getString("from").toLowerCase()
      const to = interaction.options.getString("to").toLowerCase()

      const fromIsCrypto = CRYPTO_IDS[from] !== undefined
      const toIsCrypto = CRYPTO_IDS[to] !== undefined
      const fromIsFiat = FIAT_CURRENCIES.includes(from)
      const toIsFiat = FIAT_CURRENCIES.includes(to)

      if (!fromIsCrypto && !fromIsFiat) {
        return interaction.editReply(`❌ Invalid source currency: ${from}. Use /supported to see available currencies.`)
      }

      if (!toIsCrypto && !toIsFiat) {
        return interaction.editReply(`❌ Invalid target currency: ${to}. Use /supported to see available currencies.`)
      }

      if (fromIsCrypto && toIsCrypto) {
        const fromPrice = await getCryptoPrice(CRYPTO_IDS[from], "usd")
        const toPrice = await getCryptoPrice(CRYPTO_IDS[to], "usd")

        if (!fromPrice || !toPrice) {
          return interaction.editReply("❌ Error fetching crypto prices. Please try again later.")
        }

        const fromUsdValue = fromPrice.usd
        const toUsdValue = toPrice.usd
        const result = (amount * fromUsdValue) / toUsdValue

        return interaction.editReply(
          `💱 **Conversion Result**\n` +
            `${formatCrypto(amount, from)} = ${formatCrypto(result, to)}\n\n` +
            `📊 Exchange Rate: 1 ${from.toUpperCase()} = ${formatCrypto(fromUsdValue / toUsdValue, to)}`,
        )
      }

      if (fromIsCrypto && toIsFiat) {
        const priceData = await getCryptoPrice(CRYPTO_IDS[from], to)

        if (!priceData || !priceData[to]) {
          return interaction.editReply("❌ Error fetching price data. Please try again later.")
        }

        const result = amount * priceData[to]
        const change24h = priceData[`${to}_24h_change`] || 0

        return interaction.editReply(
          `💱 **Conversion Result**\n` +
            `${formatCrypto(amount, from)} = ${formatCurrency(result, to)}\n\n` +
            `📊 Current Rate: 1 ${from.toUpperCase()} = ${formatCurrency(priceData[to], to)}\n` +
            `📈 24h Change: ${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`,
        )
      }

      if (fromIsFiat && toIsCrypto) {
        const priceData = await getCryptoPrice(CRYPTO_IDS[to], from)

        if (!priceData || !priceData[from]) {
          return interaction.editReply("❌ Error fetching price data. Please try again later.")
        }

        const result = amount / priceData[from]
        const change24h = priceData[`${from}_24h_change`] || 0

        return interaction.editReply(
          `💱 **Conversion Result**\n` +
            `${formatCurrency(amount, from)} = ${formatCrypto(result, to)}\n\n` +
            `📊 Current Rate: ${formatCurrency(priceData[from], from)} = 1 ${to.toUpperCase()}\n` +
            `📈 24h Change: ${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%`,
        )
      }

      if (fromIsFiat && toIsFiat) {
        return interaction.editReply("❌ Fiat-to-fiat conversion is not supported. Please use a crypto intermediary.")
      }
    }

    if (commandName === "price") {
      await interaction.deferReply()

      const crypto = interaction.options.getString("crypto").toLowerCase()
      const currency = (interaction.options.getString("currency") || "usd").toLowerCase()

      if (!CRYPTO_IDS[crypto]) {
        return interaction.editReply(
          `❌ Invalid cryptocurrency: ${crypto}. Use /supported to see available cryptocurrencies.`,
        )
      }

      if (!FIAT_CURRENCIES.includes(currency)) {
        return interaction.editReply(
          `❌ Invalid fiat currency: ${currency}. Use /supported to see available currencies.`,
        )
      }

      const priceData = await getCryptoPrice(CRYPTO_IDS[crypto], currency)

      if (!priceData) {
        return interaction.editReply("❌ Error fetching price data. Please try again later.")
      }

      const price = priceData[currency]
      const change24h = priceData[`${currency}_24h_change`] || 0
      const marketCap = priceData[`${currency}_market_cap`] || 0

      const changeEmoji = change24h >= 0 ? "📈" : "📉"

      return interaction.editReply(
        `💰 **${crypto.toUpperCase()} Price**\n\n` +
          `💵 Price: ${formatCurrency(price, currency)}\n` +
          `${changeEmoji} 24h Change: ${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}%\n` +
          `📊 Market Cap: ${formatCurrency(marketCap, currency)}`,
      )
    }

    if (commandName === "supported") {
      const cryptoList = Object.keys(CRYPTO_IDS)
        .filter((key) => key.length <= 5)
        .map((c) => c.toUpperCase())
        .join(", ")

      const fiatList = FIAT_CURRENCIES.map((f) => f.toUpperCase()).join(", ")

      return interaction.reply(
        `📋 **Supported Currencies**\n\n` +
          `**Cryptocurrencies:**\n${cryptoList}\n\n` +
          `**Fiat Currencies:**\n${fiatList}\n\n` +
          `💡 Tip: You can use full names or abbreviations (e.g., BTC or Bitcoin)`,
      )
    }
  } catch (error) {
    console.error("Error handling interaction:", error)

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "❌ An error occurred while processing your request.", ephemeral: true })
      } else {
        await interaction.reply({ content: "❌ An error occurred while processing your request.", ephemeral: true })
      }
    } catch (followUpError) {
      console.error("Error sending error message:", followUpError)
    }
  }
})

async function handleExchangePanel(interaction) {
  try {
    const embed = new EmbedBuilder()
      .setTitle("Request an Exchange")
      .setDescription(
        "You can request an exchange by selecting the appropriate option below for the payment type you'll be sending with. Follow the instructions and fill out the fields as requested.\n\n" +
          "**● Reminder**\n\n" +
          "Please read our # terms-of-service before creating an Exchange.\n\n" +
          "**● Minimum Fees**\n\n" +
          "Our minimum service fee is $5.00 USD and is applicable on every deal and is non-negotiable.",
      )
      .setColor("#5865F2")

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("exchange_select_v3")
      .setPlaceholder("Select Option")
      .addOptions(
        EXCHANGE_OPTIONS.map((option) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(option.label)
            .setDescription(option.description)
            .setValue(option.id),
        ),
      )

    const row = new ActionRowBuilder().addComponents(selectMenu)

    await interaction.reply({
      embeds: [embed],
      components: [row],
    })
  } catch (error) {
    console.error("Error in handleExchangePanel:", error)
    await interaction
      .reply({ content: "❌ Failed to create exchange panel. Please try again.", ephemeral: true })
      .catch(() => {})
  }
}

async function handleNewExchangePanel(interaction) {
  try {
    const embed = new EmbedBuilder()
      .setTitle("Request an Exchange")
      .setDescription(
        "You can request an exchange by selecting the appropriate option below for the payment type you'll be sending with. Follow the instructions and fill out the fields as requested.\n\n" +
          "**● Reminder**\n\n" +
          "Please read our # terms-of-service before creating an Exchange.\n\n" +
          "**● Minimum Fees**\n\n" +
          "Our minimum service fee is $5.00 USD and is applicable on every deal and is non-negotiable.",
      )
      .setColor("#5865F2")

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId("exchange_select_v4")
      .setPlaceholder("Select Option")
      .addOptions(
        EXCHANGE_OPTIONS.map((option) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(option.label)
            .setDescription(option.description)
            .setValue(option.id),
        ),
      )

    const row = new ActionRowBuilder().addComponents(selectMenu)

    await interaction.reply({
      embeds: [embed],
      components: [row],
    })
  } catch (error) {
    console.error("Error in handleNewExchangePanel:", error)
    await interaction
      .reply({ content: "❌ Failed to create exchange panel. Please try again.", ephemeral: true })
      .catch(() => {})
  }
}

async function handleExchangeSelection(interaction) {
  await interaction.deferReply({ ephemeral: true })

  const selectedOption = EXCHANGE_OPTIONS.find((opt) => opt.id === interaction.values[0])

  if (!selectedOption) {
    return interaction.editReply({ content: "❌ Invalid option selected." })
  }

  // Prune deleted channels from activeTickets
  let userTickets = activeTickets.get(interaction.user.id) || []
  const validTickets = []

  for (const ticket of userTickets) {
    const channel = await interaction.guild.channels.fetch(ticket.channelId).catch(() => null)
    if (channel) {
      validTickets.push(ticket)
    }
  }

  if (validTickets.length !== userTickets.length) {
    console.log(
      `🧹 Pruned ${userTickets.length - validTickets.length} deleted channel(s) for user ${interaction.user.id}`,
    )
    activeTickets.set(interaction.user.id, validTickets)
    userTickets = validTickets
  }

  if (userTickets.length >= 3) {
    return interaction.editReply({
      content: "❌ You already have 3 active exchange tickets. Please complete or close one of your tickets first.",
    })
  }

  pendingSelections.set(interaction.user.id, {
    paymentMethod: selectedOption.id,
    paymentMethodLabel: selectedOption.label,
    feeInfo: selectedOption.feeInfo,
  })

  // If user selected Cryptocurrency as sending method, ask which crypto they're sending
  if (selectedOption.id === "crypto") {
    const cryptoSendMenu = new StringSelectMenuBuilder()
      .setCustomId("crypto_send_select_v3")
      .setPlaceholder("Select Crypto You Are Sending")
      .addOptions(
        CRYPTO_OPTIONS.map((crypto) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(crypto.label)
            .setDescription(crypto.description)
            .setValue(crypto.id),
        ),
      )

    const row = new ActionRowBuilder().addComponents(cryptoSendMenu)

    const embed = new EmbedBuilder()
      .setTitle("Select Cryptocurrency You Are Sending")
      .setDescription(`**Payment Method:** ${selectedOption.label}\n\nWhich cryptocurrency are you sending?`)
      .setColor("#5865F2")

    try {
      await interaction.editReply({
        embeds: [embed],
        components: [row],
      })
    } catch (error) {
      console.error("Error in handleExchangeSelection:", error)
    }
  } else {
    // Regular flow: show crypto selection
    const cryptoMenu = new StringSelectMenuBuilder()
      .setCustomId("crypto_select_v3")
      .setPlaceholder("Select Crypto to Receive")
      .addOptions(
        CRYPTO_OPTIONS.map((crypto) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(crypto.label)
            .setDescription(crypto.description)
            .setValue(crypto.id),
        ),
      )

    const row = new ActionRowBuilder().addComponents(cryptoMenu)

    const embed = new EmbedBuilder()
      .setTitle("Select Cryptocurrency")
      .setDescription(
        `**Payment Method:** ${selectedOption.label}\n\nNow select which cryptocurrency you want to receive:`,
      )
      .setColor("#5865F2")

    try {
      await interaction.editReply({
        embeds: [embed],
        components: [row],
      })
    } catch (error) {
      console.error("Error in handleExchangeSelection:", error)
    }
  }
}

async function handleCryptoSelection(interaction) {
  const pendingData = pendingSelections.get(interaction.user.id)

  if (!pendingData) {
    return interaction.reply({ content: "❌ Selection expired. Please start over.", ephemeral: true })
  }

  const selectedCrypto = CRYPTO_OPTIONS.find((crypto) => crypto.id === interaction.values[0])

  if (!selectedCrypto) {
    return interaction.reply({ content: "❌ Invalid crypto selected.", ephemeral: true })
  }

  // Update pending data with crypto selection
  pendingData.crypto = selectedCrypto.id
  pendingData.cryptoLabel = selectedCrypto.label
  pendingSelections.set(interaction.user.id, pendingData)

  // Check if USDC or USDT - show network selection
  if (selectedCrypto.id === "usdc" || selectedCrypto.id === "usdt") {
    const networkMenu = new StringSelectMenuBuilder()
      .setCustomId("network_select_v3")
      .setPlaceholder("Select Network")
      .addOptions(
        NETWORK_OPTIONS.map((network) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(network.label)
            .setDescription(network.description)
            .setValue(network.id),
        ),
      )

    const row = new ActionRowBuilder().addComponents(networkMenu)

    const embed = new EmbedBuilder()
      .setTitle("Select Network")
      .setDescription(`**Crypto:** ${selectedCrypto.label}\n\nPlease select which network you want to receive on:`)
      .setColor("#5865F2")

    try {
      await interaction.update({
        embeds: [embed],
        components: [row],
      })
    } catch (error) {
      console.error("Error showing network selection:", error)
    }
    return
  }

  // Show modal asking for amount (for non-stablecoin cryptos)
  const modal = new ModalBuilder().setCustomId("amount_modal").setTitle("Enter Amount")

  const amountInput = new TextInputBuilder()
    .setCustomId("amount_input")
    .setLabel("How much are you sending?")
    .setPlaceholder("Enter amount (e.g., 100)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)

  const firstRow = new ActionRowBuilder().addComponents(amountInput)
  modal.addComponents(firstRow)

  await interaction.showModal(modal)
}

async function handleNetworkSelection(interaction) {
  const pendingData = pendingSelections.get(interaction.user.id)

  if (!pendingData) {
    return interaction.reply({ content: "❌ Selection expired. Please start over.", ephemeral: true })
  }

  const selectedNetwork = NETWORK_OPTIONS.find((network) => network.id === interaction.values[0])

  if (!selectedNetwork) {
    return interaction.reply({ content: "❌ Invalid network selected.", ephemeral: true })
  }

  // Update pending data with network selection
  pendingData.network = selectedNetwork.id
  pendingData.networkLabel = selectedNetwork.label
  pendingSelections.set(interaction.user.id, pendingData)

  // Show modal asking for amount
  const modal = new ModalBuilder().setCustomId("amount_modal").setTitle("Enter Amount")

  const amountInput = new TextInputBuilder()
    .setCustomId("amount_input")
    .setLabel("How much are you sending?")
    .setPlaceholder("Enter amount (e.g., 100)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)

  const firstRow = new ActionRowBuilder().addComponents(amountInput)
  modal.addComponents(firstRow)

  await interaction.showModal(modal)
}

async function handleCryptoSendSelection(interaction) {
  const pendingData = pendingSelections.get(interaction.user.id)

  if (!pendingData) {
    return interaction.reply({ content: "❌ Selection expired. Please start over.", ephemeral: true })
  }

  const selectedCrypto = CRYPTO_OPTIONS.find((crypto) => crypto.id === interaction.values[0])

  if (!selectedCrypto) {
    return interaction.reply({ content: "❌ Invalid crypto selected.", ephemeral: true })
  }

  // Update pending data with crypto being sent
  pendingData.cryptoSending = selectedCrypto.id
  pendingData.cryptoSendingLabel = selectedCrypto.label
  pendingSelections.set(interaction.user.id, pendingData)

  // Check if USDC or USDT - show network selection
  if (selectedCrypto.id === "usdc" || selectedCrypto.id === "usdt") {
    const networkMenu = new StringSelectMenuBuilder()
      .setCustomId("network_send_select_v3")
      .setPlaceholder("Select Network")
      .addOptions(
        NETWORK_OPTIONS.map((network) =>
          new StringSelectMenuOptionBuilder()
            .setLabel(network.label)
            .setDescription(network.description)
            .setValue(network.id),
        ),
      )

    const row = new ActionRowBuilder().addComponents(networkMenu)

    const embed = new EmbedBuilder()
      .setTitle("Select Network")
      .setDescription(`**Crypto:** ${selectedCrypto.label}\n\nPlease select which network you are sending from:`)
      .setColor("#5865F2")

    try {
      await interaction.update({
        embeds: [embed],
        components: [row],
      })
    } catch (error) {
      console.error("Error showing network selection:", error)
    }
    return
  }

  // Show fiat receive options for non-stablecoin cryptos
  const receiveMenu = new StringSelectMenuBuilder()
    .setCustomId("crypto_receive_select_v3")
    .setPlaceholder("Select What to Receive")
    .addOptions(
      CRYPTO_RECEIVE_OPTIONS.map((option) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(option.label)
          .setDescription(option.description)
          .setValue(option.id),
      ),
    )

  const row = new ActionRowBuilder().addComponents(receiveMenu)

  const embed = new EmbedBuilder()
    .setTitle("Select What to Receive")
    .setDescription(`**Sending:** ${selectedCrypto.label}\n\nNow select what you want to receive:`)
    .setColor("#5865F2")

  try {
    await interaction.update({
      embeds: [embed],
      components: [row],
    })
  } catch (error) {
    console.error("Error showing receive options:", error)
  }
}

async function handleNetworkSendSelection(interaction) {
  const pendingData = pendingSelections.get(interaction.user.id)

  if (!pendingData) {
    return interaction.reply({ content: "❌ Selection expired. Please start over.", ephemeral: true })
  }

  const selectedNetwork = NETWORK_OPTIONS.find((network) => network.id === interaction.values[0])

  if (!selectedNetwork) {
    return interaction.reply({ content: "❌ Invalid network selected.", ephemeral: true })
  }

  // Update pending data with network selection
  pendingData.networkSending = selectedNetwork.id
  pendingData.networkSendingLabel = selectedNetwork.label
  pendingSelections.set(interaction.user.id, pendingData)

  // Show fiat receive options
  const receiveMenu = new StringSelectMenuBuilder()
    .setCustomId("crypto_receive_select_v3")
    .setPlaceholder("Select What to Receive")
    .addOptions(
      CRYPTO_RECEIVE_OPTIONS.map((option) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(option.label)
          .setDescription(option.description)
          .setValue(option.id),
      ),
    )

  const row = new ActionRowBuilder().addComponents(receiveMenu)

  const embed = new EmbedBuilder()
    .setTitle("Select What to Receive")
    .setDescription(
      `**Sending:** ${pendingData.cryptoSendingLabel} (${selectedNetwork.label})\n\nNow select what you want to receive:`,
    )
    .setColor("#5865F2")

  try {
    await interaction.update({
      embeds: [embed],
      components: [row],
    })
  } catch (error) {
    console.error("Error showing receive options:", error)
  }
}

async function handleCryptoReceiveSelection(interaction) {
  const pendingData = pendingSelections.get(interaction.user.id)

  if (!pendingData) {
    return interaction.reply({ content: "❌ Selection expired. Please start over.", ephemeral: true })
  }

  const selectedReceive = CRYPTO_RECEIVE_OPTIONS.find((option) => option.id === interaction.values[0])

  if (!selectedReceive) {
    return interaction.reply({ content: "❌ Invalid selection.", ephemeral: true })
  }

  // Update pending data with receive method
  pendingData.receiveMethod = selectedReceive.id
  pendingData.receiveMethodLabel = selectedReceive.label
  pendingData.receiveFeeInfo = selectedReceive.feeInfo
  pendingSelections.set(interaction.user.id, pendingData)

  // Show modal asking for amount
  const modal = new ModalBuilder().setCustomId("amount_modal_crypto").setTitle("Enter Amount")

  const amountInput = new TextInputBuilder()
    .setCustomId("amount_input")
    .setLabel("How much cryptocurrency are you sending?")
    .setPlaceholder("Enter amount (e.g., 0.5)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)

  const firstRow = new ActionRowBuilder().addComponents(amountInput)
  modal.addComponents(firstRow)

  await interaction.showModal(modal)
}

async function handleAmountModal(interaction) {
  await interaction.deferReply({ ephemeral: true })

  const pendingData = pendingSelections.get(interaction.user.id)

  if (!pendingData) {
    return interaction.editReply({ content: "❌ Selection expired. Please start over." })
  }

  const amountStr = interaction.fields.getTextInputValue("amount_input")
  const amount = Number.parseFloat(amountStr)

  if (isNaN(amount) || amount <= 0) {
    return interaction.editReply({ content: "❌ Please enter a valid positive number." })
  }

  // Store amount in pending data
  pendingData.sendingAmount = amount
  pendingSelections.set(interaction.user.id, pendingData)

  // Extract fee percentage from feeInfo
  let feePercent = 5 // default
  if (pendingData.feeInfo) {
    // Handle range fees like "5-8% fee" - use the higher value
    const rangeMatch = pendingData.feeInfo.match(/(\d+)-(\d+)%/)
    if (rangeMatch) {
      feePercent = Number.parseFloat(rangeMatch[2]) // Use the higher percentage
    } else {
      const match = pendingData.feeInfo.match(/(\d+)%/)
      if (match) {
        feePercent = Number.parseFloat(match[1])
      }
    }
  } else if (pendingData.receiveFeeInfo) {
    // Handle range fees like "5-8% fee" - use the higher value
    const rangeMatch = pendingData.receiveFeeInfo.match(/(\d+)-(\d+)%/)
    if (rangeMatch) {
      feePercent = Number.parseFloat(rangeMatch[2]) // Use the higher percentage
    } else {
      const match = pendingData.receiveFeeInfo.match(/(\d+)%/)
      if (match) {
        feePercent = Number.parseFloat(match[1])
      }
    }
  }

  // Calculate fee with $5.00 minimum
  const MINIMUM_FEE = 5.0
  let feeAmount = amount * (feePercent / 100)
  feeAmount = Math.max(feeAmount, MINIMUM_FEE)
  const receivingAmount = amount - feeAmount

  // Store receiving amount
  pendingData.receivingAmount = receivingAmount
  pendingData.feeAmount = feeAmount
  pendingData.feePercent = feePercent
  pendingSelections.set(interaction.user.id, pendingData)

  // Build confirmation embed
  let sendingLabel, receivingLabel

  if (pendingData.receiveMethod) {
    // Crypto to Fiat flow
    sendingLabel = "Cryptocurrency"
    receivingLabel = pendingData.receiveMethodLabel
  } else {
    // Fiat to Crypto flow
    sendingLabel = pendingData.paymentMethodLabel
    receivingLabel = pendingData.cryptoLabel
  }

  const confirmEmbed = new EmbedBuilder()
    .setTitle("💱 Confirm Your Exchange")
    .setDescription(
      `**Sending:** ${sendingLabel}\n` +
        `**Receiving:** ${receivingLabel}\n\n` +
        `**Amount Sending:** $${amount.toFixed(2)}\n` +
        `**Fee (${feePercent}% / min $5):** $${feeAmount.toFixed(2)}\n` +
        `**Amount Receiving:** $${receivingAmount.toFixed(2)}\n\n` +
        `**Minimum Service Fee:** $5.00 USD\n\n` +
        `Click "Confirm Exchange" to create your ticket.`,
    )
    .setColor("#FEE75C")
    .setFooter({ text: "You can cancel by not clicking the button" })

  const confirmButton = new ButtonBuilder()
    .setCustomId("confirm_exchange")
    .setLabel("Confirm Exchange")
    .setStyle(ButtonStyle.Success)
    .setEmoji("✅")

  const buttonRow = new ActionRowBuilder().addComponents(confirmButton)

  await interaction.editReply({
    embeds: [confirmEmbed],
    components: [buttonRow],
  })
}

async function handleConfirmExchange(interaction) {
  await interaction.deferReply({ ephemeral: true })

  const pendingData = pendingSelections.get(interaction.user.id)

  if (!pendingData) {
    return interaction.editReply({ content: "❌ Selection expired. Please start over." })
  }

  try {
    let ticketsCategory = interaction.guild.channels.cache.find(
      (channel) => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === "tickets",
    )

    if (!ticketsCategory) {
      ticketsCategory = await interaction.guild.channels.create({
        name: "Tickets",
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
        ],
      })
    }

    const channelName = `ticket-${interaction.user.username}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9-]/g, "")

    const ticketChannel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: ticketsCategory.id,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: client.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
      reason: `Exchange ticket created by ${interaction.user.tag}`,
    })

    const adminRoles = interaction.guild.roles.cache.filter((role) =>
      role.permissions.has(PermissionFlagsBits.Administrator),
    )

    for (const [roleId, role] of adminRoles) {
      await ticketChannel.permissionOverwrites.create(role, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
      })
    }

    pendingSelections.delete(interaction.user.id)

    const userTickets = activeTickets.get(interaction.user.id) || []

    let sendingLabel, receivingLabel

    if (pendingData.receiveMethod) {
      // Crypto to Fiat flow
      sendingLabel = pendingData.cryptoSendingLabel || "Cryptocurrency"
      receivingLabel = pendingData.receiveMethodLabel
      userTickets.push({
        channelId: ticketChannel.id,
        paymentMethod: "crypto",
        receiveMethod: pendingData.receiveMethod,
        createdAt: Date.now(),
        claimedBy: null,
      })
    } else {
      // Fiat to Crypto flow
      sendingLabel = pendingData.paymentMethodLabel
      receivingLabel = pendingData.cryptoLabel
      userTickets.push({
        channelId: ticketChannel.id,
        paymentMethod: pendingData.paymentMethod,
        crypto: pendingData.crypto,
        createdAt: Date.now(),
        claimedBy: null,
      })
    }

    activeTickets.set(interaction.user.id, userTickets)

    // Build description with network info if applicable
    let ticketDescription = `**User:** ${interaction.user}\n` + `**Sending:** ${sendingLabel}\n`

    // Add network info for sending crypto (crypto-to-fiat flow)
    if (pendingData.networkSending) {
      ticketDescription += `**Sending Network:** ${pendingData.networkSendingLabel}\n`
    }

    ticketDescription += `**Receiving:** ${receivingLabel}\n`

    // Add network info for receiving crypto (fiat-to-crypto flow)
    if (pendingData.network) {
      ticketDescription += `**Receiving Network:** ${pendingData.networkLabel}\n`
    }

    ticketDescription +=
      `**Fee:** ${pendingData.feePercent}% (min $5)\n\n` +
      `**Amount Sending:** $${pendingData.sendingAmount.toFixed(2)}\n` +
      `**Fee Amount:** $${pendingData.feeAmount.toFixed(2)}\n` +
      `**Amount Receiving:** $${pendingData.receivingAmount.toFixed(2)}\n\n` +
      `**Minimum Service Fee:** $5.00 USD\n\n` +
      `Please provide the following information:\n` +
      `1️⃣ Your ${sendingLabel} payment/wallet details\n` +
      `2️⃣ Your ${receivingLabel} receiving details\n`

    // Add network reminder if applicable
    if (pendingData.network) {
      ticketDescription += `3️⃣ Make sure you are receiving on the ${pendingData.networkLabel} network\n\n`
    } else if (pendingData.networkSending) {
      ticketDescription += `3️⃣ Make sure you are sending from the ${pendingData.networkSendingLabel} network\n\n`
    } else {
      ticketDescription += `\n`
    }

    ticketDescription += `A staff member will assist you shortly. Please be patient.`

    const ticketEmbed = new EmbedBuilder()
      .setTitle("🎫 Exchange Ticket Created")
      .setDescription(ticketDescription)
      .setColor("#57F287")
      .setFooter({ text: `Ticket opened by ${interaction.user.tag}` })
      .setTimestamp()

    const claimButton = new ButtonBuilder()
      .setCustomId("claim_ticket")
      .setLabel("Claim Ticket")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("✋")

    const buttonRow = new ActionRowBuilder().addComponents(claimButton)

    await ticketChannel.send({ content: `${interaction.user}`, embeds: [ticketEmbed], components: [buttonRow] })

    await interaction.editReply({
      content: `✅ Your exchange ticket has been created! Please check <#${ticketChannel.id}>`,
    })
  } catch (error) {
    console.error("Error creating ticket channel:", error)
    pendingSelections.delete(interaction.user.id)
    await interaction.editReply({
      content: "❌ Failed to create ticket. Please make sure the bot has permission to create channels.",
    })
  }
}

async function handleClaimTicket(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id)

  if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "❌ Only administrators can claim tickets.",
      ephemeral: true,
    })
  }

  let ticketData = null
  let userId = null

  for (const [uid, tickets] of activeTickets.entries()) {
    const ticket = tickets.find((t) => t.channelId === interaction.channel.id)
    if (ticket) {
      ticketData = ticket
      userId = uid
      break
    }
  }

  if (!ticketData) {
    return interaction.reply({
      content: "❌ This is not a valid ticket channel.",
      ephemeral: true,
    })
  }

  if (ticketData.claimedBy) {
    return interaction.reply({
      content: `❌ This ticket has already been claimed by <@${ticketData.claimedBy}>.`,
      ephemeral: true,
    })
  }

  ticketData.claimedBy = interaction.user.id

  const originalEmbed = interaction.message.embeds[0]
  const updatedEmbed = EmbedBuilder.from(originalEmbed)
    .setColor("#FEE75C")
    .addFields({ name: "👤 Claimed By", value: `${interaction.user}`, inline: false })

  const disabledButton = new ButtonBuilder()
    .setCustomId("claim_ticket")
    .setLabel("Ticket Claimed")
    .setStyle(ButtonStyle.Success)
    .setEmoji("✅")
    .setDisabled(true)

  const buttonRow = new ActionRowBuilder().addComponents(disabledButton)

  await interaction.update({ embeds: [updatedEmbed], components: [buttonRow] })

  await interaction.followUp({
    content: `✅ ${interaction.user} has claimed this ticket!`,
    ephemeral: false,
  })
}

async function handleCompleteTicket(interaction) {
  // Interaction already deferred in main handler

  // Get parameters first
  const amount = interaction.options.getNumber("amount")
  const fromMethod = interaction.options.getString("from")
  const toMethod = interaction.options.getString("to")

  // Then do validation - check if channel name starts with "ticket-"
  const channelName = interaction.channel.name.toLowerCase()
  const hasTicketPrefix = channelName.startsWith("ticket-")
  const hasParent = !!interaction.channel.parent
  const parentName = interaction.channel.parent?.name.toLowerCase()
  const isTicketsCategory = parentName === "tickets"

  console.log(`🔍 Complete-ticket validation:`)
  console.log(`   - Channel name: "${interaction.channel.name}"`)
  console.log(`   - Has 'ticket-' prefix: ${hasTicketPrefix}`)
  console.log(`   - Has parent category: ${hasParent}`)
  console.log(`   - Parent name: "${interaction.channel.parent?.name}"`)
  console.log(`   - Is in 'Tickets' category: ${isTicketsCategory}`)

  const isTicketChannel = hasTicketPrefix && hasParent && isTicketsCategory
  console.log(`   ✅ Final validation result: ${isTicketChannel}`)

  if (!isTicketChannel) {
    console.log(`❌ BLOCKED: Command rejected in channel "${interaction.channel.name}"`)
    return interaction.editReply({
      content: `❌ This command can only be used in ticket channels.\n\n**Debug Info:**\n- Channel: ${interaction.channel.name}\n- Has ticket- prefix: ${hasTicketPrefix}\n- Has parent: ${hasParent}\n- Parent name: ${interaction.channel.parent?.name || "N/A"}\n- In Tickets category: ${isTicketsCategory}`,
    })
  }

  if (amount <= 0) {
    return interaction.editReply({
      content: "❌ Amount must be greater than 0.",
    })
  }

  try {
    console.log(`🎯 Starting complete-ticket for channel: ${interaction.channel.id}`)
    console.log(`📊 Amount: $${amount.toFixed(2)}, From: ${fromMethod}, To: ${toMethod}`)
    const currentTotal = await getTotalExchanged()
    console.log(`📊 Current total before: $${currentTotal.toFixed(2)}`)
    console.log(`🔍 Active tickets map size: ${activeTickets.size}`)

    // Update global total in database
    await updateTotalExchanged(amount)

    let ticketOwnerId = null

    // Try to find owner from activeTickets
    for (const [uid, tickets] of activeTickets.entries()) {
      console.log(
        `🔎 Checking user ${uid} tickets:`,
        tickets.map((t) => t.channelId),
      )
      const ticketIndex = tickets.findIndex((t) => t.channelId === interaction.channel.id)
      if (ticketIndex !== -1) {
        ticketOwnerId = uid
        console.log(`✅ Found ticket owner: ${ticketOwnerId}`)
        tickets.splice(ticketIndex, 1)
        if (tickets.length === 0) {
          activeTickets.delete(uid)
        } else {
          activeTickets.set(uid, tickets)
        }
        break
      }
    }

    // Fallback: find owner from first message
    if (!ticketOwnerId) {
      console.log(`🔍 Ticket not in activeTickets, searching messages...`)
      const messages = await interaction.channel.messages.fetch({ limit: 100 })
      const firstMessage = messages.filter((msg) => msg.author.id === client.user.id).last()
      if (firstMessage && firstMessage.mentions.users.size > 0) {
        ticketOwnerId = firstMessage.mentions.users.first().id
        console.log(`✅ Found ticket owner from message: ${ticketOwnerId}`)
      }
    }

    if (ticketOwnerId) {
      const currentUserStats = await getUserStats(ticketOwnerId)
      await updateUserStats(ticketOwnerId, amount)
      const newUserStats = await getUserStats(ticketOwnerId)
      console.log(
        `📈 User ${ticketOwnerId} stats updated: $${Number.parseFloat(currentUserStats).toFixed(2)} → $${Number.parseFloat(newUserStats).toFixed(2)}`,
      )
    } else {
      console.log("⚠️ Could not determine ticket owner - stats not updated")
    }

    const newTotal = await getTotalExchanged()
    console.log(`📊 New total after: $${newTotal.toFixed(2)}`)

    await updateStatsChannel(interaction.guild)
    if (leaderboardChannelId) {
      console.log(`📋 Updating leaderboard...`)
      await updateLeaderboard(interaction.guild)
    } else {
      console.log(`⚠️ No leaderboard channel set`)
    }

    const ticketOwnerUser = ticketOwnerId
      ? await interaction.guild.members.fetch(ticketOwnerId).catch(() => null)
      : null
    const ownerMention = ticketOwnerUser ? `<@${ticketOwnerId}>` : "Unknown User"

    const completeEmbed = new EmbedBuilder()
      .setTitle("✅ Ticket Completed")
      .setDescription(
        `This ticket has been marked as completed by ${interaction.user.tag}.\n\n` +
          `**Ticket Owner:** ${ownerMention}\n` +
          `**From:** ${fromMethod}\n` +
          `**To:** ${toMethod}\n` +
          `**Amount Exchanged:** $${amount.toFixed(2)} USD\n` +
          `**Total Exchanged:** $${newTotal.toFixed(2)} USD\n` +
          (ticketOwnerId
            ? `**User Stats Updated:** ✅ (+$${amount.toFixed(2)})`
            : `**User Stats Updated:** ⚠️ (Owner not found)`) +
          `\n\n` +
          `Channel will be deleted in 10 seconds.`,
      )
      .setColor("#57F287")
      .setTimestamp()

    await interaction.editReply({ embeds: [completeEmbed] })

    if (leaderboardChannelId && ticketOwnerId) {
      const leaderboardChannel = interaction.guild.channels.cache.get(leaderboardChannelId)
      if (leaderboardChannel) {
        const ticketCompleteEmbed = new EmbedBuilder()
          .setTitle("🎫 Ticket Completed")
          .setDescription(
            `A ticket has been completed!\n\n` +
              `**User:** ${ownerMention}\n` +
              `**From:** ${fromMethod}\n` +
              `**To:** ${toMethod}\n` +
              `**Amount:** $${amount.toFixed(2)}\n` +
              `**Completed by:** ${interaction.user}`,
          )
          .setColor("#57F287")
          .setTimestamp()

        await leaderboardChannel.send({ embeds: [ticketCompleteEmbed] })
      }
    }

    setTimeout(async () => {
      try {
        await interaction.channel.delete("Ticket completed")
      } catch (err) {
        console.error("Error deleting channel:", err)
      }
    }, 10000)
  } catch (error) {
    console.error("Error completing ticket:", error)
    await interaction.editReply({ content: "❌ Failed to complete ticket." })
  }
}

async function handleCloseTicket(interaction) {
  // Interaction already deferred in main handler

  // Check if this is a ticket channel (same validation as complete-ticket)
  const isTicketChannel =
    interaction.channel.name.startsWith("ticket-") &&
    interaction.channel.parent &&
    interaction.channel.parent.name.toLowerCase() === "tickets"

  console.log(
    `🔍 Close-ticket channel check: name="${interaction.channel.name}", hasParent=${!!interaction.channel.parent}, parentName="${interaction.channel.parent?.name}"`,
  )
  console.log(`✅ Is ticket channel: ${isTicketChannel}`)

  if (!isTicketChannel) {
    return interaction.editReply({
      content: "❌ This command can only be used in ticket channels.",
    })
  }

  // Remove from activeTickets if it exists (cleanup)
  for (const [uid, tickets] of activeTickets.entries()) {
    const ticketIndex = tickets.findIndex((t) => t.channelId === interaction.channel.id)
    if (ticketIndex !== -1) {
      tickets.splice(ticketIndex, 1)
      if (tickets.length === 0) {
        activeTickets.delete(uid)
      } else {
        activeTickets.set(uid, tickets)
      }
      console.log(`🗑️ Removed ticket from activeTickets for user ${uid}`)
      break
    }
  }

  try {
    const closeEmbed = new EmbedBuilder()
      .setTitle("🔒 Ticket Closing")
      .setDescription(`This ticket has been closed by ${interaction.user.tag}. Channel will be deleted in 5 seconds.`)
      .setColor("#ED4245")
      .setTimestamp()

    await interaction.editReply({ embeds: [closeEmbed] })

    setTimeout(async () => {
      try {
        await interaction.channel.delete("Ticket closed")
      } catch (err) {
        console.error("Error deleting channel:", err)
      }
    }, 5000)
  } catch (error) {
    console.error("Error closing ticket:", error)
    await interaction.editReply({ content: "❌ Failed to close ticket." })
  }
}

async function handleSetLeaderboard(interaction) {
  leaderboardChannelId = interaction.channel.id
  await saveChannelId("leaderboardChannelId", leaderboardChannelId)

  await interaction.reply({
    content: `✅ Leaderboard channel set to ${interaction.channel}! The leaderboard will update every hour.`,
    ephemeral: true,
  })

  await updateLeaderboard(interaction.guild)
}

async function handleUpdateLeaderboard(interaction) {
  if (!leaderboardChannelId) {
    return interaction.reply({
      content: "❌ No leaderboard channel has been set. Use `/set-leaderboard` first.",
      ephemeral: true,
    })
  }

  await interaction.deferReply({ ephemeral: true })

  try {
    await updateLeaderboard(interaction.guild)
    await interaction.editReply({ content: "✅ Leaderboard has been updated!" })
  } catch (error) {
    console.error("Error updating leaderboard:", error)
    await interaction.editReply({ content: "❌ Failed to update leaderboard." })
  }
}

async function updateLeaderboard(guild) {
  if (!leaderboardChannelId) return

  try {
    const channel = guild.channels.cache.get(leaderboardChannelId)
    if (!channel) {
      console.error("Leaderboard channel not found")
      return
    }

    // Get users from database instead of memory
    const allUsers = await getAllUserStats()
    const sortedUsers = allUsers.slice(0, 10)

    let description = ""
    if (sortedUsers.length === 0) {
      description = "No exchanges completed yet. Start using `/complete-ticket` to track stats!"
    } else {
      description = sortedUsers
        .map(({ user_id, total_exchanged }, index) => {
          const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `**${index + 1}.**`
          return `${medal} <@${user_id}> - **$${Number.parseFloat(total_exchanged).toFixed(2)}**`
        })
        .join("\n")
    }

    const currentTotal = await getTotalExchanged()
    const leaderboardEmbed = new EmbedBuilder()
      .setTitle("🏆 Top 10 Exchange Leaderboard")
      .setDescription(description)
      .setColor("#FFD700")
      .setFooter({ text: `Total Exchanged: $${currentTotal.toFixed(2)} | Updates every hour` })
      .setTimestamp()

    if (leaderboardMessageId) {
      try {
        const message = await channel.messages.fetch(leaderboardMessageId)
        await message.edit({ embeds: [leaderboardEmbed] })
      } catch (error) {
        const newMessage = await channel.send({ embeds: [leaderboardEmbed] })
        leaderboardMessageId = newMessage.id
        await saveChannelId("leaderboardMessageId", leaderboardMessageId)
      }
    } else {
      const newMessage = await channel.send({ embeds: [leaderboardEmbed] })
      leaderboardMessageId = newMessage.id
      await saveChannelId("leaderboardMessageId", leaderboardMessageId)
    }
  } catch (error) {
    console.error("Error updating leaderboard:", error)
  }
}

async function handleMessage(interaction) {
  const text = interaction.options.getString("text")

  try {
    await interaction.channel.send(text)
    await interaction.reply({
      content: "✅ Message sent!",
      ephemeral: true,
    })
  } catch (error) {
    console.error("Error sending message:", error)
    await interaction.reply({
      content: "❌ Failed to send message.",
      ephemeral: true,
    })
  }
}

async function updateStatsChannel(guild) {
  if (!statsChannelId) {
    console.log("⚠️ No stats channel ID set")
    return
  }

  try {
    const channel = guild.channels.cache.get(statsChannelId)
    if (channel) {
      const currentTotal = await getTotalExchanged()
      const newName = `💰 $${currentTotal.toFixed(2)} Exchanged`
      console.log(`📢 Updating stats channel to: ${newName}`)
      await channel.setName(newName)
      await channel.setPosition(0)
      console.log(`✅ Stats channel updated successfully`)
    } else {
      console.log(`⚠️ Stats channel ${statsChannelId} not found in cache`)
    }
  } catch (error) {
    if (error.code === 50013) {
      console.error("❌ Missing permissions to update stats channel")
    } else if (error.status === 429 || error.message?.includes("rate limit")) {
      console.log(
        "⏱️ Stats channel update rate-limited by Discord (2 changes per 10min). Will retry on next scheduled update.",
      )
    } else {
      console.error("❌ Error updating stats channel:", error.message || error)
    }
  }
}

client.on("error", (error) => {
  console.error("Discord client error:", error)
})

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error)
})

if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_APPLICATION_ID) {
  console.error("❌ Missing required environment variables:")
  if (!process.env.DISCORD_BOT_TOKEN) console.error("   - DISCORD_BOT_TOKEN")
  if (!process.env.DISCORD_APPLICATION_ID) console.error("   - DISCORD_APPLICATION_ID")
  console.error("\n📝 Please set these in the Secrets tab (🔒 icon in the left sidebar)")
  process.exit(1)
}

const app = express()
const PORT = 5000

app.get("/", (req, res) => {
  res.json({
    status: "online",
    bot: client.user ? client.user.tag : "Not logged in yet",
    uptime: process.uptime(),
    totalExchanged: totalExchanged,
  })
})

app.get("/health", (req, res) => {
  res.json({ status: "ok" })
})

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP server running on port ${PORT} (for Autoscale deployment compatibility)`)
})

client.login(process.env.DISCORD_BOT_TOKEN)
