# Book Review Application

IBM Node.js and Express final project, adapted from the [official expressBookReviews starter](https://github.com/ibm-developer-skills-network/expressBookReviews). The original Apache 2.0 license is retained.

## Run

Requires Node.js 18 or newer.

```bash
cd final_project
npm ci
npm test
npm start
```

The API listens on port **5001** by default. Set `PORT=5000 npm start` to use the original course port, or choose another free port. Keep this terminal running when testing.

## API routes

| Method | Path | Purpose |
|---|---|---|
| GET | / | All ten supplied books |
| GET | /isbn/:isbn | One book by its course ISBN key (1-10) |
| GET | /author/:author | All books matching an author |
| GET | /title/:title | All books matching a title |
| GET | /review/:isbn | Public reviews, initially {} |
| POST | /register | JSON username and password |
| POST | /customer/login | Log in; saves JWT in server session |
| PUT | /customer/auth/review/:isbn?review=... | Add or update the signed-in user's review |
| DELETE | /customer/auth/review/:isbn | Delete only the signed-in user's review |

Author/title matches are exact and case-insensitive. URL-encode spaces and accented characters. Requests return JSON. Missing books return 404, invalid input 400, duplicate registration 409, wrong login 401, and missing/expired authentication 403.

Passwords are stored as salted scrypt hashes. Login rotates the session identifier and stores an HS256 JWT containing the username. Keep the same cookie jar between login and review changes. The authorization header does not need a bearer token. Only the verified session username determines which review is written or deleted.

Users, sessions, and reviews are held in memory for this course exercise and reset when the server restarts. Session cookies are HttpOnly with SameSite=Lax; a production service would need persistent data/session storage, HTTPS configuration, and additional operational controls.

## cURL walkthrough

Run these commands in a second terminal. These are instructions, not captured submission evidence.

```bash
curl http://127.0.0.1:5001/
curl http://127.0.0.1:5001/isbn/1
curl 'http://127.0.0.1:5001/author/Chinua%20Achebe'
curl 'http://127.0.0.1:5001/title/Things%20Fall%20Apart'
curl http://127.0.0.1:5001/review/1
curl -X POST -H 'Content-Type: application/json' -d '{"username":"bookreader","password":"Course-example-42!"}' http://127.0.0.1:5001/register
curl -c cookies.txt -X POST -H 'Content-Type: application/json' -d '{"username":"bookreader","password":"Course-example-42!"}' http://127.0.0.1:5001/customer/login
curl -b cookies.txt -X PUT 'http://127.0.0.1:5001/customer/auth/review/1?review=A%20thoughtful%20novel'
curl http://127.0.0.1:5001/review/1
curl -b cookies.txt -X DELETE http://127.0.0.1:5001/customer/auth/review/1
```

Send another PUT while signed in to update that user's review. Logging in as a different registered user and sending PUT adds a separate review without replacing the first user's entry.

## Axios: Tasks 10-13

All four client functions are in **final_project/router/general.js**, alongside the public route implementations.

| Task | Exported function | Approach |
|---|---|---|
| 10 | getAllBooks(baseURL, callback?) | Axios with async/await; optional error-first callback |
| 11 | getBookByISBN(baseURL, isbn) | Axios Promise and then callback |
| 12 | getBooksByAuthor(baseURL, author) | Axios with async/await |
| 13 | getBooksByTitle(baseURL, title) | Axios with async/await |

With the API running, run the working examples in a second terminal:

```bash
cd final_project
npm run client -- http://127.0.0.1:5001
```

These functions issue real HTTP requests, return response data, and propagate failures. The API handlers read the book data directly, so the HTTP clients do not create self-request recursion. See the [Axios examples](https://axios-http.com/docs/example) for the promise and async/await patterns.

## Verification

`npm test` launches isolated app instances on temporary loopback ports. It checks public queries, registration/login errors, cookie authentication, review ownership across users, invalid input, JWT expiry and re-login, and the four Axios helpers against a running API. No GitHub credentials are needed for these tests.

For a manual expiry check, restart with `TOKEN_TTL_SECONDS=60 npm start`, register and log in, add a review before 60 seconds, then attempt a change after 60 seconds. The expired request returns 403. Log in again to restore access.

## Assessment evidence

The accompanying installer/helper executes cURL itself and saves the actual command and response under the required names:

| Assessment question | File |
|---|---|
| 1 | githubrepo |
| 2 | getallbooks |
| 3 | getbooksbyISBN |
| 4 | getbooksbyauthor |
| 5 | getbooksbytitle |
| 6 | getbookreview |
| 7 | register |
| 8 | login |
| 9 | reviewadded |
| 10 | deletereview |
| 11 | Public GitHub link to final_project/router/general.js |

Publish the project in a public fork named **expressBookReviews** whose parent is **ibm-developer-skills-network/expressBookReviews**. The helper verifies the parent and pushed file before producing the GitHub answers. Local-only runs leave questions 1 and 11 pending.
