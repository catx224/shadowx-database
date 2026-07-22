/**
 * Main Database class for ShadowX Database
 * Developed by Mueid Mursalin Rifat
 */

const { EventManager, EventTypes } = require('./events');
const GitHubManager = require('./github');
const CollectionManager = require('./collection');
const CacheManager = require('./cache');
const SyncManager = require('./sync');
const Transaction = require('./transaction');
const Encryption = require('./encryption');
const RepositoryManager = require('./repository-manager');
const RepositoryRouter = require('./repository-router');
const Utils = require('./utils');
const { ShadowXError, ErrorCodes } = require('./errors');

class Database extends EventManager {
  constructor(options = {}) {
    super({
      maxListeners: options.maxListeners || 50,
      historyLimit: options.historyLimit || 100
    });
    
    // Validate required options
    if (!options.token) {
      throw new ShadowXError('GitHub token is required', ErrorCodes.INVALID_TOKEN, 400);
    }
    
    if (!options.owner) {
      throw new ShadowXError('GitHub owner is required', ErrorCodes.INVALID_TOKEN, 400);
    }
    
    if (!options.repo) {
      throw new ShadowXError('GitHub repository is required', ErrorCodes.REPOSITORY_NOT_FOUND, 400);
    }

    // Merge options with defaults
    this.options = {
      ...options,
      branch: options.branch || 'main',
      projectId: options.projectId || null,
      encryptionKey: options.encryptionKey || null,
      compression: options.compression || false,
      verbose: options.verbose || false,
      cacheTTL: options.cacheTTL || 60000,
      syncInterval: options.syncInterval || 30000,
      autoSync: options.autoSync !== false,
      retryAttempts: options.retryAttempts || 3,
      retryDelay: options.retryDelay || 1000,
      scalingEnabled: options.scalingEnabled !== false,
      maxRepoSize: options.maxRepoSize || 100 * 1024 * 1024, // 100MB
      repoPrefix: options.repoPrefix || 'shadow-storage',
      maxListeners: options.maxListeners || 50,
      historyLimit: options.historyLimit || 100
    };

    // Get or generate project ID
    if (!this.options.projectId) {
      this.options.projectId = Utils.getOrCreateProjectId();
    }

    // Initialize encryption if key provided
    let encryption = null;
    if (this.options.encryptionKey) {
      encryption = new Encryption(this.options.encryptionKey);
    }

    // Initialize GitHub manager
    this.github = new GitHubManager({
      token: this.options.token,
      owner: this.options.owner,
      repo: this.options.repo,
      branch: this.options.branch,
      projectId: this.options.projectId,
      encryption: encryption,
      compression: this.options.compression,
      verbose: this.options.verbose
    });

    // Initialize repository manager
    this.repositoryManager = new RepositoryManager({
      token: this.options.token,
      owner: this.options.owner,
      repo: this.options.repo,
      branch: this.options.branch,
      projectId: this.options.projectId,
      verbose: this.options.verbose,
      scalingEnabled: this.options.scalingEnabled,
      maxRepoSize: this.options.maxRepoSize,
      repoPrefix: this.options.repoPrefix,
      github: this.github
    });
    
    // Set event emitter for repository manager
    this.repositoryManager.setEventEmitter(this);

    // Initialize repository router
    this.router = new RepositoryRouter(this.repositoryManager, this.github);

    // Initialize cache
    this.cache = new CacheManager({
      ttl: this.options.cacheTTL,
      maxSize: this.options.cacheMaxSize || 1000
    });

    // Initialize sync manager
    this.sync = new SyncManager(this, {
      interval: this.options.syncInterval,
      enabled: this.options.autoSync
    });

    // Bind sync events
    this.sync.on('started', () => {
      this.emit(EventTypes.SYNC, { status: 'started' });
    });

    this.sync.on('stopped', () => {
      this.emit(EventTypes.SYNC, { status: 'stopped' });
    });

    this.sync.on('sync-start', () => {
      this.emit(EventTypes.SYNC_START);
    });

    this.sync.on('sync-complete', (data) => {
      this.emit(EventTypes.SYNC_COMPLETE, data);
      this.emit(EventTypes.SYNC, { status: 'complete', data });
    });

    this.sync.on('sync-error', (error) => {
      this.emit(EventTypes.SYNC_ERROR, error);
      this.emit(EventTypes.ERROR, error);
    });

    this.sync.on('collection-synced', (collection) => {
      this.emit(EventTypes.COLLECTION_SYNCED, { collection });
    });

    this.connected = false;
    this.ready = false;
    this.startTime = null;

    this.log('Database initialized with project ID:', this.options.projectId);
  }

