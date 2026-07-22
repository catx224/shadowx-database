/**
 * Utility functions for ShadowX Database
 */

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

class Utils {
  /**
   * Generate a SHA-256 hash
   */
  static sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate a random ID
   */
  static randomId(length = 16) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate project ID from package.json and directory
   */
  static generateProjectId(projectPath = process.cwd()) {
    try {
      const packagePath = path.join(projectPath, 'package.json');
      let packageName = 'unknown-project';
      
      if (fs.existsSync(packagePath)) {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        packageName = pkg.name || 'unknown-project';
      }

      const dirName = path.basename(projectPath);
      const salt = crypto.randomBytes(8).toString('hex');
      const hash = this.sha256(`${packageName}-${dirName}-${salt}-${Date.now()}`);
      
      return hash.substring(0, 10);
    } catch (error) {
      return this.randomId(10);
    }
  }

  /**
   * Save project ID to local config
   */
  static saveProjectId(projectId, projectPath = process.cwd()) {
    const configDir = path.join(projectPath, '.shadowx');
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    const configPath = path.join(configDir, 'config.json');
    const config = {
      projectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return config;
  }

  /**
   * Load project ID from local config
   */
  static loadProjectId(projectPath = process.cwd()) {
    const configPath = path.join(projectPath, '.shadowx', 'config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config.projectId;
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  /**
   * Get or create project ID
   */
  static getOrCreateProjectId(projectPath = process.cwd()) {
    let projectId = this.loadProjectId(projectPath);
    
    if (!projectId) {
      projectId = this.generateProjectId(projectPath);
      this.saveProjectId(projectId, projectPath);
    }
    
    return projectId;
  }

  /**
   * Validate key for path traversal
   */
  static validateKey(key) {
    if (!key || typeof key !== 'string') {
      throw new Error('Key must be a non-empty string');
    }

    if (key.includes('..') || key.includes('/') || key.includes('\\')) {
      throw new Error('Key contains invalid characters');
    }

    const invalidChars = /[<>:"|?*]/;
    if (invalidChars.test(key)) {
      throw new Error('Key contains invalid characters');
    }

    return true;
  }

  /**
   * Validate collection name
   */
  static validateCollection(collection) {
    if (!collection || typeof collection !== 'string') {
      throw new Error('Collection name must be a non-empty string');
    }

    const invalidChars = /[<>:"/\\|?*.]/;
    if (invalidChars.test(collection)) {
      throw new Error('Collection name contains invalid characters');
    }

    return true;
  }

  /**
   * Nested object getter
   */
  static getNested(obj, path) {
    if (!path) return obj;
    
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }

  /**
   * Nested object setter
   */
  static setNested(obj, path, value) {
    if (!path) {
      return value;
    }

    const parts = path.split('.');
    const last = parts.pop();
    let current = obj;

    for (const part of parts) {
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[last] = value;
    return obj;
  }

  /**
   * Nested object deleter
   */
  static deleteNested(obj, path) {
    if (!path) {
      return;
    }

    const parts = path.split('.');
    const last = parts.pop();
    let current = obj;

    for (const part of parts) {
      if (!current[part] || typeof current[part] !== 'object') {
        return;
      }
      current = current[part];
    }

    delete current[last];
  }

  /**
   * Deep clone object
   */
  static deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Deep merge objects
   */
  static deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Sleep helper
   */
  static sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Exponential backoff
   */
  static async retry(fn, attempts = 3, delay = 1000) {
    let lastError;
    
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < attempts - 1) {
          const waitTime = delay * Math.pow(2, i);
          await this.sleep(waitTime);
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Check if value is a number
   */
  static isNumber(value) {
    return typeof value === 'number' && !isNaN(value);
  }

  /**
   * Check if value is an array
   */
  static isArray(value) {
    return Array.isArray(value);
  }

  /**
   * Check if value is an object
   */
  static isObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Sanitize filename
   */
  static sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*.]/g, '_');
  }
}

module.exports = Utils;
