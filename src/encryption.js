/**
 * Encryption module for ShadowX Database
 */

const crypto = require('crypto');
const { ShadowXError, ErrorCodes } = require('./errors');

class Encryption {
  constructor(key) {
    if (!key || typeof key !== 'string' || key.length < 32) {
      throw new ShadowXError(
        'Encryption key must be at least 32 characters',
        ErrorCodes.ENCRYPTION_ERROR,
        400
      );
    }

    this.key = crypto.createHash('sha256').update(key).digest();
    this.algorithm = 'aes-256-gcm';
  }

  /**
   * Encrypt data
   */
  async encrypt(data) {
    try {
      if (typeof data === 'object') {
        data = JSON.stringify(data);
      }

      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();

      const result = {
        iv: iv.toString('hex'),
        data: encrypted,
        tag: authTag.toString('hex')
      };

      return JSON.stringify(result);
    } catch (error) {
      throw new ShadowXError(
        `Encryption failed: ${error.message}`,
        ErrorCodes.ENCRYPTION_ERROR,
        500
      );
    }
  }

  /**
   * Decrypt data
   */
  async decrypt(data) {
    try {
      const parsed = JSON.parse(data);
      
      const iv = Buffer.from(parsed.iv, 'hex');
      const authTag = Buffer.from(parsed.tag, 'hex');
      const encrypted = parsed.data;

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      throw new ShadowXError(
        `Decryption failed: ${error.message}`,
        ErrorCodes.ENCRYPTION_ERROR,
        500
      );
    }
  }
}

module.exports = Encryption;
