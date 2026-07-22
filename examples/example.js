/**
 * ShadowX Database Example with Private Repository Scaling
 */

const ShadowDB = require('../src/database');

async function run() {
  try {
    console.log('🚀 Starting ShadowX Database Example');
    console.log('   All repositories will be created as PRIVATE\n');

    // Initialize database with scaling
    const db = new ShadowDB({
      token: process.env.GITHUB_TOKEN || 'your-github-token',
      owner: process.env.GITHUB_OWNER || 'your-github-username',
      repo: process.env.GITHUB_REPO || 'shadow-storage',
      branch: 'main',
      projectId: 'my-awesome-app',
      compression: true,
      verbose: true,
      scalingEnabled: true,
      maxRepoSize: 50 * 1024 * 1024, // 50MB
      repoPrefix: 'shadow-storage'
    });

    // Event handlers
    db.on('connect', () => console.log('✅ Connected to GitHub'));
    db.on('ready', () => console.log('✅ Database ready'));
    db.on('save', (data) => console.log(`💾 Saved: ${data.collection}`));
    db.on('sync', (data) => console.log(`🔄 Synced: ${data.collections} collections`));
    db.on('repository-created', (data) => {
      console.log(`📦 New PRIVATE repository created: ${data.name}`);
      console.log(`   Owner: ${data.owner}`);
    });
    db.on('error', (error) => console.error('❌ Error:', error.message));

    // Connect to database
    await db.connect();

    console.log('\n📊 Database Info:');
    const info = await db.getInfo();
    console.log(`   Project ID: ${info.projectId}`);
    console.log(`   Repositories: ${info.repositoryStats.total}`);
    console.log(`   Scaling: ${info.scalingEnabled ? 'Enabled' : 'Disabled'}`);

    console.log('\n--- Basic Operations ---');

    // Set data
    await db.set('users', '123', {
      username: 'ShadowMaster',
      level: 1,
      coins: 100,
      inventory: [],
      stats: {
        wins: 0,
        losses: 0
      }
    });

    console.log('✅ User created');

    // Get data
    const user = await db.get('users', '123');
    console.log('📖 User:', user);

    // Nested operations
    await db.set('users', '123.username', 'ShadowKing');
    await db.set('users', '123.profile.bio', 'The ultimate Shadow');

    // Add to numeric values
    await db.add('users', '123.level', 5);
    await db.add('users', '123.coins', 500);
    await db.add('users', '123.stats.wins', 10);

    // Push to arrays
    await db.push('users', '123.inventory', 'Legendary Sword');
    await db.push('users', '123.inventory', 'Shield of Shadows');

    console.log('✅ User updated');

    // Check if key exists
    const hasCoins = await db.has('users', '123.coins');
    console.log('💰 Has coins?', hasCoins);

    // Get all users
    const allUsers = await db.all('users');
    console.log('👥 All users:', Object.keys(allUsers));

    console.log('\n--- Repository Information ---');
    
    // Get repository stats
    const repoStats = await db.getInfo();
    console.log('📊 Repository Stats:');
    console.log(`   Total repositories: ${repoStats.repositoryStats.total}`);
    console.log(`   Active: ${repoStats.repositoryStats.active.length}`);
    console.log(`   Full: ${repoStats.repositoryStats.full.length}`);
    
    for (const [name, stats] of Object.entries(repoStats.repositoryStats.collections)) {
      console.log(`   📁 ${name}:`);
      console.log(`      Size: ${stats.size} KB`);
      console.log(`      Collections: ${stats.collections}`);
      console.log(`      Private: ${stats.private ? 'Yes ✅' : 'No ❌'}`);
    }

    console.log('\n✨ All operations completed successfully!');

    // Disconnect
    await db.disconnect();
    console.log('\n✅ Disconnected');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
    process.exit(1);
  }
}

// Run the example
run();
