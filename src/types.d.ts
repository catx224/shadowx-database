/**
 * Type definitions for ShadowX Database
 */

export interface ShadowDBOptions {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
  projectId?: string;
  encryptionKey?: string;
  compression?: boolean;
  verbose?: boolean;
  cacheTTL?: number;
  syncInterval?: number;
  autoSync?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  scalingEnabled?: boolean;
  maxRepoSize?: number;
  repoPrefix?: string;
}

export interface Repository {
  name: string;
  status: 'active' | 'full' | 'error';
  createdAt: string;
  filledAt?: string;
  exists?: boolean;
  private: boolean;
  collections?: Record<string, {
    registeredAt: string;
    path: string;
  }>;
}

export interface RepositoryStats {
  total: number;
  active: Repository[];
  full: Repository[];
  collections: Record<string, {
    size: number;
    collections: number;
    private: boolean;
    error?: string;
  }>;
}

export interface DatabaseInfo {
  connected: boolean;
  ready: boolean;
  projectId: string;
  owner: string;
  baseRepo: string;
  branch: string;
  compression: boolean;
  encryption: boolean;
  autoSync: boolean;
  syncInterval: number;
  scalingEnabled: boolean;
  maxRepoSize: number;
  cacheStats: CacheStats;
  syncStatus: SyncStatus;
  repositoryStats: RepositoryStats;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
}

export interface SyncStatus {
  enabled: boolean;
  running: boolean;
  syncing: boolean;
  lastSync: Date | null;
  interval: number;
  collections: number;
}

export interface FindResult<T = any> {
  key: string;
  value: T;
}

export interface TransactionResult {
  success: boolean;
  operations: number;
  collections: Array<{
    collection: string;
    operations: number;
  }>;
}

export interface RollbackResult {
  success: boolean;
  message: string;
}

export interface BatchEntry<T = any> {
  key: string;
  value: T;
}

export interface UpdateEntry<T = any> {
  key: string;
  value: Partial<T>;
}

export interface CollectionStats {
  repository: string;
  size: number;
  keys: number;
  private: boolean;
  error?: string;
}

declare class Database {
  constructor(options: ShadowDBOptions);
  connect(): Promise<Database>;
  disconnect(): Promise<Database>;
  
  set<T = any>(collection: string, key: string, value: T): Promise<T>;
  get<T = any>(collection: string, key?: string): Promise<T | undefined>;
  fetch<T = any>(collection: string, key?: string): Promise<T | undefined>;
  delete(collection: string, key: string): Promise<void>;
  has(collection: string, key: string): Promise<boolean>;
  
  add(collection: string, path: string, number: number): Promise<number>;
  subtract(collection: string, path: string, number: number): Promise<number>;
  
  push(collection: string, path: string, value: any): Promise<any[]>;
  pull(collection: string, path: string, value: any): Promise<any[]>;
  
  ensure<T = any>(collection: string, key: string, defaultValue: T): Promise<T>;
  all<T = any>(collection: string): Promise<Record<string, T>>;
  keys(collection: string): Promise<string[]>;
  values<T = any>(collection: string): Promise<T[]>;
  size(collection: string): Promise<number>;
  clear(collection: string): Promise<void>;
  
  find<T = any>(collection: string, callback: (key: string, value: T) => boolean): Promise<FindResult<T>[]>;
  filter<T = any>(collection: string, callback: (key: string, value: T) => boolean): Promise<Record<string, T>>;
  random<T = any>(collection: string): Promise<FindResult<T> | null>;
  randomKey(collection: string): Promise<string | null>;
  
  setMany<T = any>(collection: string, entries: BatchEntry<T>[]): Promise<void>;
  getMany<T = any>(collection: string, keys: string[]): Promise<Record<string, T>>;
  deleteMany(collection: string, keys: string[]): Promise<void>;
  updateMany<T = any>(collection: string, updates: UpdateEntry<T>[]): Promise<void>;
  
  transaction(): Promise<Transaction>;
  
  listCollections(): Promise<string[]>;
  getCollectionStats(collection: string): Promise<CollectionStats[]>;
  
  getInfo(): Promise<DatabaseInfo>;
  sync(): Promise<void>;
  
  on(event: 'ready' | 'connect' | 'disconnect' | 'save' | 'sync' | 'cache' | 'error' | 'repository-created', listener: (...args: any[]) => void): this;
  emit(event: string, ...args: any[]): boolean;
}

declare class Transaction {
  set(collection: string, key: string, value: any): Promise<void>;
  add(collection: string, path: string, number: number): Promise<void>;
  push(collection: string, path: string, value: any): Promise<void>;
  delete(collection: string, key: string): Promise<void>;
  commit(): Promise<TransactionResult>;
  rollback(): Promise<RollbackResult>;
}

export default Database;
