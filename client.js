import dotenv from "dotenv";
import { Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { x402Client, x402HTTPClient } from "@x402/fetch";
import { createEd25519Signer, getNetworkPassphrase } from "@x402/stellar";
import { ExactStellarScheme } from "@x402/stellar/exact/client";

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

async function paidRequest(path) {
  const url = new URL(path, SERVER_URL).toString();
  console.log(`\n-> GET ${path}`);

  const first = await fetch(url);
  console.log(`  Status: ${first.status}`);

  if (first.status !== 402) {
    console.log("  (No payment required)");
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
  const data = await paid.json();
  console.log(`  Paid & received (status ${paid.status})`);
  return data;
}

async function main() {
  console.log("StellarScope Client Demo");
  console.log(`   Server: ${SERVER_URL}`);
  console.log(`   Wallet: ${signer.address}`);

  const info = await paidRequest("/");
  console.log("  Service:", JSON.stringify(info, null, 2));

  const stats = await paidRequest("/network/stats");
  console.log("  Stats:", JSON.stringify(stats, null, 2));

  const testAccount = process.argv[2] || signer.address;
  const account = await paidRequest(`/account/${testAccount}`);
  console.log("  Account:", JSON.stringify(account, null, 2));

  const txs = await paidRequest(`/account/${testAccount}/transactions?limit=3`);
  console.log("  Transactions:", JSON.stringify(txs, null, 2));

  console.log("\nAll paid requests completed successfully!");
}

main().catch((err) => {
  console.error("Client error:", err);
  process.exit(1);
});