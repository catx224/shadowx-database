/**
 * Collection manager for ShadowX Database
 */

const Utils = require('./utils');
const { ShadowXError, ErrorCodes } = require('./errors');

class CollectionManager {
  constructor(github, collectionName) {
    this.github = github;
    this.collection = collectionName;
    this.data = null;
    this.loaded = false;
  }

  /**
   * Load collection data
   */
  async load() {
    if (this.loaded) return;
    this.data = await this.github.getCollection(this.collection);
    this.loaded = true;
  }

  /**
   * Save collection data
   */
  async save() {
    if (!this.loaded) return;
    await this.github.updateCollection(this.collection, this.data);
  }

  /**
   * Get value by key
   */
  async get(key) {
    await this.load();
    
    if (!key) {
      return this.data;
    }

    Utils.validateKey(key);
    return Utils.getNested(this.data, key);
  }

  /**
   * Set value by key
   */
  async set(key, value) {
    await this.load();
    
    if (!key) {
      throw new ShadowXError('Key is required', ErrorCodes.INVALID_KEY, 400);
    }

    Utils.validateKey(key);

    const parts = key.split('.');
    const lastKey = parts.pop();
    
    if (parts.length === 0) {
      this.data[key] = value;
    } else {
      let current = this.data;
      for (const part of parts) {
        if (!current[part] || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part];
      }
      current[lastKey] = value;
    }

    await this.save();
    return value;
  }

  /**
   * Delete key
   */
  async delete(key) {
    await this.load();
    
    if (!key) {
      throw new ShadowXError('Key is required', ErrorCodes.INVALID_KEY, 400);
    }

    Utils.validateKey(key);

    const parts = key.split('.');
    const lastKey = parts.pop();
    
    if (parts.length === 0) {
      delete this.data[key];
    } else {
      let current = this.data;
      for (const part of parts) {
        if (!current[part] || typeof current[part] !== 'object') {
          return;
        }
        current = current[part];
      }
      delete current[lastKey];
    }

    await this.save();
  }

  /**
   * Check if key exists
   */
  async has(key) {
    await this.load();
    
    if (!key) {
      return false;
    }

    Utils.validateKey(key);
    const value = Utils.getNested(this.data, key);
    return value !== undefined;
  }

  /**
   * Add to numeric value
   */
  async add(path, number) {
    await this.load();
    
    if (!path) {
      throw new ShadowXError('Path is required', ErrorCodes.INVALID_PATH, 400);
    }

    if (!Utils.isNumber(number)) {
      throw new ShadowXError('Value must be a number', ErrorCodes.INVALID_VALUE, 400);
    }

    Utils.validateKey(path);
    
    const currentValue = Utils.getNested(this.data, path);
    const newValue = (currentValue || 0) + number;
    
    Utils.setNested(this.data, path, newValue);
    await this.save();
    
    return newValue;
  }

  /**
   * Subtract from numeric value
   */
  async subtract(path, number) {
    return this.add(path, -number);
  }

  /**
   * Push to array
   */
  async push(path, value) {
    await this.load();
    
    if (!path) {
      throw new ShadowXError('Path is required', ErrorCodes.INVALID_PATH, 400);
    }

    Utils.validateKey(path);
    
    let currentValue = Utils.getNested(this.data, path);
    
    if (!currentValue) {
      currentValue = [];
      Utils.setNested(this.data, path, currentValue);
    } else if (!Utils.isArray(currentValue)) {
      throw new ShadowXError('Value at path is not an array', ErrorCodes.INVALID_VALUE, 400);
    }

    if (Array.isArray(value)) {
      currentValue.push(...value);
    } else {
      currentValue.push(value);
    }

    await this.save();
    return currentValue;
  }

  /**
   * Pull from array
   */
  async pull(path, value) {
    await this.load();
    
    if (!path) {
      throw new ShadowXError('Path is required', ErrorCodes.INVALID_PATH, 400);
    }

    Utils.validateKey(path);
    
    const currentValue = Utils.getNested(this.data, path);
    
    if (!currentValue) {
      return;
    }

    if (!Utils.isArray(currentValue)) {
      throw new ShadowXError('Value at path is not an array', ErrorCodes.INVALID_VALUE, 400);
    }

    const valuesToRemove = Array.isArray(value) ? value : [value];
    
    for (let i = currentValue.length - 1; i >= 0; i--) {
      if (valuesToRemove.some(v => JSON.stringify(v) === JSON.stringify(currentValue[i]))) {
        currentValue.splice(i, 1);
      }
    }

    await this.save();
    return currentValue;
  }

