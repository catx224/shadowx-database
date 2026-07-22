/**
 * Repository Manager for ShadowX Database
 * Handles automatic repository scaling
 */

const { Octokit } = require('@octokit/rest');
const Utils = require('./utils');
const { ShadowXError, ErrorCodes } = require('./errors');

class RepositoryManager {
  constructor(options) {
    this.token = options.token;
    this.owner = options.owner;
    this.baseRepo = options.repo;
    this.branch = options.branch || 'main';
    this.projectId = options.projectId;
    this.verbose = options.verbose || false;
    
    this.octokit = new Octokit({ auth: this.token });
    this.repositories = [];
    this.activeIndex = 0;
    this.metadata = null;
    this.scalingEnabled = options.scalingEnabled !== false;
    this.maxRepoSize = options.maxRepoSize || 100 * 1024 * 1024; // 100MB default
    this.repoPrefix = options.repoPrefix || 'shadow-storage';
    
    this.indexRepo = this.baseRepo;
    this.indexPath = `shadowx-index/repositories.json`;
    this.initialized = false;
  }

  /**
   * Initialize repository manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Load or create repository index
      await this.loadRepositoryIndex();
      
      // Validate repositories
      await this.validateRepositories();
      
      this.initialized = true;
      this.log('Repository manager initialized');
    } catch (error) {
      this.log(`Repository manager initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Load repository index
   */
  async loadRepositoryIndex() {
    try {
      const content = await this.getFileContent(this.indexRepo, this.indexPath);
      
      if (content) {
        this.metadata = JSON.parse(content);
        this.repositories = this.metadata.repositories || [];
        this.activeIndex = this.repositories.findIndex(r => r.status === 'active');
        if (this.activeIndex === -1) this.activeIndex = 0;
        
        this.log(`Loaded ${this.repositories.length} repositories from index`);
      } else {
        // Create initial repository
        this.repositories = [{
          name: this.baseRepo,
          status: 'active',
          createdAt: new Date().toISOString(),
          collections: {}
        }];
        this.activeIndex = 0;
        await this.saveRepositoryIndex();
        this.log('Created initial repository index');
      }
    } catch (error) {
      // If index doesn't exist, create it
      if (error.status === 404) {
        this.repositories = [{
          name: this.baseRepo,
          status: 'active',
          createdAt: new Date().toISOString(),
          collections: {}
        }];
        this.activeIndex = 0;
        await this.saveRepositoryIndex();
        this.log('Created initial repository index');
      } else {
        throw error;
      }
    }
  }

