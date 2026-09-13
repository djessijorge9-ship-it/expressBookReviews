const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { createApp } = require('../index');
const {
  getAllBooks, getBookByISBN, getBooksByAuthor, getBooksByTitle
} = require('../router/general');

async function startApp(t, options) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  async function request(path, { method = 'GET', cookie, body, rawBody } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (body !== undefined || rawBody !== undefined) {
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(baseURL + path, {
      method, headers,
      body: rawBody !== undefined ? rawBody : body === undefined ? undefined : JSON.stringify(body)
    });
    const data = await response.json();
    return { response, status: response.status, data };
  }
  return { baseURL, request };
}

const password = 'BookLab-Test-Password-42!';

async function register(request, username) {
  const result = await request('/register', {
    method: 'POST', body: { username, password }
  });
  assert.equal(result.status, 200);
}

async function login(request, username, cookie) {
  const result = await request('/customer/login', {
    method: 'POST', cookie, body: { username, password }
  });
  assert.equal(result.status, 200);
  assert.equal(result.data.message, 'User successfully logged in');
  const header = result.response.headers.get('set-cookie');
  assert.match(header, /bookreviews\.sid=/);
  assert.match(header, /HttpOnly/i);
  return header.split(';', 1)[0];
}

test('public catalogue reads return all matches and preserve non-ASCII titles', async (t) => {
  const { request } = await startApp(t);
  const all = await request('/');
  assert.equal(all.status, 200);
  assert.equal(Object.keys(all.data).length, 10);
  const isbn = await request('/isbn/1');
  assert.equal(isbn.status, 200);
  assert.equal(isbn.data.title, 'Things Fall Apart');
  assert.equal(isbn.data.author, 'Chinua Achebe');
  const author = await request('/author/' + encodeURIComponent('Unknown'));
  assert.equal(author.status, 200);
  assert.deepEqual(Object.keys(author.data), ['4', '5', '6', '7']);
  const title = await request('/title/' + encodeURIComponent('Le Père Goriot'));
  assert.equal(title.status, 200);
  assert.equal(title.data['9'].author, 'Honoré de Balzac');
  const caseInsensitive = await request('/title/' + encodeURIComponent("  njál's saga  "));
  assert.equal(caseInsensitive.status, 200);
  assert.equal(caseInsensitive.data['7'].title, "Njál's Saga");
  const reviews = await request('/review/1');
  assert.equal(reviews.status, 200);
  assert.deepEqual(reviews.data, {});
  for (const path of ['/isbn/999', '/review/999', '/author/Absent', '/title/Absent', '/no-route']) {
    assert.equal((await request(path)).status, 404, path);
  }
});

test('registration and login reject invalid credentials; protected writes require a valid session', async (t) => {
  const { request } = await startApp(t);
  for (const body of [{}, { username: 'reader', password: '' }, { username: ['reader'], password }, { username: 'not valid', password }]) {
    assert.equal((await request('/register', { method: 'POST', body })).status, 400);
  }
  await register(request, 'reader');
  assert.equal((await request('/register', {
    method: 'POST', body: { username: 'reader', password }
  })).status, 409);
  assert.equal((await request('/customer/login', { method: 'POST', body: {} })).status, 400);
  for (const body of [{ username: 'reader', password: 'wrong' }, { username: 'absent', password }]) {
    assert.equal((await request('/customer/login', { method: 'POST', body })).status, 401);
  }
  for (const method of ['PUT', 'DELETE']) {
    const anonymous = await request('/customer/auth/review/1?review=Blocked', { method });
    assert.equal(anonymous.status, 403);
    assert.equal(anonymous.data.message, 'User not logged in');
    assert.equal((await request('/customer/auth/review/1?review=Blocked', {
      method, cookie: 'bookreviews.sid=forged-value'
    })).status, 403);
  }
  const firstCookie = await login(request, 'reader');
  const secondCookie = await login(request, 'reader', firstCookie);
  assert.notEqual(firstCookie, secondCookie, 'login must rotate the session identifier');
  assert.equal((await request('/customer/auth/review/1?review=Old-session', {
    method: 'PUT', cookie: firstCookie
  })).status, 403);
  assert.deepEqual((await request('/review/1')).data, {});
});

