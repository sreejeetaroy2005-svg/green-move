// GreenMove — logger.js — refined for Round 2
/**
 * Simple logger replacing console.log for consistent formatting
 * Features [GreenMove] prefix and ISO timestamp
 */

function formatMessage(level, args) {
  const timestamp = new Date().toISOString();
  return [`[GreenMove] [${timestamp}] [${level}]`, ...args];
}

const logger = {
  info: (...args) => console.log(...formatMessage('INFO', args)),
  error: (...args) => console.error(...formatMessage('ERROR', args)),
  warn: (...args) => console.warn(...formatMessage('WARN', args)),
  debug: (...args) => console.debug(...formatMessage('DEBUG', args))
};

module.exports = logger;
