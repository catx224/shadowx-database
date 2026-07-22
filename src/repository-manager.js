/**
 * Repository Manager for ShadowX Database
 * Handles automatic repository scaling with private repositories
 */

const Utils = require('./utils');
const { ShadowXError, ErrorCodes, RepositoryCreationError } = require('./errors');

class RepositoryManager {
  constructor(options) {
    this.token = options.token;
    this.owner = options.owner;
    this.baseRepo = options.repo;
    this.branch = options.branch || 'main';
    this.projectId = options.projectId;
    this.verbose = options.verbose || false;
    this.github = options.github || null;
    
    this.repositories = [];
    this.activeIndex = 0;
    this.metadata = null;
    this.scalingEnabled = options.scalingEnabled !== false;
    this.maxRepoSize = options.maxRepoSize || 100 * 1024 * 1024;
    this.repoPrefix = options.repoPrefix || 'shadow-storage';
    
    this.indexRepo = this.baseRepo;
    this.indexPath = `shadowx-index/repositories.json`;
    this.initialized = false;
    this.eventEmitter = null;
  }

  /**
   * Initialize repository manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await this.loadRepositoryIndex();
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
      const content = await this.github.getFileContent(this.indexRepo, this.indexPath);
      
      if (content) {
        this.metadata = JSON.parse(content);
        this.repositories = this.metadata.repositories || [];
        this.activeIndex = this.repositories.findIndex(r => r.status === 'active');
        if (this.activeIndex === -1) this.activeIndex = 0;
        
        this.log(`Loaded ${this.repositories.length} repositories from index`);
      } else {
        this.repositories = [{
          name: this.baseRepo,
          status: 'active',
          createdAt: new Date().toISOString(),
          collections: {},
          private: true
        }];
        this.activeIndex = 0;
        await this.saveRepositoryIndex();
        this.log('Created initial repository index');
      }
    } catch (error) {
      if (error.status === 404) {
        this.repositories = [{
          name: this.baseRepo,
          status: 'active',
          createdAt: new Date().toISOString(),
          collections: {},
          private: true
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
      await this.github.octokit.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.indexRepo,
        path: this.indexPath,
        message: `Update repository index for project ${this.projectId}`,
        content: encodedContent,
        branch: this.branch
      });
      this.log('Repository index saved');
    } catch (error) {
      this.github.handleGitHubError(error);
    }
  }

  /**
   * Validate all repositories
   */
  async validateRepositories() {
    for (const repo of this.repositories) {
      try {
        await this.github.octokit.repos.get({
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

      const response = await this.github.octokit.repos.get({
        owner: this.owner,
        repo: repoName
      });

      const size = response.data.size * 1024;
      
      if (size > this.maxRepoSize) {
        this.log(`Repository ${repoName} size (${size} bytes) exceeds limit (${this.maxRepoSize} bytes)`);
        return true;
      }

      return false;
    } catch (error) {
      this.log(`Error checking repository size: ${error.message}`);
      return false;
    }
  }

  /**
   * Create new private repository
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
    this.log(`Creating new private repository: ${newRepoName}`);

    try {
      // Create private repository
      await this.github.createRepository(newRepoName);

      // Wait for repository to be ready
      await Utils.sleep(2000);

      // Add to index
      const newRepo = {
        name: newRepoName,
        status: 'active',
        createdAt: new Date().toISOString(),
        collections: {},
        private: true
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

      this.log(`Private repository ${newRepoName} created and set as active`);
      this.emit('repository-created', { 
        name: newRepoName, 
        private: true,
        owner: this.owner
      });

      return newRepo;
    } catch (error) {
      this.log(`Failed to create repository: ${error.message}`);
      
      if (error.status === 422) {
        // Try with a different name
        const alternativeName = `${newRepoName}-${Utils.randomId(4)}`;
        this.log(`Trying alternative name: ${alternativeName}`);
        
        try {
          await this.github.createRepository(alternativeName);
          await Utils.sleep(2000);
          
          const newRepo = {
            name: alternativeName,
            status: 'active',
            createdAt: new Date().toISOString(),
            collections: {},
            private: true
          };

          const oldRepo = this.repositories[this.activeIndex];
          if (oldRepo) {
            oldRepo.status = 'full';
            oldRepo.filledAt = new Date().toISOString();
          }

          this.repositories.push(newRepo);
          this.activeIndex = this.repositories.length - 1;
          await this.saveRepositoryIndex();

          this.log(`Private repository ${alternativeName} created successfully`);
          this.emit('repository-created', { 
            name: alternativeName, 
            private: true,
            owner: this.owner
          });

          return newRepo;
        } catch (retryError) {
          throw new RepositoryCreationError(
            `Failed to create repository: ${retryError.message}`,
            { originalError: retryError.message }
          );
        }
      }
      
      throw new RepositoryCreationError(
        `Failed to create repository: ${error.message}`,
        { originalError: error.message }
      );
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
    for (const repo of this.repositories) {
      if (repo.collections && repo.collections[collection]) {
        return repo.name;
      }
    }

    const activeRepo = this.getActiveRepository();
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
      throw new ShadowXError(`Repository ${repoName} not
