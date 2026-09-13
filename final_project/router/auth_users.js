const express = require('express');
const jwt = require('jsonwebtoken');
const { validCredentials, asyncHandler } = require('./accounts');

function createAuthenticatedRouter({ books, accounts, jwtSecret, tokenTtlSeconds }) {
  const regd_users = express.Router();
  // Task 7: validate password, rotate session, then store a signed JWT.
  regd_users.post('/login', asyncHandler(async (req, res) => {
    if (!validCredentials(req.body)) {
      return res.status(400).json({ message: 'Provide a valid username and password' });
    }
    const { username, password } = req.body;
    if (!await accounts.authenticatedUser(username, password)) {
      return res.status(401).json({ message: 'Invalid Login. Check username and password' });
    }
    await new Promise((resolve, reject) => {
      req.session.regenerate((error) => error ? reject(error) : resolve());
    });
    const accessToken = jwt.sign({ username }, jwtSecret, {
      algorithm: 'HS256', expiresIn: tokenTtlSeconds
    });
    req.session.authorization = { username, accessToken };
    await new Promise((resolve, reject) => {
      req.session.save((error) => error ? reject(error) : resolve());
    });
    res.json({ message: 'User successfully logged in' });
  }));

  // Task 8: review is a query parameter as specified by the course.
  regd_users.put('/auth/review/:isbn', (req, res) => {
    if (!Object.hasOwn(books, req.params.isbn)) {
      return res.status(404).json({ message: 'Book not found' });
    }
    const review = req.query.review ?? req.body?.review;
    if (typeof review !== 'string' || !review.trim() || review.length > 5000) {
      return res.status(400).json({ message: 'Provide a review of 1-5000 characters' });
    }
    const reviews = books[req.params.isbn].reviews;
    const username = req.user.username;
    const existing = Object.hasOwn(reviews, username);
    reviews[username] = review.trim();
    res.json({
      message: existing ? 'Review updated successfully' : 'Review added successfully',
      reviews
    });
  });

  // Task 9: delete only the username from the verified session.
  regd_users.delete('/auth/review/:isbn', (req, res) => {
    if (!Object.hasOwn(books, req.params.isbn)) {
      return res.status(404).json({ message: 'Book not found' });
    }
    const reviews = books[req.params.isbn].reviews;
    if (!Object.hasOwn(reviews, req.user.username)) {
      return res.status(404).json({ message: 'You have no review for this book' });
    }
    delete reviews[req.user.username];
    res.json({ message: 'Review deleted successfully', reviews });
  });
  return regd_users;
}
module.exports = { createAuthenticatedRouter };
