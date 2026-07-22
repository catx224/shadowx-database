/**
 * ShadowX Database - GitHub-backed NoSQL database with automatic scaling
 * Developed by Mueid Mursalin Rifat
 */

const Database = require('./database');
const { ShadowXError, ErrorCodes } = require('./errors');

module.exports = Database;
module.exports.ShadowXError = ShadowXError;
module.exports.ErrorCodes = ErrorCodes;
module.exports.default = Database;