  /**
   * Connect to GitHub
   */
  async connect() {
    try {
      this.startTime = Date.now();
      this.emit(EventTypes.CONNECTING);
      
      // Initialize GitHub
      await this.github.initialize();
      
      // Initialize repository manager
      await this.repositoryManager.initialize();
      
      this.connected = true;
      this.ready = true;
      
      // Start auto-sync
      if (this.options.autoSync) {
        this.sync.start();
      }
      
      this.emit(EventTypes.CONNECT);
      this.emit(EventTypes.READY);
      
      this.log('Connected to GitHub successfully');
      
      // Get repository stats
      const stats = await this.repositoryManager.getRepositoryStats();
      this.log(`Repository stats: ${stats.total} total, ${stats.active.length} active`);
      
      // Emit performance event
      const connectTime = Date.now() - this.startTime;
      this.emit(EventTypes.PERFORMANCE, {
        operation: 'connect',
        duration: connectTime,
        repositoryCount: stats.total
      });
      
      return this;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Disconnect from GitHub
   */
  async disconnect() {
    try {
      this.emit(EventTypes.DISCONNECTING);
      
      // Stop auto-sync
      this.sync.stop();
      
      this.connected = false;
      this.ready = false;
      
      this.emit(EventTypes.DISCONNECT);
      this.log('Disconnected from GitHub');
      
      // Clear event history on disconnect
      if (this.options.clearHistoryOnDisconnect) {
        this.clearHistory();
      }
      
      return this;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Set a value
   */
  async set(collection, key, value) {
    this.ensureConnected();
    const startTime = Date.now();
    
    this.emit(EventTypes.SET, { collection, key });
    
    try {
      const manager = await this.getCollectionManager(collection);
      const result = await manager.set(key, value);
      
      // Clear cache for this collection
      this.cache.delete(`${collection}:${key}`);
      this.cache.delete(`${collection}:*`);
      
      this.emit(EventTypes.SAVE, { collection, key });
      this.emit(EventTypes.SAVE_COMPLETE, { collection, key });
      
      // Performance tracking
      const duration = Date.now() - startTime;
      this.emit(EventTypes.PERFORMANCE, {
        operation: 'set',
        collection,
        key,
        duration
      });
      
      return result;
    } catch (error) {
      this.emit(EventTypes.SAVE_ERROR, { collection, key, error });
      throw error;
    }
  }

  /**
   * Get a value
   */
  async get(collection, key) {
    this.ensureConnected();
    const startTime = Date.now();
    
    const cacheKey = `${collection}:${key || '*'}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached !== null) {
      this.emit(EventTypes.CACHE, true);
      this.emit(EventTypes.CACHE_HIT, { collection, key });
      
      // Performance tracking
      const duration = Date.now() - startTime;
      this.emit(EventTypes.PERFORMANCE, {
        operation: 'get',
        collection,
        key,
        duration,
        cache: true
      });
      
      return cached;
    }
    
    this.emit(EventTypes.CACHE, false);
    this.emit(EventTypes.CACHE_MISS, { collection, key });
    
    try {
      const manager = await this.getCollectionManager(collection);
      const result = await manager.get(key);
      
      // Cache the result
      this.cache.set(cacheKey, result);
      
      this.emit(EventTypes.GET, { collection, key });
      
      // Performance tracking
      const duration = Date.now() - startTime;
      this.emit(EventTypes.PERFORMANCE, {
        operation: 'get',
        collection,
        key,
        duration,
        cache: false
      });
      
      return result;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Fetch alias for get
   */
  async fetch(collection, key) {
    return this.get(collection, key);
  }

  /**
   * Delete a value
   */
  async delete(collection, key) {
    this.ensureConnected();
    this.emit(EventTypes.DELETE, { collection, key });
    
    try {
      const manager = await this.getCollectionManager(collection);
      await manager.delete(key);
      
      // Clear cache
      this.cache.delete(`${collection}:${key}`);
      this.cache.delete(`${collection}:*`);
      
      this.emit(EventTypes.SAVE, { collection });
      this.emit(EventTypes.SAVE_COMPLETE, { collection });
      
      return true;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Check if key exists
   */
  async has(collection, key) {
    this.ensureConnected();
    
    try {
      const manager = await this.getCollectionManager(collection);
      return manager.has(key);
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Add to numeric value
   */
  async add(collection, path, number) {
    this.ensureConnected();
    this.emit(EventTypes.ADD, { collection, path, number });
    
    try {
      const manager = await this.getCollectionManager(collection);
      const result = await manager.add(path, number);
      
      // Clear cache
      this.cache.delete(`${collection}:*`);
      
      this.emit(EventTypes.SAVE, { collection });
      this.emit(EventTypes.SAVE_COMPLETE, { collection });
      
      return result;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Subtract from numeric value
   */
  async subtract(collection, path, number) {
    this.ensureConnected();
    this.emit(EventTypes.SUBTRACT, { collection, path, number });
    
    try {
      const manager = await this.getCollectionManager(collection);
      const result = await manager.subtract(path, number);
      
      this.cache.delete(`${collection}:*`);
      
      this.emit(EventTypes.SAVE, { collection });
      this.emit(EventTypes.SAVE_COMPLETE, { collection });
      
      return result;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Push to array
   */
  async push(collection, path, value) {
    this.ensureConnected();
    this.emit(EventTypes.PUSH, { collection, path, value });
    
    try {
      const manager = await this.getCollectionManager(collection);
      const result = await manager.push(path, value);
      
      this.cache.delete(`${collection}:*`);
      
      this.emit(EventTypes.SAVE, { collection });
      this.emit(EventTypes.SAVE_COMPLETE, { collection });
      
      return result;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Pull from array
   */
  async pull(collection, path, value) {
    this.ensureConnected();
    this.emit(EventTypes.PULL, { collection, path, value });
    
    try {
      const manager = await this.getCollectionManager(collection);
      const result = await manager.pull(path, value);
      
      this.cache.delete(`${collection}:*`);
      
      this.emit(EventTypes.SAVE, { collection });
      this.emit(EventTypes.SAVE_COMPLETE, { collection });
      
      return result;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Ensure key exists with default value
   */
  async ensure(collection, key, defaultValue) {
    this.ensureConnected();
    this.emit(EventTypes.ENSURE, { collection, key });
    
    try {
      const manager = await this.getCollectionManager(collection);
      const result = await manager.ensure(key, defaultValue);
      
      this.cache.delete(`${collection}:${key}`);
      
      this.emit(EventTypes.SAVE, { collection });
      this.emit(EventTypes.SAVE_COMPLETE, { collection });
      
      return result;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Get all entries
   */
  async all(collection) {
    this.ensureConnected();
    
    try {
      const manager = await this.getCollectionManager(collection);
      return manager.all();
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Get all keys
   */
  async keys(collection) {
    this.ensureConnected();
    
    try {
      const manager = await this.getCollectionManager(collection);
      return manager.keys();
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Get all values
   */
  async values(collection) {
    this.ensureConnected();
    
    try {
      const manager = await this.getCollectionManager(collection);
      return manager.values();
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Get size of collection
   */
  async size(collection) {
    this.ensureConnected();
    
    try {
      const manager = await this.getCollectionManager(collection);
      return manager.size();
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Clear collection
   */
  async clear(collection) {
    this.ensureConnected();
    this.emit(EventTypes.CLEAR, { collection });
    
    try {
      const manager = await this.getCollectionManager(collection);
      await manager.clear();
      
      this.cache.delete(`${collection}:*`);
      
      this.emit(EventTypes.SAVE, { collection });
      this.emit(EventTypes.SAVE_COMPLETE, { collection });
      
      return true;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Find entries matching callback
   */
  async find(collection, callback) {
    this.ensureConnected();
    
    try {
      const manager = await this.getCollectionManager(collection);
      return manager.find(callback);
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Filter entries
   */
  async filter(collection, callback) {
    this.ensureConnected();
    
    try {
      const manager = await this.getCollectionManager(collection);
      return manager.filter(callback);
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Get random entry
   */
  async random(collection) {
    this.ensureConnected();
    
    try {
      const manager = await this.getCollectionManager(collection);
      return manager.random();
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Get random key
   */
  async randomKey(collection) {
    this.ensureConnected();
    
    try {
      const manager = await this.getCollectionManager(collection);
      return manager.randomKey();
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Batch operations
   */
  async setMany(collection, entries) {
    this.ensureConnected();
    this.emit(EventTypes.SET_MANY, { collection, count: entries.length });
    
    try {
      const manager = await this.getCollectionManager(collection);
      await manager.setMany(entries);
      
      this.cache.delete(`${collection}:*`);
      
      this.emit(EventTypes.SAVE, { collection });
      this.emit(EventTypes.SAVE_COMPLETE, { collection });
      
      return true;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  async getMany(collection, keys) {
    this.ensureConnected();
    this.emit(EventTypes.GET_MANY, { collection, count: keys.length });
    
    try {
      const manager = await this.getCollectionManager(collection);
      return manager.getMany(keys);
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  async deleteMany(collection, keys) {
    this.ensureConnected();
    this.emit(EventTypes.DELETE_MANY, { collection, count: keys.length });
    
    try {
      const manager = await this.getCollectionManager(collection);
      await manager.deleteMany(keys);
      
      // Clear cache for all deleted keys
      for (const key of keys) {
        this.cache.delete(`${collection}:${key}`);
      }
      this.cache.delete(`${collection}:*`);
      
      this.emit(EventTypes.SAVE, { collection });
      this.emit(EventTypes.SAVE_COMPLETE, { collection });
      
      return true;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  async updateMany(collection, updates) {
    this.ensureConnected();
    this.emit(EventTypes.UPDATE_MANY, { collection, count: updates.length });
    
    try {
      const manager = await this.getCollectionManager(collection);
      await manager.updateMany(updates);
      
      this.cache.delete(`${collection}:*`);
      
      this.emit(EventTypes.SAVE, { collection });
      this.emit(EventTypes.SAVE_COMPLETE, { collection });
      
      return true;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Create a transaction
   */
  async transaction() {
    this.ensureConnected();
    this.emit(EventTypes.TRANSACTION_START);
    
    try {
      const transaction = new Transaction(this);
      
      // Wrap commit and rollback to emit events
      const originalCommit = transaction.commit.bind(transaction);
      const originalRollback = transaction.rollback.bind(transaction);
      
      transaction.commit = async () => {
        try {
          const result = await originalCommit();
          this.emit(EventTypes.TRANSACTION_COMMIT, result);
          return result;
        } catch (error) {
          this.emit(EventTypes.TRANSACTION_ERROR, error);
          throw error;
        }
      };
      
      transaction.rollback = async () => {
        try {
          const result = await originalRollback();
          this.emit(EventTypes.TRANSACTION_ROLLBACK, result);
          return result;
        } catch (error) {
          this.emit(EventTypes.TRANSACTION_ERROR, error);
          throw error;
        }
      };
      
      return transaction;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Get collection manager with repository routing
   */
  async getCollectionManager(collection) {
    const repoName = await this.router.getRepositoryForCollection(collection);
    const filePath = `shadowx/${this.options.projectId}/${collection}.json`;
    
    const repoGithub = new GitHubManager({
      token: this.options.token,
      owner: this.options.owner,
      repo: repoName,
      branch: this.options.branch,
      projectId: this.options.projectId,
      encryption: this.github.encryption,
      compression: this.options.compression,
      verbose: this.options.verbose
    });

    const manager = new CollectionManager(repoGithub, collection);
    
    await manager.load();
    await this.router.registerCollectionInRepo(collection, repoName);
    
    return manager;
  }

  /**
   * List all collections across repositories
   */
  async listCollections() {
    this.ensureConnected();
    
    try {
      return await this.router.listAllCollections();
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Get database info
   */
  async getInfo() {
    const repoStats = await this.repositoryManager.getRepositoryStats();
    const syncStatus = this.sync.getStatus();
    const cacheStats = this.cache.getStats();
    const eventStats = this.getStats();
    
    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    
    return {
      connected: this.connected,
      ready: this.ready,
      uptime: uptime,
      projectId: this.options.projectId,
      owner: this.options.owner,
      baseRepo: this.options.repo,
      branch: this.options.branch,
      compression: this.options.compression,
      encryption: !!this.options.encryptionKey,
      autoSync: this.options.autoSync,
      syncInterval: this.options.syncInterval,
      scalingEnabled: this.options.scalingEnabled,
      maxRepoSize: this.options.maxRepoSize,
      repoPrefix: this.options.repoPrefix,
      cacheStats: cacheStats,
      syncStatus: syncStatus,
      repositoryStats: repoStats,
      eventStats: eventStats,
      options: {
        cacheTTL: this.options.cacheTTL,
        retryAttempts: this.options.retryAttempts,
        retryDelay: this.options.retryDelay
      }
    };
  }

  /**
   * Force sync
   */
  async sync() {
    this.ensureConnected();
    this.emit(EventTypes.SYNC, { status: 'manual' });
    
    try {
      await this.sync.forceSync();
      return true;
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Get collection stats
   */
  async getCollectionStats(collection) {
    this.ensureConnected();
    
    try {
      return await this.router.getCollectionStats(collection);
    } catch (error) {
      this.emit(EventTypes.ERROR, error);
      throw error;
    }
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    this.emit(EventTypes.CACHE_CLEAR);
    this.log('Cache cleared');
    return this;
  }

  /**
   * Get cache stats
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Ensure database is connected
   */
  ensureConnected() {
    if (!this.connected || !this.ready) {
      throw new ShadowXError('Database not connected', ErrorCodes.NETWORK_ERROR, 503);
    }
  }

  /**
   * Log message if verbose
   */
  log(...args) {
    if (this.options.verbose) {
      console.log('[ShadowX]', ...args);
    }
  }

  /**
   * Wait for database to be ready
   */
  async waitForReady(timeout = 30000) {
    if (this.ready) return true;
    
    try {
      await this.waitFor(EventTypes.READY, timeout);
      return true;
    } catch (error) {
      throw new ShadowXError(
        `Database not ready within ${timeout}ms`,
        ErrorCodes.NETWORK_ERROR,
        503
      );
    }
  }

  /**
   * Get event history
   */
  getEventHistory(options = {}) {
    return super.getEventHistory(options);
  }

  /**
   * Clear event history
   */
  clearEventHistory() {
    return this.clearHistory();
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    const history = this.getEventHistory({
      event: EventTypes.PERFORMANCE
    });
    
    const metrics = {};
    
    for (const entry of history) {
      const args = entry.args[0];
      if (args) {
        const operation = args.operation;
        if (!metrics[operation]) {
          metrics[operation] = {
            count: 0,
            totalDuration: 0,
            minDuration: Infinity,
            maxDuration: 0,
            cacheHits: 0,
            cacheMisses: 0
          };
        }
        
        metrics[operation].count++;
        metrics[operation].totalDuration += args.duration || 0;
        metrics[operation].minDuration = Math.min(metrics[operation].minDuration, args.duration || 0);
        metrics[operation].maxDuration = Math.max(metrics[operation].maxDuration, args.duration || 0);
        
        if (args.cache !== undefined) {
          if (args.cache) {
            metrics[operation].cacheHits++;
          } else {
            metrics[operation].cacheMisses++;
          }
        }
      }
    }
    
    // Calculate averages
    for (const op in metrics) {
      metrics[op].avgDuration = metrics[op].totalDuration / metrics[op].count;
      metrics[op].cacheHitRate = metrics[op].cacheHits + metrics[op].cacheMisses > 0 
        ? metrics[op].cacheHits / (metrics[op].cacheHits + metrics[op].cacheMisses) 
        : 0;
    }
    
    return metrics;
  }

  /**
   * Clean up resources
   */
  async destroy() {
    await this.disconnect();
    this.clearCache();
    this.removeAllListeners();
    this.clearHistory();
    this.log('Database destroyed');
  }
}

module.exports = Database;
