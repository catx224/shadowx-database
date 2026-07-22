/**
 * Main Database class for ShadowX Database
 */

const { EventEmitter } = require('events');
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

class Database extends EventEmitter {
  constructor(options = {}) {
    super();
    
    if (!options.token) {
      throw new ShadowXError('GitHub token is required', ErrorCodes.INVALID_TOKEN, 400);
    }
    
    if (!options.owner) {
      throw new ShadowXError('GitHub owner is required', ErrorCodes.INVALID_TOKEN, 400);
    }
    
    if (!options.repo) {
      throw new ShadowXError('GitHub repository is required', ErrorCodes.REPOSITORY_NOT_FOUND, 400);
    }

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
      maxRepoSize: options.maxRepoSize || 100 * 1024 * 1024,
      repoPrefix: options.repoPrefix || 'shadow-storage'
    };

    // Get or generate project ID
    if (!this.options.projectId) {
      this.options.projectId = Utils.getOrCreateProjectId();
    }

    // Initialize encryption
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
    this.repositoryManager.setEventEmitter(this);

    // Initialize repository router
    this.router = new RepositoryRouter(this.repositoryManager, this.github);

    // Initialize cache
    this.cache = new CacheManager({
      ttl: this.options.cacheTTL
    });

    // Initialize sync manager
    this.sync = new SyncManager(this, {
      interval: this.options.syncInterval,
      enabled: this.options.autoSync
    });

    this.sync.on('sync-complete', (data) => {
      this.emit('sync', data);
    });

    this.sync.on('sync-error', (error) => {
      this.emit('error', error);
    });

    this.connected = false;
    this.ready = false;

