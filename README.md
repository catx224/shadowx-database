
```markdown
# ShadowX Database

> Lightweight NoSQL database backed by GitHub repositories with automatic scaling

Developed by **Mueid Mursalin Rifat**

## 📋 Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [GitHub Token Setup](#-github-token-setup)
- [Project Configuration](#-project-configuration)
- [Automatic Repository Scaling](#-automatic-repository-scaling)
- [API Reference](#-api-reference)
  - [Core Methods](#core-methods)
  - [Batch Operations](#batch-operations)
  - [Query Operations](#query-operations)
  - [Transactions](#transactions)
  - [Events](#events)
- [Encryption](#-encryption)
- [Compression](#-compression)
- [TypeScript](#-typescript)
- [Examples](#-examples)
- [Best Practices](#-best-practices)
- [Troubleshooting](#-troubleshooting)
- [FAQ](#-faq)
- [License](#-license)

## 🚀 Features

- 🚀 **GitHub-backed storage** - Your data stored in your own private repositories
- 🔄 **Automatic Scaling** - Creates new private repositories when storage limit is reached
- 💾 **Auto-save** - Every change automatically committed to GitHub
- 🔄 **Auto-sync** - Syncs with GitHub every 30 seconds (configurable)
- 📦 **Batch operations** - Set, delete, update multiple items at once
- 🔒 **Encryption** - Optional AES-256 encryption for sensitive data
- 🗜️ **Compression** - Optional gzip compression to reduce storage usage
- ⚡ **Caching** - Memory caching for fast reads
- 🔄 **Transactions** - Atomic operations with rollback support
- 📊 **Events** - Comprehensive lifecycle events for monitoring
- 🛡️ **Secure** - Never exposes tokens or sensitive data
- 📝 **TypeScript** - Full TypeScript support with type definitions
- 🔍 **Query Support** - Find, filter, and query your data
- 📈 **Performance Tracking** - Built-in performance metrics
- 🔗 **Nested Paths** - Support for deeply nested objects

## 📦 Installation

```bash
npm install shadowx-database
```

## 🚀 Quick Start

```javascript
const ShadowDB = require('shadowx-database');

// Initialize database
const db = new ShadowDB({
    token: 'github_pat_xxxxxxxxxxxxxxxxx',
    owner: 'your-github-username',
    repo: 'shadow-storage',
    branch: 'main'
});

// Connect to GitHub
await db.connect();

// Set data
await db.set('users', '123', {
    username: 'Shadow',
    coins: 500,
    level: 8,
    inventory: ['Sword', 'Shield']
});

// Get data
const user = await db.get('users', '123');
console.log(user); 
// { username: 'Shadow', coins: 500, level: 8, inventory: ['Sword', 'Shield'] }

// Nested operations
await db.set('users', '123.profile.username', 'ShadowX');
await db.add('users', '123.coins', 100);
await db.push('users', '123.inventory', 'Potion');

// Query data
const richUsers = await db.find('users', (key, value) => value.coins > 500);

// Delete data
await db.delete('users', '123');

