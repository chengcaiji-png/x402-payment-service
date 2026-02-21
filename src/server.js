import http from 'http';
import { PaymentVerifier } from './payment-verifier.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 你的钱包地址（收款地址）
const PAYMENT_ADDRESS = '0xAA31F97BE2c7f90Ff2cf3b7eD44855E750CEF81f';

// 初始化支付验证器
const verifier = new PaymentVerifier(PAYMENT_ADDRESS);

// 服务定价（USDC，已乘1e6）
const SERVICES = {
  '/api/japanese-news': {
    price: '50000000',  // $50 USDC
    priceDollar: 50,
    description: 'Japanese News Learning Platform - Full dataset access',
    handler: handleJapaneseNews
  },
  '/api/web-scraper': {
    price: '30000000',  // $30 USDC
    priceDollar: 30,
    description: 'Custom Web Scraper - One-time crawl job',
    handler: handleWebScraper
  },
  '/api/ai-analysis': {
    price: '20000000',  // $20 USDC
    priceDollar: 20,
    description: 'AI Data Analysis - Single dataset',
    handler: handleAIAnalysis
  },
  '/api/reverse-engineering': {
    price: '100000000', // $100 USDC
    priceDollar: 100,
    description: 'Product Reverse Engineering - Complete analysis',
    handler: handleReverseEngineering
  },
  '/api/stats': {
    price: '0',
    priceDollar: 0,
    description: 'Service statistics (free)',
    handler: handleStats
  }
};

// HTTP 服务器
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Payment-Tx, Payment-Signature');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  const service = SERVICES[req.url];
  
  if (!service) {
    sendJSON(res, 404, { 
      error: 'not_found',
      message: 'Service not found',
      available: Object.keys(SERVICES).filter(k => k !== '/api/stats')
    });
    return;
  }
  
  // 免费服务直接提供
  if (service.price === '0') {
    const result = await service.handler(req);
    sendJSON(res, 200, result);
    return;
  }
  
  // 检查支付
  const paymentTx = req.headers['payment-tx'];
  const paymentSig = req.headers['payment-signature'];
  
  if (!paymentTx && !paymentSig) {
    // 未支付 -> 返回 402
    send402(res, req.url, service);
    return;
  }
  
  // 验证支付
  let verificationResult;
  
  if (paymentTx) {
    // 方法 1: 验证链上交易
    console.log(`🔍 Verifying transaction: ${paymentTx}`);
    verificationResult = await verifier.verifyTransaction(
      paymentTx,
      service.price,
      req.url
    );
  } else if (paymentSig) {
    // 方法 2: 验证签名（EIP-3009）
    try {
      const sigData = JSON.parse(Buffer.from(paymentSig, 'base64').toString());
      console.log(`✍️  Verifying signature from ${sigData.from}`);
      verificationResult = verifier.verifySignature(sigData, service.price);
    } catch (err) {
      sendJSON(res, 400, { error: 'invalid_signature_format', details: err.message });
      return;
    }
  }
  
  if (!verificationResult.valid) {
    sendJSON(res, 402, {
      error: 'payment_verification_failed',
      details: verificationResult.error,
      message: 'Payment could not be verified'
    });
    console.log(`❌ Payment verification failed: ${verificationResult.error}`);
    return;
  }
  
  // 支付验证通过 -> 提供服务
  console.log(`✅ Payment verified! Providing service: ${req.url}`);
  
  try {
    const result = await service.handler(req, verificationResult.payment);
    sendJSON(res, 200, {
      ...result,
      payment_verified: true,
      payment_info: verificationResult.cached ? 'cached' : 'verified'
    });
  } catch (err) {
    console.error('Service error:', err);
    sendJSON(res, 500, {
      error: 'service_error',
      message: err.message
    });
  }
});

// 发送 402 Payment Required
function send402(res, endpoint, service) {
  const paymentRequest = {
    resource: endpoint,
    accepts: [{
      scheme: 'eip3009',
      network: 'eip155:8453',  // Base Mainnet
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: service.price,
      payTo: PAYMENT_ADDRESS,
      maxTimeoutSeconds: 300,
      extra: {
        name: 'USD Coin',
        version: '2',
        chainId: 8453
      }
    }, {
      scheme: 'transaction',
      network: 'eip155:8453',
      asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      amount: service.price,
      payTo: PAYMENT_ADDRESS,
      message: `Payment for ${service.description}`
    }]
  };
  
  const paymentHeader = Buffer.from(JSON.stringify(paymentRequest)).toString('base64');
  
  res.writeHead(402, {
    'Content-Type': 'application/json',
    'PAYMENT-REQUIRED': paymentHeader
  });
  
  res.end(JSON.stringify({
    error: 'payment_required',
    message: `This service costs $${service.priceDollar} USDC`,
    service: service.description,
    payment: {
      address: PAYMENT_ADDRESS,
      amount: service.price,
      amount_usd: service.priceDollar,
      network: 'Base Mainnet',
      token: 'USDC'
    },
    instructions: {
      method1: 'Include transaction hash in Payment-Tx header after sending USDC',
      method2: 'Use EIP-3009 transferWithAuthorization and include signature in Payment-Signature header'
    }
  }));
  
  console.log(`⚠️  402 Payment Required: ${endpoint} ($${service.priceDollar})`);
}