    this.log('Database initialized with project ID:', this.options.projectId);
  }

  /**
   * Connect to GitHub
   */
  async connect() {
    try {
      this.emit('connecting');
      
      await this.github.initialize();
      await this.repositoryManager.initialize();
      
      this.connected = true;
      this.ready = true;
      
      if (this.options.autoSync) {
        this.sync.start();
      }
      
      this.emit('connect');
      this.emit('ready');
      
      this.log('Connected to GitHub successfully');
      
      const stats = await this.repositoryManager.getRepositoryStats();
      this.log(`Repository stats: ${stats.total} total, ${stats.active.length} active`);
      
      return this;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Disconnect from GitHub
   */
  async disconnect() {
    try {
      this.emit('disconnecting');
      
      this.sync.stop();
      
      this.connected = false;
      this.ready = false;
      
      this.emit('disconnect');
      this.log('Disconnected from GitHub');
      
      return this;
    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Set a value
   */
  async set(collection, key, value) {
    this.ensureConnected();
    this.emit('set', { collection, key });
    
    const manager = await this.getCollectionManager(collection);
    const result = await manager.set(key, value);
    
    this.emit('save', { collection });
    return result;
  }

  /**
   * Get a value
   */
  async get(collection, key) {
    this.ensureConnected();
    
    const cacheKey = `${collection}:${key || '*'}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached !== null) {
      this.emit('cache', true);
      return cached;
    }
    
    this.emit('cache', false);
    const manager = await this.getCollectionManager(collection);
    const result = await manager.get(key);
    
    this.cache.set(cacheKey, result);
    
    return result;
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
    this.emit('delete', { collection, key });
    
    const manager = await this.getCollectionManager(collection);
    await manager.delete(key);
    
    this.cache.delete(`${collection}:${key}`);
    this.cache.delete(`${collection}:*`);
    
    this.emit('save', { collection });
  }

  /**
   * Check if key exists
   */
  async has(collection, key) {
    this.ensureConnected();
    const manager = await this.getCollectionManager(collection);
    return manager.has(key);
  }

  /**
   * Add to numeric value
   */
  async add(collection, path, number) {
    this.ensureConnected();
    this.emit('add', { collection, path, number });
    
    const manager = await this.getCollectionManager(collection);
    const result = await manager.add(path, number);
    
    this.emit('save', { collection });
    return result;
  }

  /**
   * Subtract from numeric value
   */
  async subtract(collection, path, number) {
    this.ensureConnected();
    this.emit('subtract', { collection, path, number });
    
    const manager = await this.getCollectionManager(collection);
    const result = await manager.subtract(path, number);
    
    this.emit('save', { collection });
    return result;
  }

  /**
   * Push to array
   */
  async push(collection, path, value) {
    this.ensureConnected();
    this.emit('push', { collection, path, value });
    
    const manager = await this.getCollectionManager(collection);
    const result = await manager.push(path, value);
    
    this.emit('save', { collection });
    return result;
  }

  /**
   * Pull from array
   */
  async pull(collection, path, value) {
    this.ensureConnected();
    this.emit('pull', { collection, path, value });
    
    const manager = await this.getCollectionManager(collection);
    const result = await manager.pull(path, value);
    
    this.emit('save', { collection });
    return result;
  }

  /**
   * Ensure key exists with default value
   */
  async ensure(collection, key, defaultValue) {
    this.ensureConnected();
    this.emit('ensure', { collection, key });
    
    const manager = await this.getCollectionManager(collection);
    const result = await manager.ensure(key, defaultValue);
    
    this.emit('save', { collection });
    return result;
  }

  /**
   * Get all entries
   */
  async all(collection) {
    this.ensureConnected();
    const manager = await this.getCollectionManager(collection);
    return manager.all();
  }

  /**
   * Get all keys
   */
  async keys(collection) {
    this.ensureConnected();
    const manager = await this.getCollectionManager(collection);
    return manager.keys();
  }

  /**
   * Get all values
   */
  async values(collection) {
    this.ensureConnected();
    const manager = await this.getCollectionManager(collection);
    return manager.values();
  }

  /**
   * Get size of collection
   */
  async size(collection) {
    this.ensureConnected();
    const manager = await this.getCollectionManager(collection);
    return manager.size();
  }

  /**
   * Clear collection
   */
  async clear(collection) {
    this.ensureConnected();
    this.emit('clear', { collection });
    
    const manager = await this.getCollectionManager(collection);
    await manager.clear();
    
    this.emit('save', { collection });
  }

  /**
   * Find entries matching callback
   */
  async find(collection, callback) {
    this.ensureConnected();
    const manager = await this.getCollectionManager(collection);
    return manager.find(callback);
  }

  /**
   * Filter entries
   */
  async filter(collection, callback) {
    this.ensureConnected();
    const manager = await this.getCollectionManager(collection);
    return manager.filter(callback);
  }

  /**
   * Get random entry
   */
  async random(collection) {
    this.ensureConnected();
    const manager = await this.getCollectionManager(collection);
    return manager.random();
  }

  /**
   * Get random key
   */
  async randomKey(collection) {
    this.ensureConnected();
    const manager = await this.getCollectionManager(collection);
    return manager.randomKey();
  }

  /**
   * Batch operations
   */
  async setMany(collection, entries) {
    this.ensureConnected();
    this.emit('setMany', { collection, count: entries.length });
    
    const manager = await this.getCollectionManager(collection);
    await manager.setMany(entries);
    
    this.emit('save', { collection });
  }

  async getMany(collection, keys) {
    this.ensureConnected();
    const manager = await this.getCollectionManager(collection);
    return manager.getMany(keys);
  }

  async deleteMany(collection, keys) {
    this.ensureConnected();
    this.emit('deleteMany', { collection, count: keys.length });
    
    const manager = await this.getCollectionManager(collection);
    await manager.deleteMany(keys);
    
    this.emit('save', { collection });
  }

  async updateMany(collection, updates) {
    this.ensureConnected();
    this.emit('updateMany', { collection, count: updates.length });
    
    const manager = await this.getCollectionManager(collection);
    await manager.updateMany(updates);
    
    this.emit('save', { collection });
  }

  /**
   * Create a transaction
   */
  async transaction() {
    this.ensureConnected();
    return new Transaction(this);
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
    return this.router.listAllCollections();
  }

  /**
   * Get database info
   */
  async getInfo() {
    const repoStats = await this.repositoryManager.getRepositoryStats();
    
    return {
      connected: this.connected,
      ready: this.ready,
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
      cacheStats: this.cache.getStats(),
      syncStatus: this.sync.getStatus(),
      repositoryStats: repoStats
    };
  }

  /**
   * Force sync
   */
  async sync() {
    this.ensureConnected();
    await this.sync.forceSync();
  }

  /**
   * Get collection stats
   */
  async getCollectionStats(collection) {
    this.ensureConnected();
    return this.router.getCollectionStats(collection);
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
   * Log message
   */
  log(...args) {
    if (this.options.verbose) {
      console.log('[ShadowX]', ...args);
    }
  }
}

module.exports = Database;
