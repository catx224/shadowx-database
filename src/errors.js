/**
 * Custom error classes for ShadowX Database
 */

class ShadowXError extends Error {
  constructor(message, code, statusCode, details = {}) {
    super(message);
    this.name = 'ShadowXError';
    this.code = code || 'UNKNOWN_ERROR';
    this.statusCode = statusCode || 500;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}

const ErrorCodes = {
  INVALID_TOKEN: 'INVALID_TOKEN',
  REPOSITORY_NOT_FOUND: 'REPOSITORY_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  NETWORK_ERROR: 'NETWORK_ERROR',
  CONFLICT: 'CONFLICT',
  COLLECTION_NOT_FOUND: 'COLLECTION_NOT_FOUND',
  INVALID_PATH: 'INVALID_PATH',
  INVALID_KEY: 'INVALID_KEY',
  INVALID_VALUE: 'INVALID_VALUE',
  CORRUPTED_DATA: 'CORRUPTED_DATA',
  TRANSACTION_FAILED: 'TRANSACTION_FAILED',
  ENCRYPTION_ERROR: 'ENCRYPTION_ERROR',
  COMPRESSION_ERROR: 'COMPRESSION_ERROR',
  SYNC_ERROR: 'SYNC_ERROR',
  CACHE_ERROR: 'CACHE_ERROR',
  GITHUB_ERROR: 'GITHUB_ERROR',
  REPOSITORY_CREATION_FAILED: 'REPOSITORY_CREATION_FAILED'
};

class InvalidTokenError extends ShadowXError {
  constructor(message = 'Invalid GitHub token') {
    super(message, ErrorCodes.INVALID_TOKEN, 401);
  }
}

class RepositoryNotFoundError extends ShadowXError {
  constructor(message = 'Repository not found') {
    super(message, ErrorCodes.REPOSITORY_NOT_FOUND, 404);
  }
}

class RateLimitError extends ShadowXError {
  constructor(message = 'GitHub API rate limit exceeded', details = {}) {
    super(message, ErrorCodes.RATE_LIMIT_EXCEEDED, 429, details);
  }
}

class ConflictError extends ShadowXError {
  constructor(message = 'Merge conflict detected', details = {}) {
    super(message, ErrorCodes.CONFLICT, 409, details);
  }
}

class RepositoryCreationError extends ShadowXError {
  constructor(message = 'Failed to create repository', details = {}) {
    super(message, ErrorCodes.REPOSITORY_CREATION_FAILED, 500, details);
  }
}

module.exports = {
  ShadowXError,
  ErrorCodes,
  InvalidTokenError,
  RepositoryNotFoundError,
  RateLimitError,
  ConflictError,
  RepositoryCreationError
};
