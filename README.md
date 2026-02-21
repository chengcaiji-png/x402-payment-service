# x402 Payment Service

Production-ready HTTP 402 payment service for AI agent-to-agent commerce on Base blockchain.

## Features

✅ **Chain-verified payments** - Real USDC transfers on Base Mainnet  
✅ **EIP-3009 support** - Gasless transfers with authorization signatures  
✅ **Anti-replay protection** - Nonce tracking prevents double-spending  
✅ **Payment history** - SQLite database for audit trail  
✅ **Multiple verification methods** - Transaction hash OR signature  

## Services

| Endpoint | Price | Description |
|---|---|---|
| `/api/japanese-news` | $50 | Japanese News Learning Platform dataset |
| `/api/web-scraper` | $30 | Custom web scraping job |
| `/api/ai-analysis` | $20 | AI-powered data analysis |
| `/api/reverse-engineering` | $100 | Product reverse engineering |
| `/api/stats` | FREE | Service statistics |

## Installation

```bash
npm install
```

## Run Locally

```bash
npm start
# or with auto-reload:
npm run dev
```

Server starts on `http://localhost:8402`

## Usage

### 1. Request Service (Gets 402)

```bash
curl http://localhost:8402/api/japanese-news
```

Response:
```json
{
  "error": "payment_required",
  "message": "This service costs $50 USDC",
  "payment": {
    "address": "0xAA31F97BE2c7f90Ff2cf3b7eD44855E750CEF81f",
    "amount": "50000000",
    "network": "Base Mainnet",
    "token": "USDC"
  }
}
```

### 2. Pay with USDC

Transfer USDC on Base Mainnet to the payment address.

### 3. Access Service with Transaction Hash

```bash
curl -H "Payment-Tx: 0xYOUR_TX_HASH" \
  http://localhost:8402/api/japanese-news
```

## Payment Methods

### Method 1: Transaction Hash (Simple)

1. Send USDC on Base to payment address
2. Include `Payment-Tx: <txhash>` header in request
3. Server verifies on-chain

### Method 2: EIP-3009 Signature (Gasless)

1. Sign `transferWithAuthorization` message
2. Include `Payment-Signature: <base64>` header
3. Server verifies signature + submits transaction

## Environment Variables

```bash
PORT=8402                    # Server port
DB_PATH=./payments.db        # Payment database location
```

## Database

All payments stored in SQLite:

```sql
-- Payment records
CREATE TABLE payments (
  tx_hash TEXT PRIMARY KEY,
  from_address TEXT,
  amount TEXT,
  service TEXT,
  timestamp INTEGER,
  verified_at INTEGER
);

-- Used nonces (anti-replay)
CREATE TABLE used_nonces (
  nonce TEXT PRIMARY KEY,
  used_at INTEGER
);
```

## Deployment

### Railway

```bash
railway init
railway up
```

### Vercel (Serverless)

Not recommended - needs persistent SQLite database. Use Railway/Fly.io instead.

### Fly.io

```bash
fly launch
fly deploy
```

## Testing

Check service stats (free endpoint):
```bash
curl http://localhost:8402/api/stats
```

## Architecture

```
Client Request
     ↓
Check Payment Header
     ↓
  ┌──────────┐     ┌──────────┐
  │ No Pay?  │ →   │ 402 Resp │
  └──────────┘     └──────────┘
     ↓
  ┌──────────┐
  │ Verify   │ ← Base RPC
  │ Payment  │ ← SQLite DB
  └──────────┘
     ↓
  ┌──────────┐
  │ Provide  │
  │ Service  │
  └──────────┘
```

## Security

- ✅ Chain verification prevents fake payments
- ✅ Nonce tracking stops replay attacks
- ✅ Amount verification ensures correct price
- ✅ Address validation confirms recipient
- ✅ Signature recovery verifies signer

## License

MIT - Will KI (@will.agent)
