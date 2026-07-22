/**
 * GitHub API wrapper for ShadowX Database
 * Updated to support multiple repositories
 */

const { Octokit } = require('@octokit/rest');
const Utils = require('./utils');
const { ShadowXError, ErrorCodes } = require('./errors');

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
        content = await this.decompress(content);
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
      content = await this.compress(content);
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
   * Merge data for conflict resolution
   */
  mergeData(localData, remoteData) {
    return Utils.deepMerge(localData, remoteData);
  }

  /**
   * Compress data
   */
  async compress(data) {
    if (!this.compression) return data;

    const zlib = require('zlib');
    return new Promise((resolve, reject) => {
      zlib.gzip(data, (error, compressed) => {
        if (error) {
          reject(new ShadowXError('Compression failed', ErrorCodes.COMPRESSION_ERROR, 500));
        } else {
          resolve(compressed.toString('base64'));
        }
      });
    });
  }

  /**
   * Decompress data
   */
  async decompress(data) {
    if (!this.compression) return data;

    const zlib = require('zlib');
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
  }

  /**
   * Handle GitHub errors
   */
  handleGitHubError(error) {
    this.log(`GitHub error: ${error.message}`);

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
          throw new ShadowXError('Resource not found', ErrorCodes.REPOSITORY_NOT_FOUND, 404);
        case 409:
          throw new ShadowXError('Merge conflict detected', ErrorCodes.CONFLICT, 409);
        default:
          throw new ShadowXError(`GitHub API error: ${error.message}`, ErrorCodes.GITHUB_ERROR, error.status);
      }
    }

    throw new ShadowXError(`Unexpected error: ${error.message}`, ErrorCodes.GITHUB_ERROR, 500);
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