// Disconnect
await db.disconnect();
```

## 🔑 GitHub Token Setup

1. Go to **GitHub Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
2. Click **Generate new token** → **Generate new token (classic)**
3. Give your token a descriptive name
4. Select the `repo` scope (required for repository access)
5. For automatic scaling, also ensure the token has permission to create repositories
6. Click **Generate token**
7. **Copy the token immediately** (you won't be able to see it again)

### Required Scopes

```
✅ repo (Full control of private repositories)
✅ workflow (Optional - for GitHub Actions)
✅ write:packages (Optional - for package management)
```

## 🗂️ Project Configuration

ShadowX Database automatically generates and saves a Project ID to ensure consistent storage across restarts.

### Auto-generation

On first run, a Project ID is generated and saved locally:

```bash
.shadowx/config.json
{
    "projectId": "a83df72bc1",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### Manual Override

```javascript
const db = new ShadowDB({
    token: 'github_pat_xxxxxxxxxxxxxxxxx',
    owner: 'your-github-username',
    repo: 'shadow-storage',
    projectId: 'my-custom-project-id' // Custom project ID
});
```

### Repository Structure

```
shadow-storage/
├── shadowx/
│   └── a83df72bc1/          # Project ID folder
│       ├── users.json
│       ├── economy.json
│       ├── settings.json
│       ├── inventory.json
│       └── config.json
└── shadowx-index/
    └── repositories.json     # Repository index for scaling
```

## 🔄 Automatic Repository Scaling

ShadowX Database automatically scales your storage across multiple private repositories.

### How It Works

1. **Monitoring**: The system continuously monitors repository size
2. **Detection**: When the configured limit is reached (default: 100MB)
3. **Creation**: Automatically creates a new **private** repository
4. **Routing**: New writes go to the new repository
5. **Transparency**: All operations work without developer intervention

### Configuration

```javascript
const db = new ShadowDB({
    token: 'github_pat_xxxxxxxxxxxxxxxxx',
    owner: 'your-github-username',
    repo: 'shadow-storage',
    
    // Scaling options
    scalingEnabled: true,              // Enable automatic scaling
    maxRepoSize: 100 * 1024 * 1024,    // 100MB limit (GitHub's soft limit)
    repoPrefix: 'shadow-storage',       // Prefix for new repositories
    branch: 'main'                     // Branch to use
});
```

### Repository Index

The system maintains an index in the base repository:

```json
{
    "projectId": "a83df72bc1",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z",
    "repositories": [
        {
            "name": "shadow-storage",
            "status": "full",
            "private": true,
            "createdAt": "2024-01-01T00:00:00.000Z",
            "filledAt": "2024-01-15T00:00:00.000Z",
            "collections": {
                "users": {
                    "registeredAt": "2024-01-01T00:00:00.000Z",
                    "path": "shadowx/a83df72bc1/users.json"
                }
            }
        },
        {
            "name": "shadow-storage-2",
            "status": "active",
            "private": true,
            "createdAt": "2024-01-15T00:00:00.000Z",
            "collections": {}
        }
    ]
}
```

### Data Routing

The system automatically routes data to the correct repository:

- `users` collection → `shadow-storage/users.json`
- `economy` collection → `shadow-storage-2/economy.json`

All operations work normally without knowing which repository contains the data.

## 📚 API Reference

### Core Methods

#### `db.set(collection, key, value)`

Set a value in a collection.

```javascript
await db.set('users', '123', { name: 'John', age: 30 });
await db.set('users', '123.profile.name', 'Johnny');
await db.set('users', '123.settings.theme', 'dark');
```

**Parameters:**
- `collection` (string): Collection name
- `key` (string): Document key (supports dot notation for nested paths)
- `value` (any): Value to set

**Returns:** Promise with the set value

---

#### `db.get(collection, key)`

Get a value from a collection.

```javascript
const user = await db.get('users', '123');
const name = await db.get('users', '123.profile.name');
const allUsers = await db.get('users'); // Get entire collection
```

**Parameters:**
- `collection` (string): Collection name
- `key` (string, optional): Document key (supports dot notation)

**Returns:** Promise with the value

---

#### `db.fetch(collection, key)`

Alias for `get()`.

```javascript
const user = await db.fetch('users', '123');
```

---

#### `db.delete(collection, key)`

Delete a key from a collection.

```javascript
await db.delete('users', '123');
await db.delete('users', '123.profile');
```

**Parameters:**
- `collection` (string): Collection name
- `key` (string): Document key to delete

**Returns:** Promise (void)

---

#### `db.has(collection, key)`

Check if a key exists.

```javascript
const exists = await db.has('users', '123');
```

**Parameters:**
- `collection` (string): Collection name
- `key` (string): Document key to check

**Returns:** Promise with boolean

---

#### `db.add(collection, path, number)`

Add to a numeric value.

```javascript
await db.add('users', '123.coins', 100);
await db.add('users', '123.stats.wins', 1);
```

**Parameters:**
- `collection` (string): Collection name
- `path` (string): Path to numeric value (supports dot notation)
- `number` (number): Amount to add

**Returns:** Promise with the new value

---

#### `db.subtract(collection, path, number)`

Subtract from a numeric value.

```javascript
await db.subtract('users', '123.coins', 50);
```

**Parameters:**
- `collection` (string): Collection name
- `path` (string): Path to numeric value (supports dot notation)
- `number` (number): Amount to subtract

**Returns:** Promise with the new value

---

#### `db.push(collection, path, value)`

Push a value to an array.

```javascript
await db.push('users', '123.inventory', 'Sword');
await db.push('users', '123.inventory', ['Shield', 'Potion']);
```

**Parameters:**
- `collection` (string): Collection name
- `path` (string): Path to array (supports dot notation)
- `value` (any): Value(s) to push

**Returns:** Promise with the updated array

---

#### `db.pull(collection, path, value)`

Remove a value from an array.

```javascript
await db.pull('users', '123.inventory', 'Sword');
await db.pull('users', '123.inventory', ['Shield', 'Potion']);
```

**Parameters:**
- `collection` (string): Collection name
- `path` (string): Path to array (supports dot notation)
- `value` (any): Value(s) to remove

**Returns:** Promise with the updated array

---

#### `db.ensure(collection, key, defaultValue)`

Ensure a key exists with a default value.

```javascript
const user = await db.ensure('users', '123', { 
    name: 'Guest', 
    coins: 0, 
    level: 1 
});
```

**Parameters:**
- `collection` (string): Collection name
- `key` (string): Document key
- `defaultValue` (any): Default value if key doesn't exist

**Returns:** Promise with the existing or default value

---

#### `db.all(collection)`

Get all entries in a collection.

```javascript
const allUsers = await db.all('users');
// { '123': { name: 'John', age: 30 }, '456': { name: 'Jane', age: 25 } }
```

**Parameters:**
- `collection` (string): Collection name

**Returns:** Promise with all entries

---

#### `db.keys(collection)`

Get all keys in a collection.

```javascript
const keys = await db.keys('users'); // ['123', '456']
```

**Parameters:**
- `collection` (string): Collection name

**Returns:** Promise with array of keys

---

#### `db.values(collection)`

Get all values in a collection.

```javascript
const values = await db.values('users');
// [{ name: 'John', age: 30 }, { name: 'Jane', age: 25 }]
```

**Parameters:**
- `collection` (string): Collection name

**Returns:** Promise with array of values

---

#### `db.size(collection)`

Get the number of entries in a collection.

```javascript
const count = await db.size('users'); // 2
```

**Parameters:**
- `collection` (string): Collection name

**Returns:** Promise with entry count

---

#### `db.clear(collection)`

Clear all entries in a collection.

```javascript
await db.clear('users');
```

**Parameters:**
- `collection` (string): Collection name

**Returns:** Promise (void)

---

### Query Operations

#### `db.find(collection, callback)`

Find entries matching a condition.

```javascript
// Find users with more than 100 coins
const results = await db.find('users', (key, value) => value.coins > 100);

// Find users with level 5 or higher
const leveledUsers = await db.find('users', (key, value) => value.level >= 5);
```

**Parameters:**
- `collection` (string): Collection name
- `callback` (function): Filter function `(key, value) => boolean`

**Returns:** Promise with array of `{ key, value }` objects

---

#### `db.filter(collection, callback)`

Filter entries by a condition (returns object).

```javascript
const filtered = await db.filter('users', (key, value) => value.age >= 18);
// { '123': { name: 'John', age: 30 }, '456': { name: 'Jane', age: 25 } }
```

**Parameters:**
- `collection` (string): Collection name
- `callback` (function): Filter function `(key, value) => boolean`

**Returns:** Promise with filtered entries as object

---

#### `db.random(collection)`

Get a random entry.

```javascript
const randomUser = await db.random('users');
// { key: '456', value: { name: 'Jane', age: 25 } }
```

**Parameters:**
- `collection` (string): Collection name

**Returns:** Promise with random entry or null

---

#### `db.randomKey(collection)`

Get a random key.

```javascript
const randomKey = await db.randomKey('users'); // '456'
```

**Parameters:**
- `collection` (string): Collection name

**Returns:** Promise with random key or null

---

### Batch Operations

#### `db.setMany(collection, entries)`

Set multiple entries at once.

```javascript
await db.setMany('users', [
    { key: '123', value: { name: 'John', age: 30 } },
    { key: '456', value: { name: 'Jane', age: 25 } },
    { key: '789', value: { name: 'Bob', age: 35 } }
]);
```

**Parameters:**
- `collection` (string): Collection name
- `entries` (array): Array of `{ key, value }` objects

**Returns:** Promise (void)

---

#### `db.getMany(collection, keys)`

Get multiple entries at once.

```javascript
const users = await db.getMany('users', ['123', '456']);
// { '123': { name: 'John', age: 30 }, '456': { name: 'Jane', age: 25 } }
```

**Parameters:**
- `collection` (string): Collection name
- `keys` (array): Array of keys

**Returns:** Promise with object of entries

---

#### `db.deleteMany(collection, keys)`

Delete multiple entries at once.

```javascript
await db.deleteMany('users', ['123', '456']);
```

**Parameters:**
- `collection` (string): Collection name
- `keys` (array): Array of keys to delete

**Returns:** Promise (void)

---

#### `db.updateMany(collection, updates)`

Update multiple entries at once.

```javascript
await db.updateMany('users', [
    { key: '123', value: { age: 31 } },
    { key: '456', value: { age: 26 } }
]);
```

**Parameters:**
- `collection` (string): Collection name
- `updates` (array): Array of `{ key, value }` objects

**Returns:** Promise (void)

---

### Transactions

```javascript
// Create a transaction
const tx = await db.transaction();

try {
    // Perform operations
    await tx.set('users', '123', { name: 'John', coins: 100 });
    await tx.add('users', '123.coins', 50);
    await tx.push('users', '123.inventory', 'Sword');
    
    // Commit the transaction
    await tx.commit();
    console.log('Transaction committed successfully');
} catch (error) {
    // Rollback on error
    await tx.rollback();
    console.error('Transaction failed, rolled back:', error);
}
```

**Transaction Methods:**
- `tx.set(collection, key, value)`: Set operation
- `tx.add(collection, path, number)`: Add operation
- `tx.push(collection, path, value)`: Push operation
- `tx.delete(collection, key)`: Delete operation
- `tx.commit()`: Commit the transaction
- `tx.rollback()`: Rollback the transaction

---

### Events

ShadowX Database provides comprehensive event system for monitoring and debugging.

```javascript
// Connection events
db.on('connect', () => console.log('Connected to GitHub'));
db.on('disconnect', () => console.log('Disconnected from GitHub'));
db.on('ready', () => console.log('Database ready'));
db.on('connecting', () => console.log('Connecting...'));
db.on('disconnecting', () => console.log('Disconnecting...'));

// Data events
db.on('set', ({ collection, key }) => console.log(`Set ${collection}.${key}`));
db.on('get', ({ collection, key }) => console.log(`Get ${collection}.${key}`));
db.on('delete', ({ collection, key }) => console.log(`Deleted ${collection}.${key}`));
db.on('clear', ({ collection }) => console.log(`Cleared ${collection}`));
db.on('save', ({ collection }) => console.log(`Saved ${collection}`));

// Batch events
db.on('setMany', ({ collection, count }) => console.log(`Set ${count} items in ${collection}`));
db.on('getMany', ({ collection, count }) => console.log(`Got ${count} items from ${collection}`));
db.on('deleteMany', ({ collection, count }) => console.log(`Deleted ${count} items from ${collection}`));

// Operation events
db.on('add', ({ collection, path, number }) => console.log(`Added ${number} to ${collection}.${path}`));
db.on('subtract', ({ collection, path, number }) => console.log(`Subtracted ${number} from ${collection}.${path}`));
db.on('push', ({ collection, path, value }) => console.log(`Pushed to ${collection}.${path}`));
db.on('pull', ({ collection, path, value }) => console.log(`Pulled from ${collection}.${path}`));

// Sync events
db.on('sync', ({ status }) => console.log(`Sync: ${status}`));
db.on('sync-start', () => console.log('Sync started'));
db.on('sync-complete', ({ collections }) => console.log(`Synced ${collections} collections`));
db.on('sync-error', (error) => console.error('Sync error:', error));
db.on('collection-synced', ({ collection }) => console.log(`Collection synced: ${collection}`));

// Cache events
db.on('cache', (hit) => console.log(`Cache ${hit ? 'hit' : 'miss'}`));
db.on('cache-hit', ({ collection, key }) => console.log(`Cache hit: ${collection}.${key}`));
db.on('cache-miss', ({ collection, key }) => console.log(`Cache miss: ${collection}.${key}`));
db.on('cache-clear', () => console.log('Cache cleared'));

// Repository events
db.on('repository-created', ({ name, private: isPrivate }) => {
    console.log(`New ${isPrivate ? 'private' : 'public'} repository created: ${name}`);
});
db.on('repository-full', ({ name }) => console.log(`Repository full: ${name}`));
db.on('repository-switched', ({ from, to }) => console.log(`Switched from ${from} to ${to}`));

// Transaction events
db.on('transaction-start', () => console.log('Transaction started'));
db.on('transaction-commit', (result) => console.log('Transaction committed:', result));
db.on('transaction-rollback', (result) => console.log('Transaction rolled back:', result));
db.on('transaction-error', (error) => console.error('Transaction error:', error));

// Error events
db.on('error', (error) => console.error('Error:', error.message));
db.on('warning', (warning) => console.warn('Warning:', warning));

// Performance events
db.on('performance', ({ operation, duration, cache }) => {
    console.log(`${operation} took ${duration}ms ${cache ? '(cached)' : ''}`);
});

// Advanced event features
// Wait for event
try {
    const [data] = await db.waitFor('ready', 30000);
    console.log('Database is ready!');
} catch (error) {
    console.error('Timeout waiting for database');
}

// Debounce events
const cleanup = db.debounce('save', (data) => {
    console.log('Debounced save:', data.collection);
}, 1000);

// Get event history
const history = db.getEventHistory({
    event: 'repository-created',
    limit: 5
});

// Get event statistics
const stats = db.getStats();
console.log('Event stats:', stats);
```

## 🔒 Encryption

Encrypt data with AES-256-GCM before storing on GitHub.

```javascript
const db = new ShadowDB({
    token: 'github_pat_xxxxxxxxxxxxxxxxx',
    owner: 'your-github-username',
    repo: 'shadow-storage',
    encryptionKey: 'my-encryption-key-at-least-32-characters'
});
```

**Important:** 
- Key must be at least 32 characters
- Store the key securely (e.g., environment variables)
- Never commit encryption keys to version control
- Data is encrypted before upload and decrypted after download

## 🗜️ Compression

Compress data with gzip to reduce storage usage.

```javascript
const db = new ShadowDB({
    token: 'github_pat_xxxxxxxxxxxxxxxxx',
    owner: 'your-github-username',
    repo: 'shadow-storage',
    compression: true
});
```

**Benefits:**
- Reduces storage usage by up to 70-90%
- Faster uploads and downloads
- Reduces GitHub API usage

## 📝 TypeScript

Full TypeScript support with type definitions.

### Basic Usage

```typescript
import ShadowDB, { ShadowDBOptions } from 'shadowx-database';

interface User {
    username: string;
    level: number;
    coins: number;
    inventory: string[];
}

const options: ShadowDBOptions = {
    token: process.env.GITHUB_TOKEN!,
    owner: 'your-username',
    repo: 'shadow-storage',
    encryptionKey: process.env.ENCRYPTION_KEY
};

const db = new ShadowDB(options);
await db.connect();

// Type-safe operations
await db.set<User>('users', '123', {
    username: 'Shadow',
    level: 10,
    coins: 5000,
    inventory: ['Sword', 'Shield']
});

const user = await db.get<User>('users', '123');
console.log(user?.username);

// Type-safe find
const highLevelUsers = await db.find<User>('users', (key, value) => value.level > 5);

// Type-safe batch operations
await db.setMany<User>('users', [
    { key: '456', value: { username: 'Hunter', level: 8, coins: 3000, inventory: [] } }
]);
```

### Custom Types

```typescript
interface PlayerStats {
    wins: number;
    losses: number;
    winRate: number;
}

interface Player {
    id: string;
    name: string;
    level: number;
    stats: PlayerStats;
}

const player = await db.get<Player>('players', '123');
console.log(player?.stats.winRate);
```

## 💡 Examples

### Complete Example

```javascript
const ShadowDB = require('shadowx-database');

async function main() {
    // Initialize database
    const db = new ShadowDB({
        token: process.env.GITHUB_TOKEN,
        owner: process.env.GITHUB_OWNER,
        repo: process.env.GITHUB_REPO,
        compression: true,
        verbose: true
    });

    // Event handlers
    db.on('connect', () => console.log('✅ Connected'));
    db.on('ready', () => console.log('✅ Database ready'));
    db.on('error', (error) => console.error('❌ Error:', error.message));

    // Connect
    await db.connect();

    // Create a user with transaction
    const tx = await db.transaction();
    try {
        await tx.set('users', '123', {
            username: 'ShadowMaster',
            level: 1,
            coins: 100,
            inventory: [],
            stats: { wins: 0, losses: 0 }
        });
        await tx.add('users', '123.coins', 500);
        await tx.push('users', '123.inventory', 'Legendary Sword');
        await tx.commit();
        console.log('✅ User created with transaction');
    } catch (error) {
        await tx.rollback();
        console.error('Transaction failed:', error);
    }

    // Get user data
    const user = await db.get('users', '123');
    console.log('👤 User:', user);

    // Query users
    const richUsers = await db.find('users', (key, value) => value.coins > 500);
    console.log('💰 Rich users:', richUsers);

    // Batch operations
    await db.setMany('users', [
        { key: '456', value: { username: 'ShadowHunter', level: 8, coins: 750 } },
        { key: '789', value: { username: 'ShadowMage', level: 6, coins: 600 } }
    ]);

    // Get database info
    const info = await db.getInfo();
    console.log('📊 Database info:', {
        projectId: info.projectId,
        repositories: info.repositoryStats.total,
        collections: info.syncStatus.collections
    });

    // Disconnect
    await db.disconnect();
    console.log('✅ Disconnected');
}

main().catch(console.error);
```

### Express.js Integration

```javascript
const express = require('express');
const ShadowDB = require('shadowx-database');

const app = express();
app.use(express.json());

const db = new ShadowDB({
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO
});

// Connect on startup
db.connect().then(() => {
    console.log('Database connected');
});

// Routes
app.post('/users/:id', async (req, res) => {
    try {
        await db.set('users', req.params.id, req.body);
        res.json({ success: true, id: req.params.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/users/:id', async (req, res) => {
    try {
        const user = await db.get('users', req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/users', async (req, res) => {
    try {
        const users = await db.all('users');
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000);
```

## 💡 Best Practices

### 1. Use Environment Variables

```javascript
const db = new ShadowDB({
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER,
    repo: process.env.GITHUB_REPO,
    encryptionKey: process.env.ENCRYPTION_KEY
});
```

### 2. Handle Errors Gracefully

```javascript
try {
    await db.set('users', '123', data);
} catch (error) {
    if (error.code === 'RATE_LIMIT_EXCEEDED') {
        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 60000));
        await db.set('users', '123', data);
    } else if (error.code === 'INVALID_TOKEN') {
        console.error('Invalid GitHub token. Please check your credentials.');
    } else {
        console.error('Unexpected error:', error);
    }
}
```

### 3. Use Transactions for Multiple Operations

```javascript
const tx = await db.transaction();
try {
    await tx.setMany('users', updates);
    await tx.commit();
} catch (error) {
    await tx.rollback();
    throw error;
}
```

### 4. Enable Compression for Large Datasets

```javascript
const db = new ShadowDB({
    ...config,
    compression: true // Reduces storage and API usage by 70-90%
});
```

### 5. Use Proper Project IDs

```javascript
// For different applications
const db1 = new ShadowDB({ ...config, projectId: 'app1' });
const db2 = new ShadowDB({ ...config, projectId: 'app2' });
// Each app has its own folder in the repository
```

### 6. Monitor Repository Usage

```javascript
const info = await db.getInfo();
console.log('Repository usage:', {
    total: info.repositoryStats.total,
    active: info.repositoryStats.active.length,
    full: info.repositoryStats.full.length
});

// Check if scaling is needed
if (info.repositoryStats.full.length > 0) {
    console.log('⚠️ Some repositories are full, scaling may be needed');
}
```

### 7. Implement Retry Logic

```javascript
async function withRetry(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        }
    }
}

await withRetry(() => db.set('users', '123', data));
```

## 🔧 Troubleshooting

### Common Errors

#### ❌ Invalid token

**Error:** `Invalid GitHub token or authentication failed`

**Solution:**
1. Ensure your GitHub token has `repo` scope
2. Check if token is still valid (not expired)
3. Generate a new token if needed

#### ❌ Repository not found

**Error:** `Repository not found`

**Solution:**
1. Verify repository name is correct
2. Ensure repository exists and you have access
3. Check if repository is private and token has access

#### ❌ Rate limit exceeded

**Error:** `GitHub API rate limit exceeded`

**Solution:**
1. Wait and retry with exponential backoff
2. Reduce the number of operations
3. Use batch operations to minimize API calls
4. Enable compression to reduce data transfer

#### ❌ Permission denied

**Error:** `Permission denied`

**Solution:**
1. Check token has `repo` scope
2. For scaling, token needs permission to create repositories
3. Verify repository permissions

#### ❌ Merge conflict

**Error:** `Merge conflict detected`

**Solution:**
1. Auto-resolved by fetching latest data and merging
2. If conflict persists, check concurrent writes
3. Use transactions for atomic operations

### Debugging

Enable verbose logging for debugging:

```javascript
const db = new ShadowDB({
    ...config,
    verbose: true
});
```

Check event history:

```javascript
const history = db.getEventHistory();
console.log('Recent events:', history);
```

Get performance metrics:

```javascript
const metrics = db.getPerformanceMetrics();
console.log('Performance:', metrics);
```

## ❓ FAQ

**Q: Can I use this in production?**
A: Yes, but consider GitHub API rate limits and network latency. It's suitable for small to medium-sized applications.

**Q: How much data can I store?**
A: GitHub file size limit is 100MB per file. The automatic scaling feature creates new repositories when the limit is reached.

**Q: Is data backed up?**
A: Yes, GitHub provides version control and you can revert changes.

**Q: How does syncing work?**
A: The database syncs with GitHub every 30 seconds by default. You can configure the interval.

**Q: Can I disable auto-sync?**
A: Yes, set `autoSync: false` in options and manually sync with `await db.sync()`.

**Q: Are repositories private?**
A: Yes, all repositories created by ShadowX Database are private by default.

**Q: What happens when a repository is full?**
A: The system automatically creates a new private repository and routes new data to it.

**Q: How many repositories can I have?**
A: GitHub doesn't limit the number of repositories. The system scales as needed.

**Q: Can I use my own encryption?**
A: Yes, you can provide your own encryption key or use the built-in AES-256 encryption.

**Q: Does this work with GitHub Enterprise?**
A: Yes, you can configure the base URL for GitHub Enterprise.

**Q: Can I use this offline?**
A: No, this requires GitHub API access for storage.

**Q: Is there a size limit per collection?**
A: Each collection is stored as a JSON file with a 100MB limit per file.

**Q: How do I migrate data between projects?**
A: Copy the repository files to the new project's repository with the same project ID.

**Q: Can I share data between applications?**
A: Yes, by using the same project ID and repository.


## 📄 License

MIT License

Copyright (c) 2024 Mueid Mursalin Rifat

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

## 👨‍💻 Author

**Mueid Mursalin Rifat**

- GitHub: (https://github.com/mueidmursalinrifat)
- Email: mueidmursalinr@gmail.com

## ⭐ Star History

If you find this project useful, please give it a star ⭐ on GitHub!

---

**Built with ❤️ by Mueid Mursalin Rifat**
```

This complete README.md provides:

1. **Comprehensive Documentation**: All features explained in detail
2. **Quick Start**: Get up and running quickly
3. **Full API Reference**: All methods with examples
4. **Event System**: Complete event documentation
5. **TypeScript Support**: Type definitions and examples
6. **Best Practices**: Production-ready patterns
7. **Troubleshooting**: Common issues and solutions
8. **FAQ**: Frequently asked questions
9. **Examples**: Real-world usage examples
10. **Professional Formatting**: Clean, organized, and easy to read
