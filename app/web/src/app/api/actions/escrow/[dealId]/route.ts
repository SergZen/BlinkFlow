import {
  createActionHeaders,
  createPostResponse,
  type ActionGetResponse,
  type ActionPostRequest,
  type ActionPostResponse,
} from "@solana/actions";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";

// CORS + X-Action-Version + X-Blockchain-Ids. Wallets reject responses without these.
const headers = createActionHeaders({ chainId: "devnet" });

export const OPTIONS = async () => new Response(null, { headers });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await params;
  const origin = new URL(req.url).origin;

  // TODO: fetch the deal (amount, title, criteria hash) from app/server.
  const payload: ActionGetResponse = {
    type: "action",
    icon: `${origin}/icon.png`,
    title: "BlinkFlow escrow",
    description: `Fund deal ${dealId}. Funds are locked until release.`,
    label: "Fund escrow",
    links: {
      actions: [
        {
          type: "transaction",
          label: "Fund escrow",
          href: `/api/actions/escrow/${dealId}`,
        },
      ],
    },
  };

  return Response.json(payload, { headers });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ dealId: string }> },
) {
  const { dealId } = await params;
  const body: ActionPostRequest = await req.json();

  let payer: PublicKey;
  try {
    payer = new PublicKey(body.account);
  } catch {
    return Response.json({ message: "Invalid account" }, { status: 400, headers });
  }

  const connection = new Connection(
    process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
  );

  // TODO: build the real initialize_escrow ix with @coral-xyz/anchor + your IDL.
  const tx = new Transaction();
  tx.feePayer = payer;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  const payload: ActionPostResponse = await createPostResponse({
    fields: { type: "transaction", transaction: tx, message: `Funding deal ${dealId}` },
  });

  return Response.json(payload, { headers });
}