test('two readers can add, update, and delete only their own reviews', async (t) => {
  const { request } = await startApp(t);
  await register(request, 'alice');
  await register(request, 'bob');
  const alice = await login(request, 'alice');
  const bob = await login(request, 'bob');
  const firstText = 'A clear account & a memorable ending.';
  const added = await request('/customer/auth/review/1?review=' + encodeURIComponent(firstText), {
    method: 'PUT', cookie: alice
  });
  assert.equal(added.status, 200);
  assert.deepEqual(added.data.reviews, { alice: firstText });
  // JSON review bodies are supported in addition to the course's query parameter.
  const bobAdded = await request('/customer/auth/review/1', {
    method: 'PUT', cookie: bob, body: { review: 'Bob enjoyed this book.' }
  });
  assert.equal(bobAdded.status, 200);
  assert.deepEqual(bobAdded.data.reviews, { alice: firstText, bob: 'Bob enjoyed this book.' });
  const updated = await request('/customer/auth/review/1?username=bob&review=' + encodeURIComponent('Alice changed her review.'), {
    method: 'PUT', cookie: alice, body: { username: 'bob', review: 'Body must not replace query review.' }
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.data.reviews, { alice: 'Alice changed her review.', bob: 'Bob enjoyed this book.' });
  const deleted = await request('/customer/auth/review/1?username=bob', { method: 'DELETE', cookie: alice });
  assert.equal(deleted.status, 200);
  assert.deepEqual(deleted.data.reviews, { bob: 'Bob enjoyed this book.' });
  assert.equal((await request('/customer/auth/review/1?username=bob', { method: 'DELETE', cookie: alice })).status, 404);
  assert.deepEqual((await request('/review/1')).data, { bob: 'Bob enjoyed this book.' });
  assert.equal((await request('/customer/auth/review/1', { method: 'DELETE', cookie: bob })).status, 200);
  assert.deepEqual((await request('/review/1')).data, {});
});

test('invalid reviews and inherited-object ISBN names cannot change the catalogue', async (t) => {
  const { request } = await startApp(t);
  await register(request, '__proto__');
  const cookie = await login(request, '__proto__');
  for (const path of ['/customer/auth/review/1', '/customer/auth/review/1?review=', '/customer/auth/review/1?review=%20%20', '/customer/auth/review/1?review=x&review=y']) {
    assert.equal((await request(path, { method: 'PUT', cookie })).status, 400, path);
  }
  for (const review of [{ text: 'not a string' }, 123, 'x'.repeat(5001)]) {
    assert.equal((await request('/customer/auth/review/1', { method: 'PUT', cookie, body: { review } })).status, 400);
  }
  for (const isbn of ['__proto__', 'constructor', 'toString', '999']) {
    assert.equal((await request('/isbn/' + isbn)).status, 404);
    assert.equal((await request('/review/' + isbn)).status, 404);
    for (const method of ['PUT', 'DELETE']) {
      assert.equal((await request('/customer/auth/review/' + isbn + '?review=Never-added', { method, cookie })).status, 404);
    }
  }
  assert.deepEqual((await request('/review/1')).data, {});
  const specialName = await request('/customer/auth/review/1?review=Stored-safely', { method: 'PUT', cookie });
  assert.equal(specialName.status, 200);
  assert.equal(Object.hasOwn(specialName.data.reviews, '__proto__'), true);
  assert.equal(specialName.data.reviews.__proto__, 'Stored-safely');
  assert.equal((await request('/customer/auth/review/1', { method: 'DELETE', cookie })).status, 200);
  assert.deepEqual((await request('/review/1')).data, {});
  const malformed = await request('/register', { method: 'POST', rawBody: '{invalid json' });
  assert.equal(malformed.status, 400);
  assert.equal(Object.keys((await request('/')).data).length, 10);
});

test('app instances isolate user accounts and book reviews', async (t) => {
  const first = await startApp(t);
  const second = await startApp(t);
  await register(first.request, 'one-app-reader');
  const cookie = await login(first.request, 'one-app-reader');
  assert.equal((await first.request('/customer/auth/review/1?review=First-app-only', { method: 'PUT', cookie })).status, 200);
  assert.deepEqual((await second.request('/review/1')).data, {});
  assert.equal((await second.request('/customer/login', {
    method: 'POST', body: { username: 'one-app-reader', password }
  })).status, 401);
  assert.equal((await second.request('/customer/auth/review/1?review=Invalid-session', { method: 'PUT', cookie })).status, 403);
});

test('an expired JWT blocks review changes until the reader logs in again', async (t) => {
  const { request } = await startApp(t, { tokenTtlSeconds: 1 });
  await register(request, 'expiry-reader');
  let cookie = await login(request, 'expiry-reader');
  assert.equal((await request('/customer/auth/review/1?review=Before-expiry', { method: 'PUT', cookie })).status, 200);
  await delay(1100);
  const expired = await request('/customer/auth/review/1?review=After-expiry', { method: 'PUT', cookie });
  assert.equal(expired.status, 403);
  assert.equal(expired.data.message, 'User not authenticated');
  assert.deepEqual((await request('/review/1')).data, { 'expiry-reader': 'Before-expiry' });
  cookie = await login(request, 'expiry-reader', cookie);
  assert.equal((await request('/customer/auth/review/1?review=After-relogin', { method: 'PUT', cookie })).status, 200);
  assert.deepEqual((await request('/review/1')).data, { 'expiry-reader': 'After-relogin' });
});

test('Axios callback, Promise, and async clients retrieve the live API and propagate errors', async (t) => {
  const { baseURL } = await startApp(t);
  const all = await getAllBooks(baseURL);
  assert.equal(Object.keys(all).length, 10);
  let callbackCount = 0;
  const callbackValue = await getAllBooks(baseURL, (error, result) => {
    callbackCount += 1;
    assert.equal(error, null);
    assert.deepEqual(result, all);
  });
  assert.equal(callbackCount, 1);
  assert.deepEqual(callbackValue, all);
  const isbnPromise = getBookByISBN(baseURL, '1');
  assert.equal(typeof isbnPromise.then, 'function');
  assert.equal((await isbnPromise).title, 'Things Fall Apart');
  assert.deepEqual(Object.keys(await getBooksByAuthor(baseURL, 'Unknown')), ['4', '5', '6', '7']);
  assert.equal((await getBooksByTitle(baseURL, 'Le Père Goriot'))['9'].author, 'Honoré de Balzac');
  const is404 = (error) => error.isAxiosError === true && error.response.status === 404;
  await assert.rejects(getAllBooks(baseURL + '/absent-base'), is404);
  await assert.rejects(getBookByISBN(baseURL, '999'), is404);
  await assert.rejects(getBooksByAuthor(baseURL, 'Nobody here'), is404);
  await assert.rejects(getBooksByTitle(baseURL, 'An absent title'), is404);
  let errorCallbackCount = 0;
  await getAllBooks(baseURL + '/absent-base', (error, result) => {
    errorCallbackCount += 1;
    assert.equal(is404(error), true);
    assert.equal(result, undefined);
  });
  assert.equal(errorCallbackCount, 1);
  await assert.rejects(getAllBooks('ftp://example.test'), /http or https/);
});
