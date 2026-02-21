#!/usr/bin/env node
/**
 * x402 Service Test Client
 * 测试支付服务的功能
 */

const BASE_URL = process.env.SERVICE_URL || 'http://localhost:8402';

async function testService(endpoint, paymentTx = null) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${endpoint}`);
  console.log('='.repeat(60));
  
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (paymentTx) {
    headers['Payment-Tx'] = paymentTx;
    console.log(`💳 Using payment tx: ${paymentTx.slice(0, 10)}...${paymentTx.slice(-8)}`);
  }
  
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, { headers });
    const status = response.status;
    const data = await response.json();
    
    console.log(`\n📡 Response Status: ${status}`);
    
    if (status === 402) {
      console.log(`\n💰 Payment Required:`);
      console.log(`   Service: ${data.service}`);
      console.log(`   Price: $${data.payment.amount_usd} USDC`);
      console.log(`   Address: ${data.payment.address}`);
      console.log(`   Network: ${data.payment.network}`);
      console.log(`\n💡 To pay:`);
      console.log(`   1. Send ${data.payment.amount_usd} USDC on Base to: ${data.payment.address}`);
      console.log(`   2. Run: node test-client.js ${endpoint} <tx_hash>`);
    } else if (status === 200) {
      console.log(`\n✅ Success! Service provided:`);
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(`\n❌ Error:`);
      console.log(JSON.stringify(data, null, 2));
    }
    
  } catch (error) {
    console.error(`\n❌ Request failed:`, error.message);
  }
}

async function testStats() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Service Statistics (FREE)`);
  console.log('='.repeat(60));
  
  try {
    const response = await fetch(`${BASE_URL}/api/stats`);
    const data = await response.json();
    
    console.log(`\n📊 Stats:`);
    console.log(`   Total Payments: ${data.stats.total_payments}`);
    console.log(`   Revenue: $${data.stats.total_revenue_usd} USDC`);
    console.log(`   Unique Customers: ${data.stats.unique_customers}`);
    console.log(`\n💰 Services:`);
    
    Object.entries(data.stats.services).forEach(([path, info]) => {
      console.log(`   ${path.padEnd(30)} $${info.price_usd}`);
    });
    
  } catch (error) {
    console.error(`\n❌ Request failed:`, error.message);
  }
}

// Main
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
x402 Service Test Client
========================

Usage:
  node test-client.js <endpoint> [tx_hash]

Examples:
  # Test without payment (will get 402)
  node test-client.js /api/japanese-news
  
  # Test with payment verification
  node test-client.js /api/japanese-news 0xYOUR_TX_HASH
  
  # Check stats (free)
  node test-client.js /api/stats

Available endpoints:
  /api/japanese-news        ($50)
  /api/web-scraper          ($30)
  /api/ai-analysis          ($20)
  /api/reverse-engineering  ($100)
  /api/stats                (FREE)
`);
  process.exit(0);
}

const endpoint = args[0];
const txHash = args[1];

if (endpoint === '/api/stats') {
  testStats();
} else {
  testService(endpoint, txHash);
}
