const express = require('express');
const axios = require('axios');
const { validCredentials, asyncHandler } = require('./accounts');

function createGeneralRouter({ books, accounts }) {
  const public_users = express.Router();
  // Task 6: registration is public.
  public_users.post('/register', asyncHandler(async (req, res) => {
    if (!validCredentials(req.body)) {
      return res.status(400).json({
        message: 'Provide a username (1-64 letters, digits, _, . or -) and password (1-256 characters)'
      });
    }
    const { username, password } = req.body;
    if (!await accounts.register(username, password)) {
      return res.status(409).json({ message: 'User already exists!' });
    }
    res.json({ message: 'User successfully registered. Now you can login' });
  }));
  // Tasks 1-5: REST endpoints used by cURL and the Axios clients below.
  public_users.get('/', (req, res) => res.json(books));
  public_users.get('/isbn/:isbn', (req, res) => {
    if (!Object.hasOwn(books, req.params.isbn)) {
      return res.status(404).json({ message: 'Book not found' });
    }
    res.json(books[req.params.isbn]);
  });
  function search(field) {
    return (req, res) => {
      const requested = req.params[field].trim().toLocaleLowerCase('en');
      const matches = Object.fromEntries(Object.entries(books).filter(([, book]) =>
        book[field].toLocaleLowerCase('en') === requested));
      if (Object.keys(matches).length === 0) {
        return res.status(404).json({ message: `No books found for this ${field}` });
      }
      res.json(matches);
    };
  }
  public_users.get('/author/:author', search('author'));
  public_users.get('/title/:title', search('title'));
  public_users.get('/review/:isbn', (req, res) => {
    if (!Object.hasOwn(books, req.params.isbn)) {
      return res.status(404).json({ message: 'Book not found' });
    }
    res.json(books[req.params.isbn].reviews);
  });
  return public_users;
}

function bookClient(baseURL) {
  // The URL is provided by the CLI/test caller, never by a public request.
  const url = new URL(baseURL);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError('Use an http or https API URL');
  }
  const options = { baseURL: url.href.replace(/\/$/, ''), timeout: 10000 };
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    options.proxy = false;
  }
  return axios.create(options);
}

// Task 10: async/await with Axios; also supports an error-first callback.
async function getAllBooks(baseURL, callback) {
  let data;
  try {
    const response = await bookClient(baseURL).get('/');
    data = response.data;
  } catch (error) {
    if (callback) { callback(error); return; }
    throw error;
  }
  if (callback) callback(null, data);
  return data;
}

// Task 11: Axios returns a Promise; then() extracts the ISBN result.
function getBookByISBN(baseURL, isbn) {
  return bookClient(baseURL).get(`/isbn/${encodeURIComponent(isbn)}`)
    .then((response) => response.data);
}

// Task 12: async/await retrieves every book matching the author.
async function getBooksByAuthor(baseURL, author) {
  const response = await bookClient(baseURL).get(`/author/${encodeURIComponent(author)}`);
  return response.data;
}

// Task 13: async/await retrieves every book matching the title.
async function getBooksByTitle(baseURL, title) {
  const response = await bookClient(baseURL).get(`/title/${encodeURIComponent(title)}`);
  return response.data;
}

// Start the API first, then: npm run client -- http://127.0.0.1:5001
// Clients call the endpoints; endpoint handlers never call themselves.
if (require.main === module) {
  const baseURL = process.argv[2] || 'http://127.0.0.1:5001';
  (async () => {
    await getAllBooks(baseURL, (error, books) => {
      if (error) throw error;
      console.log('Task 10 - all books (async + callback):', JSON.stringify(books, null, 2));
    });
    console.log('Task 11 - ISBN 1 (Promise):', JSON.stringify(await getBookByISBN(baseURL, '1'), null, 2));
    console.log('Task 12 - author Unknown (async):', JSON.stringify(await getBooksByAuthor(baseURL, 'Unknown'), null, 2));
    console.log('Task 13 - title (async):', JSON.stringify(await getBooksByTitle(baseURL, 'Things Fall Apart'), null, 2));
  })().catch((error) => {
    console.error(`Axios request failed: ${error.message}`);
    process.exitCode = 1;
  });
}
module.exports = {
  createGeneralRouter, getAllBooks, getBookByISBN, getBooksByAuthor, getBooksByTitle
};