  /**
   * Save repository index
   */
  async saveRepositoryIndex() {
    if (!this.metadata) {
      this.metadata = {
        projectId: this.projectId,
        createdAt: new Date().toISOString(),
        repositories: this.repositories,
        updatedAt: new Date().toISOString()
      };
    } else {
      this.metadata.repositories = this.repositories;
      this.metadata.updatedAt = new Date().toISOString();
    }

    const content = JSON.stringify(this.metadata, null, 2);
    const encodedContent = Buffer.from(content, 'utf8').toString('base64');

    try {
      await this.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.indexRepo,
        path: this.indexPath,
        message: `Update repository index for project ${this.projectId}`,
        content: encodedContent,
        branch: this.branch
      });
      this.log('Repository index saved');
    } catch (error) {
      this.handleGitHubError(error);
    }
  }

  /**
   * Get file content from GitHub
   */
  async getFileContent(repo, path) {
    try {
      const response = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: repo,
        path: path,
        ref: this.branch
      });

      if (Array.isArray(response.data)) {
        return null;
      }

      return Buffer.from(response.data.content, 'base64').toString('utf8');
    } catch (error) {
      if (error.status === 404) {
        return null;
      }
      this.handleGitHubError(error);
    }
  }

  /**
   * Validate all repositories
   */
  async validateRepositories() {
    for (const repo of this.repositories) {
      try {
        await this.octokit.repos.get({
          owner: this.owner,
          repo: repo.name
        });
        repo.exists = true;
      } catch (error) {
        if (error.status === 404) {
          repo.exists = false;
          this.log(`Repository ${repo.name} does not exist`);
        } else {
          throw error;
        }
      }
    }
  }

  /**
   * Get active repository
   */
  getActiveRepository() {
    if (this.repositories.length === 0) {
      throw new ShadowXError('No repositories available', ErrorCodes.REPOSITORY_NOT_FOUND, 404);
    }
    return this.repositories[this.activeIndex];
  }

  /**
   * Get repository by name
   */
  getRepositoryByName(name) {
    return this.repositories.find(r => r.name === name);
  }

  /**
   * Check if repository needs scaling
   */
  async needsScaling(repoName) {
    if (!this.scalingEnabled) return false;

    try {
      const repo = this.getRepositoryByName(repoName);
      if (!repo) return false;

      // Check repository size
      const response = await this.octokit.repos.get({
        owner: this.owner,
        repo: repoName
      });

      const size = response.data.size * 1024; // Convert to bytes
      
      if (size > this.maxRepoSize) {
        this.log(`Repository ${repoName} size (${size}) exceeds limit (${this.maxRepoSize})`);
        return true;
      }

      return false;
    } catch (error) {
      this.log(`Error checking repository size: ${error.message}`);
      return false;
    }
  }

  /**
   * Create new repository
   */
  async createNewRepository() {
    if (!this.scalingEnabled) {
      throw new ShadowXError(
        'Scaling is disabled but repository is full',
        ErrorCodes.PERMISSION_DENIED,
        403
      );
    }

    const newRepoName = this.generateRepositoryName();
    this.log(`Creating new repository: ${newRepoName}`);

    try {
      // Create repository
      await this.octokit.repos.createForAuthenticatedUser({
        name: newRepoName,
        description: `ShadowX Database storage for project ${this.projectId}`,
        private: true,
        auto_init: false
      });

      // Wait for repository to be ready
      await Utils.sleep(2000);

      // Add to index
      const newRepo = {
        name: newRepoName,
        status: 'active',
        createdAt: new Date().toISOString(),
        collections: {}
      };

      // Mark old repository as full
      const oldRepo = this.repositories[this.activeIndex];
      if (oldRepo) {
        oldRepo.status = 'full';
        oldRepo.filledAt = new Date().toISOString();
      }

      this.repositories.push(newRepo);
      this.activeIndex = this.repositories.length - 1;

      // Save index
      await this.saveRepositoryIndex();

      this.log(`Repository ${newRepoName} created and set as active`);
      this.emit('repository-created', { name: newRepoName });

      return newRepo;
    } catch (error) {
      this.log(`Failed to create repository: ${error.message}`);
      this.handleGitHubError(error);
    }
  }

  /**
   * Generate repository name
   */
  generateRepositoryName() {
    const count = this.repositories.length + 1;
    return `${this.repoPrefix}-${count}`;
  }

  /**
   * Route collection to repository
   */
  async routeCollection(collection) {
    // Check if collection is in any repository
    for (const repo of this.repositories) {
      if (repo.collections && repo.collections[collection]) {
        return repo.name;
      }
    }

    // If not found, use active repository
    const activeRepo = this.getActiveRepository();
    
    // Check if active repo needs scaling
    const needsScaling = await this.needsScaling(activeRepo.name);
    if (needsScaling) {
      const newRepo = await this.createNewRepository();
      return newRepo.name;
    }

    return activeRepo.name;
  }

  /**
   * Register collection in repository
   */
  async registerCollection(repoName, collection) {
    const repo = this.getRepositoryByName(repoName);
    if (!repo) {
      throw new ShadowXError(`Repository ${repoName} not found`, ErrorCodes.REPOSITORY_NOT_FOUND, 404);
    }

    if (!repo.collections) {
      repo.collections = {};
    }

    repo.collections[collection] = {
      registeredAt: new Date().toISOString(),
      path: `shadowx/${this.projectId}/${collection}.json`
    };

    await this.saveRepositoryIndex();
    this.log(`Collection ${collection} registered in ${repoName}`);
  }

  /**
   * Get all repositories
   */
  getAllRepositories() {
    return this.repositories;
  }

  /**
   * Get repository stats
   */
  async getRepositoryStats() {
    const stats = {
      total: this.repositories.length,
      active: this.repositories.filter(r => r.status === 'active'),
      full: this.repositories.filter(r => r.status === 'full'),
      collections: {}
    };

    for (const repo of this.repositories) {
      try {
        const response = await this.octokit.repos.get({
          owner: this.owner,
          repo: repo.name
        });
        stats.collections[repo.name] = {
          size: response.data.size,
          collections: repo.collections ? Object.keys(repo.collections).length : 0
        };
      } catch (error) {
        // Skip if repository not accessible
      }
    }

    return stats;
  }

  /**
   * Handle GitHub errors
   */
  handleGitHubError(error) {
    if (error.status) {
      switch (error.status) {
        case 401:
          throw new ShadowXError('Invalid GitHub token', ErrorCodes.INVALID_TOKEN, 401);
        case 403:
          if (error.message.includes('rate limit')) {
            throw new ShadowXError('Rate limit exceeded', ErrorCodes.RATE_LIMIT_EXCEEDED, 429);
          }
          throw new ShadowXError('Permission denied', ErrorCodes.PERMISSION_DENIED, 403);
        case 404:
          throw new ShadowXError('Repository not found', ErrorCodes.REPOSITORY_NOT_FOUND, 404);
        default:
          throw new ShadowXError(`GitHub API error: ${error.message}`, ErrorCodes.GITHUB_ERROR, error.status);
      }
    }
    throw error;
  }

  /**
   * Log message
   */
  log(message) {
    if (this.verbose) {
      console.log(`[RepositoryManager] ${message}`);
    }
  }

  /**
   * Emit event (for compatibility)
   */
  emit(event, data) {
    // This will be connected to the main event system
    if (this.eventEmitter) {
      this.eventEmitter.emit(event, data);
    }
  }
}

module.exports = RepositoryManager;
