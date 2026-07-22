/**
 * Compression module for ShadowX Database
 */

const zlib = require('zlib');
const { ShadowXError, ErrorCodes } = require('./errors');

class Compression {
  /**
   * Compress data using gzip
   */
  static async compress(data) {
    try {
      return new Promise((resolve, reject) => {
        zlib.gzip(data, (error, compressed) => {
          if (error) {
            reject(new ShadowXError('Compression failed', ErrorCodes.COMPRESSION_ERROR, 500));
          } else {
            resolve(compressed.toString('base64'));
          }
        });
      });
    } catch (error) {
      throw new ShadowXError(
        `Compression failed: ${error.message}`,
        ErrorCodes.COMPRESSION_ERROR,
        500
      );
    }
  }

  /**
   * Decompress data using gzip
   */
  static async decompress(data) {
    try {
      return new Promise((resolve, reject) => {
        const buffer = Buffer.from(data, 'base64');
        zlib.gunzip(buffer, (error, decompressed) => {
          if (error) {
            reject(new ShadowXError('Decompression failed', ErrorCodes.COMPRESSION_ERROR, 500));
          } else {
            resolve(decompressed.toString('utf8'));
          }
        });
      });
    } catch (error) {
      throw new ShadowXError(
        `Decompression failed: ${error.message}`,
        ErrorCodes.COMPRESSION_ERROR,
        500
      );
    }
  }
}

module.exports = Compression;
