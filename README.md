# 🔭 StellarScope

**Paid Stellar analytics API with x402 micropayments + MCP server for AI agents**

> Built for [Stellar Hacks: Agents](https://dorahacks.io/hackathon/stellar-agents-x402-stripe-mpp) hackathon

## What is StellarScope?

StellarScope is a pay-per-query Stellar network analytics API. AI agents autonomously discover it via OpenClaw, pay micropayments in USDC via the x402 protocol on Stellar, and receive real-time blockchain data — no API keys, no subscriptions, no human in the loop.

### How it works

```
Agent ──GET /account/G...──→ StellarScope Server
       ←── 402 + payment instructions ──┘
Agent ──signs USDC transfer via Soroban──→ x402 Facilitator
       ←── settlement proof ──┘
Agent ──retries with proof──→ StellarScope Server
       ←── 200 + account data ──┘
```

### Key features

- **x402 on Stellar** — Per-request micropayments ($0.001–$0.005) settled on-chain via USDC
- **MCP Server** — Claude, Cursor, and other MCP clients can use StellarScope as tools
- **OpenClaw Discovery** — `skill.md` enables autonomous agent discovery
- **Multiple endpoints** — Account info, transaction history, balances, network stats

## Quick Start

### 1. Install

```bash
git clone https://github.com/YOUR_USERNAME/stellarscope.git
cd stellarscope
npm install
```

### 2. Set up Stellar testnet wallets

You need two wallets — one for the **server** (receives payments) and one for the **client** (pays for queries).

1. Create keypairs at https://lab.stellar.org/account/create
2. Fund with testnet XLM at https://lab.stellar.org/account/fund
3. Add USDC trustline (button on fund page), sign & submit
4. Get testnet USDC from https://faucet.circle.com (select Stellar Testnet)

### 3. Configure

```bash
cp .env.example .env
# Edit .env with your keys
```

### 4. Run the server

```bash
npm run server
# 🔭 StellarScope x402 server running on http://localhost:3402
```

### 5. Test with the client

```bash
npm run client
# Pays for each endpoint and shows results
```

### 6. Use with Claude (MCP)

Add to your Claude Desktop / claude_desktop_config.json:

```json
{
  "mcpServers": {
    "stellarscope": {
      "command": "node",
      "args": ["mcp-server.js"],
      "cwd": "/absolute/path/to/stellarscope"
    }
  }
}
```

Then ask Claude: *"What's the balance of account G...?"* — it will call `get_account`, pay $0.001 USDC via x402, and return the data.

## Architecture

```
┌─────────────────────────────────────────────┐
│  AI Agent (Claude / Cursor / OpenClaw)      │
│  └── MCP Client ── calls tools              │
└──────────┬──────────────────────────────────┘
           │ stdio
┌──────────▼──────────────────────────────────┐
│  mcp-server.js (MCP Server)                 │
│  └── x402 fetch wrapper                     │
│      └── signs USDC payments via Soroban    │
└──────────┬──────────────────────────────────┘
           │ HTTP + x402 headers
┌──────────▼──────────────────────────────────┐
│  server.js (Express + x402 middleware)      │
│  └── Horizon API queries                    │
│  └── x402 facilitator verification          │
└──────────┬──────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────┐
│  Stellar Network (testnet)                  │
│  └── USDC settlement via Soroban SAC        │
│  └── Horizon data queries                   │
└─────────────────────────────────────────────┘
```

## Endpoints & Pricing

| Endpoint | Price | Description |
|---|---|---|
| `GET /account/:id` | $0.001 | Account summary |
| `GET /account/:id/transactions` | $0.005 | Recent tx history |
| `GET /account/:id/balances` | $0.002 | Balance breakdown |
| `GET /network/stats` | $0.001 | Network health |

## Tech Stack

- **x402 Protocol** — HTTP-native micropayments (Coinbase/Cloudflare)
- **Stellar / Soroban** — On-chain USDC settlement
- **Express** — API server with x402 middleware
- **MCP SDK** — Model Context Protocol for AI agent integration
- **OpenClaw** — Agent discovery via skill.md

## License

MIT
