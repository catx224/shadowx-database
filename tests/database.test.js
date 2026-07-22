/**
 * Test file for ShadowX Database
 */

const ShadowDB = require('../src/database');

describe('ShadowX Database', () => {
  let db;
  
  beforeAll(async () => {
    db = new ShadowDB({
      token: process.env.GITHUB_TOKEN || 'test-token',
      owner: process.env.GITHUB_OWNER || 'test-owner',
      repo: process.env.GITHUB_REPO || 'test-repo',
      verbose: false,
      scalingEnabled: false
    });
    
    await db.connect();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  test('should set and get data', async () => {
    await db.set('test', 'user1', { name: 'John', age: 30 });
    const user = await db.get('test', 'user1');
    expect(user).toEqual({ name: 'John', age: 30 });
  });

  test('should handle nested paths', async () => {
    await db.set('test', 'user1.profile.name', 'Johnny');
    const name = await db.get('test', 'user1.profile.name');
    expect(name).toBe('Johnny');
  });

  test('should add to numeric values', async () => {
    await db.set('test', 'user1.coins', 100);
    await db.add('test', 'user1.coins', 50);
    const coins = await db.get('test', 'user1.coins');
    expect(coins).toBe(150);
  });

  test('should push to arrays', async () => {
    await db.set('test', 'user1.inventory', []);
    await db.push('test', 'user1.inventory', 'Sword');
    const inventory = await db.get('test', 'user1.inventory');
    expect(inventory).toContain('Sword');
  });

  test('should check if key exists', async () => {
    await db.set('test', 'user1', { name: 'John' });
    const exists = await db.has('test', 'user1');
    expect(exists).toBe(true);
  });

  test('should delete data', async () => {
    await db.set('test', 'temp', { value: 'temp' });
    await db.delete('test', 'temp');
    const result = await db.get('test', 'temp');
    expect(result).toBeUndefined();
  });

  test('should get all entries', async () => {
    await db.set('test', 'user1', { name: 'John' });
    await db.set('test', 'user2', { name: 'Jane' });
    const all = await db.all('test');
    expect(Object.keys(all)).toContain('user1');
    expect(Object.keys(all)).toContain('user2');
  });

  test('should handle batch operations', async () => {
    await db.setMany('test', [
      { key: 'batch1', value: { name: 'Batch1' } },
      { key: 'batch2', value: { name: 'Batch2' } }
    ]);
    
    const results = await db.getMany('test', ['batch1', 'batch2']);
    expect(results.batch1).toEqual({ name: 'Batch1' });
    expect(results.batch2).toEqual({ name: 'Batch2' });
  });

  test('should support transactions', async () => {
    const tx = await db.transaction();
    
    await tx.set('test', 'tx1', { value: 'tx1' });
    await tx.add('test', 'tx1.count', 10);
    await tx.push('test', 'tx1.array', 'item');
    await tx.commit();
    
    const data = await db.get('test', 'tx1');
    expect(data.value).toBe('tx1');
    expect(data.count).toBe(10);
    expect(data.array).toContain('item');
  });
});
