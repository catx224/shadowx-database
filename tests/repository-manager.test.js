/**
 * Test file for Repository Manager
 */

const RepositoryManager = require('../src/repository-manager');

describe('Repository Manager', () => {
  let repoManager;
  
  beforeEach(() => {
    repoManager = new RepositoryManager({
      token: process.env.GITHUB_TOKEN || 'test-token',
      owner: process.env.GITHUB_OWNER || 'test-owner',
      repo: process.env.GITHUB_REPO || 'test-repo',
      projectId: 'test-project',
      verbose: false,
      scalingEnabled: true,
      maxRepoSize: 1024 * 1024, // 1MB for testing
      repoPrefix: 'test-storage'
    });
  });

  test('should generate repository names correctly', () => {
    const name1 = repoManager.generateRepositoryName();
    expect(name1).toBe('test-storage-2');
    
    // Add a repository to simulate existing ones
    repoManager.repositories.push({ name: 'test-storage-2' });
    const name2 = repoManager.generateRepositoryName();
    expect(name2).toBe('test-storage-3');
  });

  test('should handle repository status changes', () => {
    const repo = {
      name: 'test-repo',
      status: 'active',
      createdAt: new Date().toISOString(),
      collections: {},
      private: true
    };
    
    repoManager.repositories.push(repo);
    repoManager.activeIndex = 0;
    
    const activeRepo = repoManager.getActiveRepository();
    expect(activeRepo.status).toBe('active');
    
    // Mark as full
    activeRepo.status = 'full';
    activeRepo.filledAt = new Date().toISOString();
    expect(activeRepo.status).toBe('full');
  });

  test('should get repository by name', () => {
    const repo = {
      name: 'test-repo',
      status: 'active',
      createdAt: new Date().toISOString(),
      collections: {},
      private: true
    };
    
    repoManager.repositories.push(repo);
    
    const found = repoManager.getRepositoryByName('test-repo');
    expect(found).toBeDefined();
    expect(found.name).toBe('test-repo');
    
    const notFound = repoManager.getRepositoryByName('non-existent');
    expect(notFound).toBeUndefined();
  });
});
