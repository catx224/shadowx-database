/**
 * Event system for ShadowX Database
 * Provides event handling and management
 */

const { EventEmitter } = require('events');

class EventManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.maxListeners = options.maxListeners || 50;
    this.setMaxListeners(this.maxListeners);
    this.eventHistory = [];
    this.historyLimit = options.historyLimit || 100;
    this.listeners = new Map();
  }

  /**
   * Register an event listener
   */
  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(listener);
    super.on(event, listener);
    return this;
  }

  /**
   * Register a one-time event listener
   */
  once(event, listener) {
    const onceListener = (...args) => {
      listener(...args);
      this.removeListener(event, onceListener);
    };
    this.on(event, onceListener);
    return this;
  }

  /**
   * Remove an event listener
   */
  off(event, listener) {
    if (this.listeners.has(event)) {
      const listeners = this.listeners.get(event);
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
        super.removeListener(event, listener);
      }
      if (listeners.length === 0) {
        this.listeners.delete(event);
      }
    }
    return this;
  }

  /**
   * Remove all listeners for an event
   */
  removeAllListeners(event) {
    if (event) {
      this.listeners.delete(event);
      super.removeAllListeners(event);
    } else {
      this.listeners.clear();
      super.removeAllListeners();
    }
    return this;
  }

  /**
   * Emit an event with history tracking
   */
  emit(event, ...args) {
    // Track event history
    this.eventHistory.push({
      event,
      args: args.map(arg => this.sanitizeArg(arg)),
      timestamp: new Date().toISOString()
    });

    // Limit history size
    if (this.eventHistory.length > this.historyLimit) {
      this.eventHistory.shift();
    }

    // Emit the event
    return super.emit(event, ...args);
  }

  /**
   * Sanitize arguments for history (remove sensitive data)
   */
  sanitizeArg(arg) {
    if (typeof arg === 'string' && arg.length > 100) {
      return arg.substring(0, 100) + '...';
    }
    if (typeof arg === 'object' && arg !== null) {
      const sanitized = { ...arg };
      // Remove sensitive fields
      const sensitiveFields = ['token', 'password', 'secret', 'key'];
      for (const field of sensitiveFields) {
        if (sanitized[field]) {
          sanitized[field] = '***REDACTED***';
        }
      }
      return sanitized;
    }
    return arg;
  }

  /**
   * Get event history
   */
  getEventHistory(options = {}) {
    let history = this.eventHistory;
    
    if (options.event) {
      history = history.filter(entry => entry.event === options.event);
    }
    
    if (options.limit) {
      history = history.slice(-options.limit);
    }
    
    if (options.since) {
      const since = new Date(options.since);
      history = history.filter(entry => new Date(entry.timestamp) >= since);
    }
    
    return history;
  }

  /**
   * Clear event history
   */
  clearHistory() {
    this.eventHistory = [];
    return this;
  }

  /**
   * Get event listener count for an event
   */
  listenerCount(event) {
    return super.listenerCount(event);
  }

  /**
   * Get all registered event names
   */
  eventNames() {
    return super.eventNames();
  }

  /**
   * Get statistics about events
   */
  getStats() {
    const stats = {
      totalEvents: this.eventHistory.length,
      uniqueEvents: new Set(this.eventHistory.map(e => e.event)).size,
      listenerCount: this.listeners.size,
      events: {}
    };

    for (const [event, listeners] of this.listeners) {
      stats.events[event] = {
        listeners: listeners.length,
        occurrences: this.eventHistory.filter(e => e.event === event).length
      };
    }

    return stats;
  }

  /**
   * Wait for an event to occur
   */
  waitFor(event, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off(event, listener);
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);

      const listener = (...args) => {
        clearTimeout(timeoutId);
        this.off(event, listener);
        resolve(args);
      };

      this.once(event, listener);
    });
  }

  /**
   * Create a debounced event listener
   */
  debounce(event, listener, delay = 1000) {
    let timeoutId = null;
    
    const debouncedListener = (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        listener(...args);
        timeoutId = null;
      }, delay);
    };

    this.on(event, debouncedListener);
    
    return () => {
      clearTimeout(timeoutId);
      this.off(event, debouncedListener);
    };
  }

  /**
   * Create a throttled event listener
   */
  throttle(event, listener, limit = 1000) {
    let lastCall = 0;
    let timeoutId = null;
    
    const throttledListener = (...args) => {
      const now = Date.now();
      const remaining = limit - (now - lastCall);
      
      if (remaining <= 0) {
        lastCall = now;
        listener(...args);
      } else if (!timeoutId) {
        timeoutId = setTimeout(() => {
          lastCall = Date.now();
          timeoutId = null;
          listener(...args);
        }, remaining);
      }
    };

    this.on(event, throttledListener);
    
    return () => {
      clearTimeout(timeoutId);
      this.off(event, throttledListener);
    };
  }

  /**
   * Pipe events from one emitter to another
   */
  pipe(source, event, target, targetEvent = null) {
    const listener = (...args) => {
      target.emit(targetEvent || event, ...args);
    };
    
    source.on(event, listener);
    return () => {
      source.off(event, listener);
    };
  }

  /**
   * Log all events for debugging
   */
  enableLogging(logger = console.log) {
    const originalEmit = this.emit.bind(this);
    
    this.emit = (event, ...args) => {
      logger(`[Event] ${event}`, ...args);
      return originalEmit(event, ...args);
    };
    
    return () => {
      this.emit = originalEmit;
    };
  }
}

/**
 * Predefined event types
 */
const EventTypes = {
  // Connection events
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  READY: 'ready',
  CONNECTING: 'connecting',
  DISCONNECTING: 'disconnecting',

  // Data events
  SET: 'set',
  GET: 'get',
  DELETE: 'delete',
  UPDATE: 'update',
  CLEAR: 'clear',

  // Batch events
  SET_MANY: 'setMany',
  GET_MANY: 'getMany',
  DELETE_MANY: 'deleteMany',
  UPDATE_MANY: 'updateMany',

  // Operation events
  ADD: 'add',
  SUBTRACT: 'subtract',
  PUSH: 'push',
  PULL: 'pull',
  ENSURE: 'ensure',

  // Sync events
  SYNC: 'sync',
  SYNC_START: 'sync-start',
  SYNC_COMPLETE: 'sync-complete',
  SYNC_ERROR: 'sync-error',
  COLLECTION_SYNCED: 'collection-synced',

  // Save events
  SAVE: 'save',
  SAVE_START: 'save-start',
  SAVE_COMPLETE: 'save-complete',
  SAVE_ERROR: 'save-error',

  // Cache events
  CACHE: 'cache',
  CACHE_HIT: 'cache-hit',
  CACHE_MISS: 'cache-miss',
  CACHE_CLEAR: 'cache-clear',

  // Transaction events
  TRANSACTION_START: 'transaction-start',
  TRANSACTION_COMMIT: 'transaction-commit',
  TRANSACTION_ROLLBACK: 'transaction-rollback',
  TRANSACTION_ERROR: 'transaction-error',

  // Repository events
  REPOSITORY_CREATED: 'repository-created',
  REPOSITORY_SWITCHED: 'repository-switched',
  REPOSITORY_FULL: 'repository-full',
  REPOSITORY_ERROR: 'repository-error',

  // Error events
  ERROR: 'error',
  WARNING: 'warning',
  RATE_LIMIT: 'rate-limit',

  // Performance events
  PERFORMANCE: 'performance',
  CACHE_STATS: 'cache-stats'
};

module.exports = {
  EventManager,
  EventTypes
};
