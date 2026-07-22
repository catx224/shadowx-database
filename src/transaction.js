/**
 * Transaction manager for ShadowX Database
 */

const CollectionManager = require('./collection');
const Utils = require('./utils');
const { ShadowXError, ErrorCodes } = require('./errors');

class Transaction {
  constructor(database) {
    this.database = database;
    this.operations = [];
    this.committed = false;
    this.rolledBack = false;
    this.initialStates = new Map();
  }

  /**
   * Set operation
   */
  async set(collection, key, value) {
    if (this.committed || this.rolledBack) {
      throw new ShadowXError('Transaction already completed', ErrorCodes.TRANSACTION_FAILED, 400);
    }

    this.operations.push({
      type: 'set',
      collection,
      key,
      value
    });
  }

  /**
   * Add operation
   */
  async add(collection, path, number) {
    if (this.committed || this.rolledBack) {
      throw new ShadowXError('Transaction already completed', ErrorCodes.TRANSACTION_FAILED, 400);
    }

    this.operations.push({
      type: 'add',
      collection,
      path,
      number
    });
  }

  /**
   * Push operation
   */
  async push(collection, path, value) {
    if (this.committed || this.rolledBack) {
      throw new ShadowXError('Transaction already completed', ErrorCodes.TRANSACTION_FAILED, 400);
    }

    this.operations.push({
      type: 'push',
      collection,
      path,
      value
    });
  }

  /**
   * Delete operation
   */
  async delete(collection, key) {
    if (this.committed || this.rolledBack) {
      throw new ShadowXError('Transaction already completed', ErrorCodes.TRANSACTION_FAILED, 400);
    }

    this.operations.push({
      type: 'delete',
      collection,
      key
    });
  }

  /**
   * Commit transaction
   */
  async commit() {
    if (this.committed) {
      throw new ShadowXError('Transaction already committed', ErrorCodes.TRANSACTION_FAILED, 400);
    }

    if (this.rolledBack) {
      throw new ShadowXError('Transaction already rolled back', ErrorCodes.TRANSACTION_FAILED, 400);
    }

    if (this.operations.length === 0) {
      throw new ShadowXError('No operations to commit', ErrorCodes.TRANSACTION_FAILED, 400);
    }

    try {
      const collectionOps = new Map();
      
      for (const op of this.operations) {
        if (!collectionOps.has(op.collection)) {
          collectionOps.set(op.collection, []);
        }
        collectionOps.get(op.collection).push(op);
      }

      const results = [];
      for (const [collection, ops] of collectionOps) {
        const manager = new CollectionManager(this.database, collection);
        
        await manager.load();
        this.initialStates.set(collection, Utils.deepClone(manager.data));

        for (const op of ops) {
          switch (op.type) {
            case 'set':
              await manager.set(op.key, op.value);
              break;
            case 'add':
              await manager.add(op.path, op.number);
              break;
            case 'push':
              await manager.push(op.path, op.value);
              break;
            case 'delete':
              await manager.delete(op.key);
              break;
          }
        }

        await manager.save();
        results.push({ collection, operations: ops.length });
      }

      this.committed = true;
      return {
        success: true,
        operations: this.operations.length,
        collections: results
      };
    } catch (error) {
      await this.rollback();
      throw new ShadowXError(
        `Transaction failed: ${error.message}`,
        ErrorCodes.TRANSACTION_FAILED,
        500,
        { originalError: error.message }
      );
    }
  }

  /**
   * Rollback transaction
   */
  async rollback() {
    if (this.committed) {
      throw new ShadowXError('Cannot rollback committed transaction', ErrorCodes.TRANSACTION_FAILED, 400);
    }

    if (this.rolledBack) {
      return;
    }

    try {
      for (const [collection, initialState] of this.initialStates) {
        const manager = new CollectionManager(this.database, collection);
        manager.setData(initialState);
        await manager.save();
      }

      this.rolledBack = true;
      return {
        success: true,
        message: 'Transaction rolled back successfully'
      };
    } catch (error) {
      throw new ShadowXError(
        `Rollback failed: ${error.message}`,
        ErrorCodes.TRANSACTION_FAILED,
        500,
        { originalError: error.message }
      );
    }
  }
}

module.exports = Transaction;
