/**
 * GitHub API wrapper for ShadowX Database
 */

const { Octokit } = require('@octokit/rest');
const Utils = require('./utils');
const Compression = require('./compression');
const { ShadowXError, ErrorCodes, RateLimitError, ConflictError } = require('./errors');

class GitHubManager {
  constructor(options) {
    this.token = options.token;
    this.owner = options.owner;
    this.defaultRepo = options.repo;
    this.branch = options.branch || 'main';
    this.projectId = options.projectId;
    this.encryption = options.encryption || null;
    this.compression = options.compression || false;
    this.verbose = options.verbose || false;
    this.repositoryManager = options.repositoryManager || null;

    this.octokit = new Octokit({
      auth: this.token
    });

    this.cache = new Map();
    this.shaCache = new Map();
    this.initialized = false;
  }

  /**
   * Initialize GitHub
   */
  async initialize() {
    if (this.initialized) return;

    try {
      await this.octokit.repos.get({
        owner: this.owner,
        repo: this.defaultRepo
      });

      this.initialized = true;
      this.log('GitHub initialized successfully');
    } catch (error) {
      this.handleGitHubError(error);
    }
  }

  /**
   * Read file from specific repository
   */
  async readFileFromRepo(collection, repoName, filePath) {
    Utils.validateCollection(collection);

    try {
      const response = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: repoName,
        path: filePath,
        ref: this.branch
      });

      if (Array.isArray(response.data)) {
        throw new ShadowXError(
          'Path is a directory, not a file',
          ErrorCodes.INVALID_PATH,
          400
        );
      }

      const sha = response.data.sha;
      let content = Buffer.from(response.data.content, 'base64').toString('utf8');

      if (this.compression) {
        content = await Compression.decompress(content);
      }

      if (this.encryption) {
        content = await this.encryption.decrypt(content);
      }

      const data = JSON.parse(content);
      this.shaCache.set(`${repoName}:${collection}`, sha);

      return data;
    } catch (error) {
      if (error.status === 404) {
        return {};
      }
      this.handleGitHubError(error);
    }
  }

  /**
   * Write file to specific repository
   */
  async writeFileToRepo(collection, data, repoName, filePath) {
    Utils.validateCollection(collection);

    let content = JSON.stringify(data, null, 2);

    if (this.encryption) {
      content = await this.encryption.encrypt(content);
    }

    if (this.compression) {
      content = await Compression.compress(content);
    }

    const encodedContent = Buffer.from(content, 'utf8').toString('base64');
    const cacheKey = `${repoName}:${collection}`;
    const sha = this.shaCache.get(cacheKey);

    try {
      const response = await Utils.retry(async () => {
        return await this.octokit.repos.createOrUpdateFileContents({
          owner: this.owner,
          repo: repoName,
          path: filePath,
          message: `Update ${collection} collection in ${repoName}`,
          content: encodedContent,
          branch: this.branch,
          sha: sha || undefined
        });
      }, 3, 1000);

      if (response.data && response.data.content) {
        this.shaCache.set(cacheKey, response.data.content.sha);
      }

      this.cache.delete(cacheKey);
      return response;
    } catch (error) {
      if (error.status === 409) {
        this.log(`Conflict detected for ${collection} in ${repoName}, retrying...`);
        this.shaCache.delete(cacheKey);
        const latestData = await this.readFileFromRepo(collection, repoName, filePath);
        const mergedData = this.mergeData(data, latestData);
        return await this.writeFileToRepo(collection, mergedData, repoName, filePath);
      }
      this.handleGitHubError(error);
    }
  }

  /**
   * Delete file from repository
   */
  async deleteFileFromRepo(repoName, filePath) {
    try {
      const response = await this.octokit.repos.getContent({
        owner: this.owner,
        repo: repoName,
        path: filePath,
        ref: this.branch
      });

      if (response.data && response.data.sha) {
        await this.octokit.repos.deleteFile({
          owner: this.owner,
          repo: repoName,
          path: filePath,
          message: `Delete file ${filePath}`,
          sha: response.data.sha,
          branch: this.branch
        });
      }
    } catch (error) {
      if (error.status !== 404) {
        this.handleGitHubError(error);
      }
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
   * Create a new private repository
   */
  async createRepository(repoName) {
    try {
      this.log(`Creating private repository: ${repoName}`);
      
      const response = await this.octokit.repos.createForAuthenticatedUser({
        name: repoName,
        description: `ShadowX Database storage for project ${this.projectId}`,
        private: true,
        auto_init: false,
        has_issues: false,
        has_projects: false,
        has_wiki: false
      });

      this.log(`Repository ${repoName} created successfully (private)`);
      return response.data;
    } catch (error) {
      if (error.status === 422) {
        throw new ShadowXError(
          `Repository ${repoName} already exists or name is invalid`,
          ErrorCodes.REPOSITORY_CREATION_FAILED,
          422
        );
      }
      this.handleGitHubError(error);
    }
  }

  /**
   * Merge data for conflict resolution
   */
  mergeData(localData, remoteData) {
    return Utils.deepMerge(localData, remoteData);
  }

  /**
   * Handle GitHub errors
   */
  handleGitHubError(error) {
    this.log(`GitHub error: ${error.message}`);

    if (error.status) {
      switch (error.status) {
        case 401:
          throw new ShadowXError(
            'Invalid GitHub token or authentication failed',
            ErrorCodes.INVALID_TOKEN,
            401
          );
        case 403:
          if (error.message.includes('rate limit')) {
            throw new RateLimitError('GitHub API rate limit exceeded');
          }
          throw new ShadowXError(
            'Permission denied or access forbidden',
            ErrorCodes.PERMISSION_DENIED,
            403
          );
        case 404:
          throw new ShadowXError(
            'Resource not found',
            ErrorCodes.REPOSITORY_NOT_FOUND,
            404
          );
        case 409:
          throw new ConflictError('Merge conflict detected');
        case 422:
          throw new ShadowXError(
            `Invalid request: ${error.message}`,
            ErrorCodes.REPOSITORY_CREATION_FAILED,
            422
          );
        case 429:
          const resetTime = error.headers ? error.headers['x-ratelimit-reset'] : null;
          throw new RateLimitError(
            'GitHub API rate limit exceeded',
            { resetTime }
          );
        default:
          throw new ShadowXError(
            `GitHub API error: ${error.message}`,
            ErrorCodes.GITHUB_ERROR,
            error.status
          );
      }
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new ShadowXError(
        'Network error: Unable to reach GitHub API',
        ErrorCodes.NETWORK_ERROR,
        503
      );
    }

    throw new ShadowXError(
      `Unexpected error: ${error.message}`,
      ErrorCodes.GITHUB_ERROR,
      500
    );
  }

  /**
   * Log message
   */
  log(message) {
    if (this.verbose) {
      console.log(`[GitHub] ${message}`);
    }
  }
}

module.exports = GitHubManager;
