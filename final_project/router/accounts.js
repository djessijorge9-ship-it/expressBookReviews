const { randomBytes, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const deriveKey = promisify(scrypt);
const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};
function validCredentials(body) {
  return typeof body?.username === 'string' &&
    /^[A-Za-z0-9_.-]{1,64}$/.test(body.username) &&
    typeof body.password === 'string' &&
    body.password.length > 0 && body.password.length <= 256;
}
function createAccounts() {
  const users = new Map();
  return {
    isValid: (username) => users.has(username),
    async register(username, password) {
      if (users.has(username)) return false;
      const salt = randomBytes(16).toString('hex');
      const passwordHash = await deriveKey(password, salt, 64);
      // A concurrent registration may have completed while hashing.
      if (users.has(username)) return false;
      users.set(username, { salt, passwordHash });
      return true;
    },
    async authenticatedUser(username, password) {
      const user = users.get(username);
      if (!user) return false;
      const suppliedHash = await deriveKey(password, user.salt, 64);
      return timingSafeEqual(suppliedHash, user.passwordHash);
    }
  };
}
module.exports = { createAccounts, validCredentials, asyncHandler };
