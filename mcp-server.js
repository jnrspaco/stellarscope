import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import { x402Client, x402HTTPClient } from "@x402/fetch";
import { createEd25519Signer } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { getNetworkPassphrase } from "@x402/stellar";

dotenv.config();

const STELLAR_PRIVATE_KEY = process.env.STELLAR_PRIVATE_KEY;
const SERVER_URL = process.env.STELLARSCOPE_URL || "http://localhost:3402";
const NETWORK = process.env.STELLAR_NETWORK || "stellar:testnet";
const RPC_URL =
  process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";

if (!STELLAR_PRIVATE_KEY) {
  console.error("Set STELLAR_PRIVATE_KEY in .env");
  process.exit(1);
}

const signer = createEd25519Signer(STELLAR_PRIVATE_KEY, NETWORK);
const client = new x402Client().register(
  "stellar:*",
  new ExactStellarScheme(signer, { url: RPC_URL })
);
const httpClient = new x402HTTPClient(client);

async function paidFetch(path) {
  const url = new URL(path, SERVER_URL).toString();
  const first = await fetch(url);
  if (first.status !== 402) {
    return await first.json();
  }
  const paymentRequired = httpClient.getPaymentRequiredResponse((name) =>
    first.headers.get(name)
  );
  let paymentPayload = await client.createPaymentPayload(paymentRequired);
  const networkPassphrase = getNetworkPassphrase(NETWORK);
  const tx = new Transaction(
    paymentPayload.payload.transaction,
    networkPassphrase
  );
  const sorobanData = tx.toEnvelope().v1()?.tx()?.ext()?.sorobanData();
  if (sorobanData) {
    paymentPayload = {
      ...paymentPayload,
      payload: {
        ...paymentPayload.payload,
        transaction: TransactionBuilder.cloneFrom(tx, {
          fee: "100000",
          sorobanData,
          networkPassphrase,
        })
          .build()
          .toXDR(),
      },
    };
  }
  const headers = httpClient.encodePaymentSignatureHeader(paymentPayload);
  const paid = await fetch(url, { method: "GET", headers });
  return await paid.json();
}

const mcp = new McpServer({
  name: "stellarscope",
  version: "1.0.0",
  description:
    "Stellar network analytics — account data, transactions, balances, and network stats. Each call pays a micropayment via x402 on Stellar.",
});

mcp.tool(
  "get_account",
  "Get a Stellar account summary including balances, sequence number, and flags. Costs $0.001 USDC via x402.",
  { account_id: z.string().describe("Stellar public key (G...)") },
  async ({ account_id }) => {
    try {
      const data = await paidFetch(`/account/${account_id}`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

mcp.tool(
  "get_transactions",
  "Get recent transactions for a Stellar account. Costs $0.005 USDC via x402.",
  {
    account_id: z.string().describe("Stellar public key (G...)"),
    limit: z.number().min(1).max(50).default(10).describe("Number of transactions (max 50)"),
  },
  async ({ account_id, limit }) => {
    try {
      const data = await paidFetch(
        `/account/${account_id}/transactions?limit=${limit}`
      );
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

mcp.tool(
  "get_balances",
  "Get detailed balance breakdown for a Stellar account. Costs $0.002 USDC via x402.",
  { account_id: z.string().describe("Stellar public key (G...)") },
  async ({ account_id }) => {
    try {
      const data = await paidFetch(`/account/${account_id}/balances`);
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

mcp.tool(
  "get_network_stats",
  "Get current Stellar network stats: latest ledger, fees, capacity. Costs $0.001 USDC via x402.",
  {},
  async () => {
    try {
      const data = await paidFetch("/network/stats");
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    } catch (e) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await mcp.connect(transport);