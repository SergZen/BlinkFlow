import { Connection, clusterApiUrl } from '@solana/web3.js';
import { processTransaction } from '../events.js';

const sig = process.argv[2];
if (!sig) {
  console.error('Usage: node replay-tx.js <signature>');
  process.exit(1);
}

const connection = new Connection(
  process.env.SOLANA_RPC_URL_DEVNET || clusterApiUrl('devnet'),
  'confirmed'
);

async function main() {
  console.log(`[replay] fetching tx ${sig}...`);
  const tx = await connection.getTransaction(sig, {
    maxSupportedTransactionVersion: 0,
    encoding: 'json'
  });
  if (!tx) {
    console.error(`[replay] transaction ${sig} not found on devnet`);
    process.exit(1);
  }
  console.log(`[replay] processing tx ${sig}...`);
  const events = await processTransaction(tx, { connection, forceAmount: true });
  console.log(`[replay] completed, processed ${events.length} event(s)`);
}

main().catch(err => {
  console.error('[replay] error:', err.message);
  process.exit(1);
});
