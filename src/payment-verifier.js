import { ethers } from 'ethers';
import Database from 'better-sqlite3';

// Base Mainnet RPC
const BASE_RPC = 'https://mainnet.base.org';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// USDC ABI (只需要 Transfer 事件和 balanceOf)
const USDC_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address account) view returns (uint256)'
];

export class PaymentVerifier {
  constructor(paymentAddress, dbPath = './payments.db') {
    this.paymentAddress = paymentAddress.toLowerCase();
    this.provider = new ethers.JsonRpcProvider(BASE_RPC);
    this.usdcContract = new ethers.Contract(USDC_CONTRACT, USDC_ABI, this.provider);
    
    // 初始化数据库
    this.db = new Database(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS payments (
        tx_hash TEXT PRIMARY KEY,
        from_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        service TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        verified_at INTEGER NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS used_nonces (
        nonce TEXT PRIMARY KEY,
        used_at INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_from_address ON payments(from_address);
      CREATE INDEX IF NOT EXISTS idx_timestamp ON payments(timestamp);
    `);
    
    this.insertPayment = this.db.prepare(`
      INSERT OR IGNORE INTO payments (tx_hash, from_address, amount, service, timestamp, verified_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    this.markNonce = this.db.prepare(`
      INSERT OR IGNORE INTO used_nonces (nonce, used_at) VALUES (?, ?)
    `);
    
    this.checkNonce = this.db.prepare(`
      SELECT 1 FROM used_nonces WHERE nonce = ?
    `);
    
    this.getPayment = this.db.prepare(`
      SELECT * FROM payments WHERE tx_hash = ?
    `);
  }
  
  /**
   * 验证链上交易
   * @param {string} txHash - 交易哈希
   * @param {string} expectedAmount - 期望金额（USDC，6位小数）
   * @param {string} serviceName - 服务名称
   * @returns {Promise<{valid: boolean, error?: string, payment?: object}>}
   */
  async verifyTransaction(txHash, expectedAmount, serviceName) {
    try {
      // 1. 检查是否已验证过
      const existing = this.getPayment.get(txHash);
      if (existing) {
        return {
          valid: true,
          payment: existing,
          cached: true
        };
      }
      
      // 2. 获取交易收据
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      if (!receipt) {
        return { valid: false, error: 'Transaction not found or not confirmed' };
      }
      
      if (receipt.status !== 1) {
        return { valid: false, error: 'Transaction failed' };
      }
      
      // 3. 解析 Transfer 事件
      const transferLogs = receipt.logs
        .filter(log => log.address.toLowerCase() === USDC_CONTRACT.toLowerCase())
        .map(log => {
          try {
            return this.usdcContract.interface.parseLog({
              topics: log.topics,
              data: log.data
            });
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      
      // 4. 查找转账到我们地址的事件
      const ourTransfer = transferLogs.find(event => 
        event.args.to.toLowerCase() === this.paymentAddress
      );
      
      if (!ourTransfer) {
        return { valid: false, error: 'No transfer to payment address found' };
      }
      
      // 5. 验证金额
      const receivedAmount = ourTransfer.args.value.toString();
      if (receivedAmount !== expectedAmount) {
        return { 
          valid: false, 
          error: `Amount mismatch: expected ${expectedAmount}, received ${receivedAmount}` 
        };
      }
      
      // 6. 获取交易时间
      const block = await this.provider.getBlock(receipt.blockNumber);
      
      // 7. 存储验证记录
      const payment = {
        tx_hash: txHash,
        from_address: ourTransfer.args.from.toLowerCase(),
        amount: receivedAmount,
        service: serviceName,
        timestamp: block.timestamp,
        verified_at: Math.floor(Date.now() / 1000)
      };
      
      this.insertPayment.run(
        payment.tx_hash,
        payment.from_address,
        payment.amount,
        payment.service,
        payment.timestamp,
        payment.verified_at
      );
      
      return { valid: true, payment };
      
    } catch (error) {
      console.error('Payment verification error:', error);
      return { valid: false, error: error.message };
    }
  }
  
  /**
   * 验证 EIP-3009 签名
   * @param {object} transferData - 包含 v, r, s, from, to, value, validAfter, validBefore, nonce
   * @param {string} expectedAmount - 期望金额
   * @returns {{valid: boolean, error?: string}}
   */
  verifySignature(transferData, expectedAmount) {
    try {
      const { v, r, s, from, to, value, validAfter, validBefore, nonce } = transferData;
      
      // 1. 检查 nonce 是否已使用（防重放）
      if (this.checkNonce.get(nonce)) {
        return { valid: false, error: 'Nonce already used' };
      }
      
      // 2. 检查接收地址
      if (to.toLowerCase() !== this.paymentAddress) {
        return { valid: false, error: 'Invalid recipient address' };
      }
      
      // 3. 检查金额
      if (value !== expectedAmount) {
        return { valid: false, error: `Amount mismatch: expected ${expectedAmount}, got ${value}` };
      }
      
      // 4. 检查时间窗口
      const now = Math.floor(Date.now() / 1000);
      if (now < validAfter || now > validBefore) {
        return { valid: false, error: 'Signature expired or not yet valid' };
      }
      
      // 5. 验证签名（EIP-3009 格式）
      const domain = {
        name: 'USD Coin',
        version: '2',
        chainId: 8453,
        verifyingContract: USDC_CONTRACT
      };
      
      const types = {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' }
        ]
      };
      
      const message = {
        from,
        to,
        value,
        validAfter,
        validBefore,
        nonce
      };
      
      const digest = ethers.TypedDataEncoder.hash(domain, types, message);
      const recoveredAddress = ethers.recoverAddress(digest, { v, r, s });
      
      if (recoveredAddress.toLowerCase() !== from.toLowerCase()) {
        return { valid: false, error: 'Invalid signature' };
      }
      
      // 6. 标记 nonce 为已使用
      this.markNonce.run(nonce, now);
      
      return { valid: true, signer: recoveredAddress };
      
    } catch (error) {
      console.error('Signature verification error:', error);
      return { valid: false, error: error.message };
    }
  }
  
  /**
   * 获取支付历史
   * @param {string} address - 用户地址
   * @returns {Array} 支付记录
   */
  getPaymentHistory(address) {
    const stmt = this.db.prepare(`
      SELECT * FROM payments 
      WHERE from_address = ? 
      ORDER BY verified_at DESC 
      LIMIT 100
    `);
    return stmt.all(address.toLowerCase());
  }
  
  /**
   * 获取统计信息
   */
  getStats() {
    const totalPayments = this.db.prepare('SELECT COUNT(*) as count FROM payments').get();
    const totalAmount = this.db.prepare('SELECT SUM(CAST(amount AS INTEGER)) as total FROM payments').get();
    const uniqueCustomers = this.db.prepare('SELECT COUNT(DISTINCT from_address) as count FROM payments').get();
    
    return {
      total_payments: totalPayments.count,
      total_received: totalAmount.total || '0',
      unique_customers: uniqueCustomers.count,
      total_received_usd: (parseFloat(totalAmount.total || '0') / 1e6).toFixed(2)
    };
  }
  
  close() {
    this.db.close();
  }
}