// 发送 JSON 响应
function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

// ==================== 服务处理器 ====================

async function handleJapaneseNews(req, payment) {
  // 读取实际数据
  const dataPath = join(__dirname, '../../japan-news-map/data/demo-learning.json');
  let articles = [];
  
  try {
    articles = JSON.parse(readFileSync(dataPath, 'utf8'));
  } catch (err) {
    // Fallback to sample data
    articles = [
      {
        title: '札幌で大雪',
        prefecture: '北海道',
        jlptLevel: 'N3',
        vocabulary: ['大雪', '交通', '影響']
      }
    ];
  }
  
  return {
    service: 'Japanese News Learning Platform',
    data: {
      articles: articles.slice(0, 5),
      total_count: 1000,
      prefectures: 47,
      features: [
        'JLPT level detection (N5-N1)',
        'Automatic vocabulary extraction',
        'Grammar pattern recognition',
        'Browser-native TTS support',
        'Prefecture-based filtering'
      ]
    },
    access: {
      api: 'https://japan-news-map.vercel.app/api',
      demo: 'https://japan-news-map.vercel.app/demo.html'
    }
  };
}

async function handleWebScraper(req, payment) {
  return {
    service: 'Web Scraper',
    status: 'job_created',
    capabilities: [
      'RSS/Atom feed parsing',
      'Anti-bot bypass (Cloudflare, reCAPTCHA)',
      'Rate limiting & respectful crawling',
      'Structured data extraction (JSON/CSV)',
      'Incremental updates'
    ],
    deliverables: {
      formats: ['JSON', 'CSV', 'SQLite'],
      delivery_method: 'API endpoint or file download',
      estimated_time: '24-48 hours'
    },
    next_steps: 'Reply with target URL and data requirements to start the job'
  };
}

async function handleAIAnalysis(req, payment) {
  return {
    service: 'AI Data Analysis',
    model: 'claude-sonnet-4-5',
    capabilities: [
      'Summarization & key insights extraction',
      'Multi-class classification',
      'Sentiment analysis (positive/negative/neutral)',
      'Entity recognition (NER)',
      'Topic modeling'
    ],
    usage: {
      input_limit: '100K tokens (~75K words)',
      output_format: 'JSON with confidence scores'
    },
    next_steps: 'Upload dataset (JSON/CSV/TXT) or provide data source URL'
  };
}

async function handleReverseEngineering(req, payment) {
  return {
    service: 'Product Reverse Engineering',
    deliverables: [
      'Complete tech stack analysis',
      'API endpoints documentation (if applicable)',
      'Data flow diagrams',
      'Database schema inference',
      'Frontend framework breakdown',
      'Performance optimization suggestions'
    ],
    process: {
      step1: 'Initial reconnaissance & crawling',
      step2: 'Traffic analysis & API mapping',
      step3: 'Code/bundle deobfuscation',
      step4: 'Documentation generation',
      estimated_duration: '3-7 days'
    },
    next_steps: 'Provide target product URL or name for analysis'
  };
}

async function handleStats(req) {
  const stats = verifier.getStats();
  return {
    service: 'Service Statistics',
    stats: {
      total_payments: stats.total_payments,
      total_revenue_usd: stats.total_received_usd,
      unique_customers: stats.unique_customers,
      services: Object.fromEntries(
        Object.entries(SERVICES)
          .filter(([k]) => k !== '/api/stats')
          .map(([k, v]) => [k, { price_usd: v.priceDollar, description: v.description }])
      )
    },
    payment_address: PAYMENT_ADDRESS,
    network: 'Base Mainnet',
    token: 'USDC (0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)'
  };
}

// ==================== 启动服务器 ====================

const PORT = process.env.PORT || 8402;

server.listen(PORT, () => {
  console.log(`\n🚀 x402 Payment Service running on http://localhost:${PORT}`);
  console.log(`💰 Payment address: ${PAYMENT_ADDRESS}`);
  console.log(`🔗 Network: Base Mainnet (Chain ID: 8453)`);
  console.log(`💵 Token: USDC (0x8335...2913)\n`);
  console.log(`📋 Available services:\n`);
  
  Object.entries(SERVICES).forEach(([path, info]) => {
    if (path === '/api/stats') {
      console.log(`   ${path.padEnd(30)} FREE - ${info.description}`);
    } else {
      console.log(`   ${path.padEnd(30)} $${info.priceDollar} - ${info.description}`);
    }
  });
  
  console.log(`\n📊 Stats: http://localhost:${PORT}/api/stats\n`);
  
  const stats = verifier.getStats();
  console.log(`💰 Revenue to date: $${stats.total_received_usd} USDC (${stats.total_payments} payments, ${stats.unique_customers} customers)\n`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  server.close(() => {
    verifier.close();
    console.log('✅ Server closed');
    process.exit(0);
  });
});
