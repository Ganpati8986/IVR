# School Voice Notice

React (frontend) + Node/Express (backend) + SQLite. The Omixo API key stays on the server only.

## First run (Node 22.13+ — SQLite is built in, nothing to compile)
```
npm install
npm run dev          # http://localhost:5173  -> the login page appears first
```
Login: the username and password are set in `.env` (`APP_USERNAME`, `APP_PASSWORD`). They are applied every time the server starts,
so to change the password just edit `.env` and restart. More staff logins (optional):
`npm run create-user -- teacher1 'Password#123'`.
If `.env` does not exist yet: `npm run setup`, then fill in `OMIXO_API_KEY`, `APP_USERNAME`, `APP_PASSWORD`.

## Voice recording / audio files
Omixo downloads audio from an https link, so localhost will not work. Set `PUBLIC_BASE_URL=https://your-domain`
in `.env` (for testing: `npx cloudflared tunnel --url http://localhost:3001` and use that link), then restart.

## Giving it to testers (from your own PC)
```
npm start                                        # app + API on port 3001
npx cloudflared tunnel --url http://localhost:3001
```
Put the tunnel link in `.env` as `PUBLIC_BASE_URL=`, restart `npm start`, and share that one link with a username/password
(`npm run create-user -- tester1 'Pass#1234'`). Use `DAILY_LIMIT=50` while testing.

## Production deploy
1. Copy the code to a VPS, run `npm install`, `npm run setup`, fill `.env`, create users.
2. Run `npm start` with `pm2` or `systemd` (not as root).
3. Put Caddy/Nginx in front for HTTPS and open only ports 80/443. Caddy example:
   ```
   notice.yourschool.com {
     reverse_proxy localhost:3001
   }
   ```
4. Set `PUBLIC_BASE_URL=https://notice.yourschool.com`
5. Back up `data/` (database) and `uploads/` daily.

## Security
- API key never reaches the browser.
- Login with scrypt-hashed passwords, httpOnly + SameSite=Strict cookie (12 h), 10 login attempts / 15 min.
- CSRF header check, helmet + CSP, rate limits.
- The server exposes only: send notice, status, retry, records, audio upload.
- Limits: `MAX_PER_NOTICE` (2000), `DAILY_LIMIT` (5000 calls/day), 800-char messages, 25 MB audio, 40 uploads/hour.
- Uploads are type-checked; only audio hosted on this server can be used in a notice; audio is deleted after 30 days.
- History and "who sent it" are stored in the database.
