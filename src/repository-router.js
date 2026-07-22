/**
 * Repository Router for ShadowX Database
 * Routes data to appropriate repositories
 */

const { ShadowXError, ErrorCodes } = require('./errors');

class RepositoryRouter {
  constructor(repositoryManager, githubManager) {
    this.repoManager = repositoryManager;
    this.github = githubManager;
    this.collectionCache = new Map();
  }

  /**
   * Get collection data with automatic routing
   */
  async getCollection(collection) {
    const repoName = await this.getRepositoryForCollection(collection);
    const filePath = `shadowx/${this.repoManager.projectId}/${collection}.json`;
    
    return this.github.readFileFromRepo(collection, repoName, filePath);
  }

  /**
   * Update collection data with automatic routing
   */
  async updateCollection(collection, data) {
    const repoName = await this.getRepositoryForCollection(collection);
    
    const needsScaling = await this.repoManager.needsScaling(repoName);
    if (needsScaling) {
      const newRepo = await this.repoManager.createNewRepository();
      await this.registerCollectionInRepo(collection, newRepo.name);
      return this.updateCollection(collection, data);
    }

    const filePath = `shadowx/${this.repoManager.projectId}/${collection}.json`;
    const result = await this.github.writeFileToRepo(collection, data, repoName, filePath);
    
    await this.registerCollectionInRepo(collection, repoName);
    
    return result;
  }

  /**
   * Get repository for collection
   */
  async getRepositoryForCollection(collection) {
    if (this.collectionCache.has(collection)) {
      const repoName = this.collectionCache.get(collection);
      const repo = this.repoManager.getRepositoryByName(repoName);
      if (repo && repo.exists !== false) {
        return repoName;
      }
      this.collectionCache.delete(collection);
    }

    for (const repo of this.repoManager.getAllRepositories()) {
      if (repo.collections && repo.collections[collection]) {
        const exists = await this.collectionExistsInRepo(collection, repo.name);
        if (exists) {
          this.collectionCache.set(collection, repo.name);
          return repo.name;
        }
      }
    }

    const activeRepo = this.repoManager.getActiveRepository();
    this.collectionCache.set(collection, activeRepo.name);
    return activeRepo.name;
  }

  /**
   * Check if collection exists in repository
   */
  async collectionExistsInRepo(collection, repoName) {
    const filePath = `shadowx/${this.repoManager.projectId}/${collection}.json`;
    
    try {
      const content = await this.github.getFileContent(repoName, filePath);
      return content !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Register collection in repository
   */
  async registerCollectionInRepo(collection, repoName) {
    await this.repoManager.registerCollection(repoName, collection);
    this.collectionCache.set(collection, repoName);
  }

  /**
   * List all collections across repositories
   */
  async listAllCollections() {
    const collections = new Set();

    for (const repo of this.repoManager.getAllRepositories()) {
      if (repo.collections) {
        for (const collection in repo.collections) {
          collections.add(collection);
        }
      }
    }

    return Array.from(collections);
  }

  /**
   * Delete collection from all repositories
   */
  async deleteCollection(collection) {
    let deleted = false;

    for (const repo of this.repoManager.getAllRepositories()) {
      if (repo.collections && repo.collections[collection]) {
        const filePath = `shadowx/${this.repoManager.projectId}/${collection}.json`;
        await this.github.deleteFileFromRepo(repo.name, filePath);
        delete repo.collections[collection];
        deleted = true;
      }
    }

    if (deleted) {
      await this.repoManager.saveRepositoryIndex();
      this.collectionCache.delete(collection);
    }

    return deleted;
  }

  /**
   * Get collection stats
   */
  async getCollectionStats(collection) {
    const stats = [];
    
    for (const repo of this.repoManager.getAllRepositories()) {
      if (repo.collections && repo.collections[collection]) {
        try {
          const data = await this.getCollection(collection);
          stats.push({
            repository: repo.name,
            size: JSON.stringify(data).length,
            keys: Object.keys(data).length,
            private: repo.private !== false
          });
        } catch (error) {
          stats.push({
            repository: repo.name,
            error: error.message,
            private: repo.private !== false
          });
        }
      }
    }

    return stats;
  }
}

module.exports = RepositoryRouter;
