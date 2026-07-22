/**
 * Sync manager for ShadowX Database
 */

const { EventEmitter } = require('events');
const Utils = require('./utils');

class SyncManager extends EventEmitter {
  constructor(database, options = {}) {
    super();
    this.database = database;
    this.interval = options.interval || 30000;
    this.enabled = options.enabled !== false;
    this.timer = null;
    this.syncing = false;
    this.lastSync = null;
    this.collectionHashes = new Map();
  }

  /**
   * Start auto-sync
   */
  start() {
    if (!this.enabled) return;
    
    if (this.timer) {
      this.stop();
    }

    this.timer = setInterval(() => {
      this.sync();
    }, this.interval);

    this.emit('started');
    this.log('Auto-sync started');
  }

  /**
   * Stop auto-sync
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.emit('stopped');
      this.log('Auto-sync stopped');
    }
  }

  /**
   * Perform sync
   */
  async sync() {
    if (this.syncing) {
      this.log('Sync already in progress, skipping...');
      return;
    }

    this.syncing = true;
    this.emit('sync-start');

    try {
      const collections = await this.database.listCollections();
      
      for (const collection of collections) {
        await this.syncCollection(collection);
      }

      this.lastSync = new Date();
      this.emit('sync-complete', { collections: collections.length });
      this.log(`Sync completed, ${collections.length} collections synced`);
    } catch (error) {
      this.emit('sync-error', error);
      this.log(`Sync error: ${error.message}`);
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Sync a single collection
   */
  async syncCollection(collection) {
    try {
      const currentData = await this.database.get(collection);
      const currentHash = this.computeHash(currentData);
      
      const lastHash = this.collectionHashes.get(collection);
      if (lastHash === currentHash) {
        return;
      }

      const cachedData = this.database.cache.get(collection);
      
      if (cachedData) {
        const mergedData = this.database.github.mergeData(cachedData, currentData);
        this.database.cache.set(collection, mergedData);
        await this.database.set(collection, null, mergedData);
      } else {
        this.database.cache.set(collection, currentData);
      }

      this.collectionHashes.set(collection, currentHash);
      this.emit('collection-synced', collection);
      
      this.log(`Collection ${collection} synced`);
    } catch (error) {
      this.emit('collection-sync-error', { collection, error });
      this.log(`Error syncing ${collection}: ${error.message}`);
    }
  }

  /**
   * Compute hash of data
   */
  computeHash(data) {
    return Utils.sha256(JSON.stringify(data || {}));
  }

  /**
   * Force sync all collections
   */
  async forceSync() {
    await this.sync();
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      running: this.timer !== null,
      syncing: this.syncing,
      lastSync: this.lastSync,
      interval: this.interval,
      collections: this.collectionHashes.size
    };
  }

  /**
   * Log message
   */
  log(message) {
    if (this.database.options.verbose) {
      console.log(`[ShadowX Sync] ${message}`);
    }
  }
}

module.exports = SyncManager;
