// IBM Book Review final project: public reads and session-protected reviews.
const express = require('express');
const session = require('express-session');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('node:crypto');
const seedBooks = require('./router/booksdb');
const { createAccounts } = require('./router/accounts');
const { createGeneralRouter } = require('./router/general');
const { createAuthenticatedRouter } = require('./router/auth_users');

function createApp({ tokenTtlSeconds = 3600, runId } = {}) {
  if (!Number.isInteger(tokenTtlSeconds) || tokenTtlSeconds <= 0) {
    throw new Error('TOKEN_TTL_SECONDS must be a positive integer.');
  }
  const app = express();
  // Each instance owns its data. Restarting the lab resets users and reviews.
  const books = structuredClone(seedBooks);
  for (const book of Object.values(books)) book.reviews = Object.create(null);
  const accounts = createAccounts();
  const jwtSecret = randomBytes(32).toString('hex');
  app.disable('x-powered-by');
  app.set('json spaces', 2);
  // A temporary capture run uses a nonce to identify its own server responses.
  if (runId) app.use((req, res, next) => {
    res.set('X-Book-Review-Instance', runId);
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.use('/customer', session({
    name: 'bookreviews.sid',
    secret: randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax' }
  }));

  // Every review mutation passes through session and JWT verification.
  app.use('/customer/auth', (req, res, next) => {
    const authorization = req.session.authorization;
    if (!authorization) {
      return res.status(403).json({ message: 'User not logged in' });
    }
    jwt.verify(authorization.accessToken, jwtSecret,
      { algorithms: ['HS256'] }, (error, payload) => {
        if (error || payload.username !== authorization.username) {
          delete req.session.authorization;
          return res.status(403).json({ message: 'User not authenticated' });
        }
        req.user = { username: payload.username };
        next();
      });
  });
  app.use('/customer', createAuthenticatedRouter({
    books, accounts, jwtSecret, tokenTtlSeconds
  }));
  app.use('/', createGeneralRouter({ books, accounts }));
  app.use((req, res) => res.status(404).json({ message: 'Endpoint not found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ message: 'Request body must be valid JSON' });
    }
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ message: 'Request body is too large' });
    }
    res.status(500).json({ message: 'Unable to process request' });
  });
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 5001);
  const tokenTtlSeconds = Number(process.env.TOKEN_TTL_SECONDS || 3600);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const server = createApp({ tokenTtlSeconds, runId: process.env.BOOK_REVIEW_RUN_ID })
    .listen(port, '0.0.0.0', () => {
    console.log(`Book Review API running on port ${port}`);
    console.log(`JWT lifetime: ${tokenTtlSeconds} seconds`);
  });
  server.on('error', (error) => {
    console.error(`Unable to start Book Review API: ${error.message}`);
    process.exitCode = 1;
  });
}
module.exports = { createApp };
