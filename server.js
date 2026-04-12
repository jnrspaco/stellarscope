import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { Horizon } from "@stellar/stellar-sdk";

dotenv.config();

const PORT = process.env.PORT || 3402;
const NETWORK = process.env.STELLAR_NETWORK || "stellar:testnet";
const FACILITATOR_URL =
  process.env.FACILITATOR_URL || "https://channels.openzeppelin.com/x402/testnet";
const OZ_API_KEY = process.env.OZ_API_KEY;
const PAY_TO = process.env.PAY_TO;

if (!PAY_TO) {
  console.error("Set PAY_TO in .env to your Stellar public key");
  process.exit(1);
}

if (!OZ_API_KEY) {
  console.error("Set OZ_API_KEY in .env (get one at https://channels.openzeppelin.com/testnet/gen)");
  process.exit(1);
}

const HORIZON_URL =
  NETWORK === "stellar:pubnet"
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";

const horizon = new Horizon.Server(HORIZON_URL);

const PRICES = {
  account: "$0.001",
  transactions: "$0.005",
  network: "$0.001",
  balances: "$0.002",
};

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (_, res) =>
  res.json({
    name: "StellarScope",
    description:
      "Paid Stellar analytics API — AI agents pay per-request via x402 on Stellar",
    network: NETWORK,
    endpoints: {
      "/account/:id": { price: PRICES.account, method: "GET" },
      "/account/:id/transactions": { price: PRICES.transactions, method: "GET" },
      "/account/:id/balances": { price: PRICES.balances, method: "GET" },
      "/network/stats": { price: PRICES.network, method: "GET" },
    },
  })
);

const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  createAuthHeaders: async () => {
    const headers = { Authorization: `Bearer ${OZ_API_KEY}` };
    return { verify: headers, settle: headers, supported: headers };
  },
});

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  NETWORK,
  new ExactStellarScheme()
);

app.use(
  paymentMiddleware(
    {
      "GET /account/:id": {
        accepts: [
          { scheme: "exact", price: PRICES.account, network: NETWORK, payTo: PAY_TO },
        ],
      },
      "GET /account/:id/transactions": {
        accepts: [
          { scheme: "exact", price: PRICES.transactions, network: NETWORK, payTo: PAY_TO },
        ],
      },
      "GET /account/:id/balances": {
        accepts: [
          { scheme: "exact", price: PRICES.balances, network: NETWORK, payTo: PAY_TO },
        ],
      },
      "GET /network/stats": {
        accepts: [
          { scheme: "exact", price: PRICES.network, network: NETWORK, payTo: PAY_TO },
        ],
      },
    },
    resourceServer
  )
);

app.get("/account/:id", async (req, res) => {
  try {
    const account = await horizon.loadAccount(req.params.id);
    res.json({
      id: account.id,
      sequence: account.sequence,
      subentry_count: account.subentry_count,
      thresholds: account.thresholds,
      flags: account.flags,
      balances: account.balances.map((b) => ({
        asset:
          b.asset_type === "native"
            ? "XLM"
            : `${b.asset_code}:${b.asset_issuer}`,
        balance: b.balance,
      })),
      num_sponsoring: account.num_sponsoring,
      num_sponsored: account.num_sponsored,
    });
  } catch (e) {
    res.status(404).json({ error: "Account not found", detail: e.message });
  }
});

app.get("/account/:id/transactions", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const txs = await horizon
      .transactions()
      .forAccount(req.params.id)
      .limit(limit)
      .order("desc")
      .call();

    res.json({
      account: req.params.id,
      count: txs.records.length,
      transactions: txs.records.map((tx) => ({
        hash: tx.hash,
        ledger: tx.ledger,
        created_at: tx.created_at,
        source_account: tx.source_account,
        fee_charged: tx.fee_charged,
        operation_count: tx.operation_count,
        memo_type: tx.memo_type,
        memo: tx.memo,
        successful: tx.successful,
      })),
    });
  } catch (e) {
    res.status(404).json({ error: "Could not fetch transactions", detail: e.message });
  }
});

app.get("/account/:id/balances", async (req, res) => {
  try {
    const account = await horizon.loadAccount(req.params.id);
    const balances = account.balances.map((b) => ({
      asset_type: b.asset_type,
      asset_code: b.asset_code || "XLM",
      asset_issuer: b.asset_issuer || "native",
      balance: b.balance,
      limit: b.limit,
      buying_liabilities: b.buying_liabilities,
      selling_liabilities: b.selling_liabilities,
      is_authorized: b.is_authorized,
    }));
    res.json({ account: req.params.id, balances });
  } catch (e) {
    res.status(404).json({ error: "Account not found", detail: e.message });
  }
});

app.get("/network/stats", async (req, res) => {
  try {
    const feeStats = await horizon.feeStats();
    const ledger = await horizon.ledgers().order("desc").limit(1).call();
    const latest = ledger.records[0];
    res.json({
      latest_ledger: latest.sequence,
      closed_at: latest.closed_at,
      transaction_count: latest.successful_transaction_count,
      operation_count: latest.operation_count,
      base_fee_in_stroops: latest.base_fee_in_stroops,
      fee_stats: {
        last_ledger_base_fee: feeStats.last_ledger_base_fee,
        ledger_capacity_usage: feeStats.ledger_capacity_usage,
        fee_charged: feeStats.fee_charged,
        max_fee: feeStats.max_fee,
      },
    });
  } catch (e) {
    res.status(500).json({ error: "Network stats unavailable", detail: e.message });
  }
});

app.listen(Number(PORT), () => {
  console.log(`\nStellarScope x402 server running`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Network: ${NETWORK}`);
  console.log(`   Pay-to:  ${PAY_TO}\n`);
});