  /**
   * Ensure key exists with default value
   */
  async ensure(key, defaultValue) {
    await this.load();
    
    if (!key) {
      throw new ShadowXError('Key is required', ErrorCodes.INVALID_KEY, 400);
    }

    Utils.validateKey(key);
    
    const currentValue = Utils.getNested(this.data, key);
    
    if (currentValue === undefined) {
      Utils.setNested(this.data, key, defaultValue);
      await this.save();
      return defaultValue;
    }

    return currentValue;
  }

  /**
   * Get all entries
   */
  async all() {
    await this.load();
    return Utils.deepClone(this.data);
  }

  /**
   * Get all keys
   */
  async keys() {
    await this.load();
    return Object.keys(this.data);
  }

  /**
   * Get all values
   */
  async values() {
    await this.load();
    return Object.values(this.data);
  }

  /**
   * Get size of collection
   */
  async size() {
    await this.load();
    return Object.keys(this.data).length;
  }

  /**
   * Clear collection
   */
  async clear() {
    await this.load();
    this.data = {};
    await this.save();
  }

  /**
   * Find entries matching callback
   */
  async find(callback) {
    await this.load();
    
    if (typeof callback !== 'function') {
      throw new ShadowXError('Callback must be a function', ErrorCodes.INVALID_VALUE, 400);
    }

    const results = [];
    for (const [key, value] of Object.entries(this.data)) {
      try {
        if (callback(key, value)) {
          results.push({ key, value: Utils.deepClone(value) });
        }
      } catch (error) {
        // Skip entries that cause errors
      }
    }

    return results;
  }

  /**
   * Filter entries matching callback
   */
  async filter(callback) {
    const results = await this.find(callback);
    const filtered = {};
    for (const result of results) {
      filtered[result.key] = result.value;
    }
    return filtered;
  }

  /**
   * Get random entry
   */
  async random() {
    await this.load();
    
    const keys = Object.keys(this.data);
    if (keys.length === 0) return null;
    
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    return {
      key: randomKey,
      value: Utils.deepClone(this.data[randomKey])
    };
  }

  /**
   * Get random key
   */
  async randomKey() {
    await this.load();
    
    const keys = Object.keys(this.data);
    if (keys.length === 0) return null;
    
    return keys[Math.floor(Math.random() * keys.length)];
  }

  /**
   * Batch operations
   */
  async setMany(entries) {
    await this.load();
    
    if (!Array.isArray(entries)) {
      throw new ShadowXError('Entries must be an array', ErrorCodes.INVALID_VALUE, 400);
    }

    for (const entry of entries) {
      if (!entry.key || entry.value === undefined) {
        throw new ShadowXError('Each entry must have key and value', ErrorCodes.INVALID_VALUE, 400);
      }
      Utils.validateKey(entry.key);
      Utils.setNested(this.data, entry.key, entry.value);
    }

    await this.save();
  }

  async deleteMany(keys) {
    await this.load();
    
    if (!Array.isArray(keys)) {
      throw new ShadowXError('Keys must be an array', ErrorCodes.INVALID_VALUE, 400);
    }

    for (const key of keys) {
      Utils.validateKey(key);
      Utils.deleteNested(this.data, key);
    }

    await this.save();
  }

  async updateMany(updates) {
    await this.load();
    
    if (!Array.isArray(updates)) {
      throw new ShadowXError('Updates must be an array', ErrorCodes.INVALID_VALUE, 400);
    }

    for (const update of updates) {
      if (!update.key || update.value === undefined) {
        throw new ShadowXError('Each update must have key and value', ErrorCodes.INVALID_VALUE, 400);
      }
      Utils.validateKey(update.key);
      const currentValue = Utils.getNested(this.data, update.key);
      if (currentValue !== undefined) {
        Utils.setNested(this.data, update.key, 
          typeof currentValue === 'object' && !Array.isArray(currentValue)
            ? Utils.deepMerge(currentValue, update.value)
            : update.value
        );
      }
    }

    await this.save();
  }

  async getMany(keys) {
    await this.load();
    
    if (!Array.isArray(keys)) {
      throw new ShadowXError('Keys must be an array', ErrorCodes.INVALID_VALUE, 400);
    }

    const results = {};
    for (const key of keys) {
      Utils.validateKey(key);
      results[key] = Utils.getNested(this.data, key);
    }
    return results;
  }

  /**
   * Set the data directly
   */
  setData(data) {
    this.data = data || {};
    this.loaded = true;
  }
}

module.exports = CollectionManager;
