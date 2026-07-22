/**
 * ShadowX Database - GitHub-backed NoSQL database with automatic scaling
 * Developed by Mueid Mursalin Rifat
 */

const Database = require('./database');
const { ShadowXError, ErrorCodes } = require('./errors');
const { EventManager, EventTypes } = require('./events');

module.exports = Database;
module.exports.ShadowXError = ShadowXError;
module.exports.ErrorCodes = ErrorCodes;
module.exports.EventManager = EventManager;
module.exports.EventTypes = EventTypes;
module.exports.default = Database;
