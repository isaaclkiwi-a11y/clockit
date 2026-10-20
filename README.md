# ClockIT starter project

This project keeps your existing Focusify site untouched. It creates a **new ClockIT website** with a live clock, a Helpful Stuff page, study links, a focus timer, quick utilities, and a chat UI. The chat backend runs on your home laptop and stores messages in a local SQLite database. The server deletes messages older than 24 hours every night at midnight in the configured timezone, and also performs a cleanup when it starts.

## Files

- `index.html` — ClockIT homepage
- `helpful.html` — Helpful Stuff categories and chat screen
- `styles.css` — shared styling
- `chat-config.js` — the public HTTPS address of the home chat server (no secrets go here)
- `chat-client.js` — browser chat client
- `chat-server/` — Node.js chat API, authentication, SQLite database logic, and retention sweep

## Part 1: Make a new GitHub repository and deploy the website

1. Create a **new, empty, private or public GitHub repository** named `clockit`. Do not change or delete the old `spotifybeans` repository; that keeps Focusify separate.
2. Upload the files from this folder to the root of the new repository. Upload the `chat-server` folder too. Do not upload `chat-server/.env`, `chat-server/data/`, or `node_modules/`.
3. In Vercel, choose **Add New → Project**, import the new `clockit` repository, and deploy it as a static site. The root directory should be `./`; no build command is needed.
4. Copy the resulting public website URL, such as `https://clockit-example.vercel.app`. This is your **frontend URL**. Do not use an example URL literally.
5. Keep that tab open. You will use the actual URL in the chat server setup below.

## Part 2: Set up the chat server on the home laptop

Do this on the laptop that will stay on at home. It needs to be powered on, connected to the internet, and not asleep for chat to work.

1. Install **Node.js 20 LTS or newer** from https://nodejs.org/ . On Windows, open a new PowerShell window after installing and check `node -v` and `npm -v`.
2. Copy the `chat-server` folder from this project to the home laptop, for example to `C:\ClockIT\chat-server`.
3. In that folder, copy `.env.example` to a new file named `.env`. You can run this in PowerShell:

   ```powershell
   Copy-Item .env.example .env
   notepad .env
   ```

4. Edit `.env` and replace **every** `CHANGE_ME` and `YOUR-CLOCKIT-SITE` value. Set `FRONTEND_ORIGINS` to your actual Vercel URL, with no trailing slash. Choose two different usernames and two strong, unique passwords of at least 12 characters. Create a random `JWT_SECRET` of at least 40 characters. Keep `.env` private. Never upload it to GitHub or send it to anyone.
5. In PowerShell, while inside the `chat-server` folder, run:

   ```powershell
   npm install
   npm start
   ```

6. Open `http://localhost:3001/health` on the home laptop. It should show `{"ok":true,"service":"clockit-chat"}`. Leave the server running for now. The `data` folder and SQLite file are created automatically.

## Part 3: Give the home server a secure internet address

**Recommended: Cloudflare Tunnel with a stable hostname.** This avoids opening router ports. To use a stable hostname, you need a domain managed in Cloudflare and access to that Cloudflare account.

1. Follow Cloudflare's official Windows `cloudflared` installation and tunnel setup guide: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/ . Sign in to the correct Cloudflare account.
2. Create a named tunnel, for example `clockit-chat`, and route a hostname you control, for example `chat.yourdomain.com`, to that tunnel.
3. Configure the tunnel's local service as `http://localhost:3001` and start the tunnel. Follow Cloudflare's current dashboard/CLI prompts for the exact steps.
4. From a device outside your home Wi-Fi, open `https://chat.yourdomain.com/health`. It should return the same small JSON health response.

If you **do not have a domain on Cloudflare**, you can test with Cloudflare Quick Tunnel by running `cloudflared tunnel --url http://localhost:3001`. It provides a temporary `trycloudflare.com` URL that may change when restarted. This is for testing, not a permanent address. Do not open a router port as a shortcut.

## Part 4: Point ClockIT at the chat server

1. In the GitHub `clockit` repository, open `chat-config.js` and replace `https://REPLACE-WITH-YOUR-CHAT-HOSTNAME` with your real HTTPS tunnel address, with no trailing slash. Example shape only: `https://chat.yourdomain.com`.
2. In the home server's `.env`, set `FRONTEND_ORIGINS` to the exact Vercel URL from Part 1, without a trailing slash. If you use a custom frontend domain, include its exact origin too, comma-separated.
3. Restart the chat server after changing `.env` (`Ctrl+C`, then `npm start`). Commit the `chat-config.js` change to GitHub. Vercel should redeploy automatically.
4. Open the ClockIT website, go to **Helpful Stuff → Our chat**, and sign in using one of the two accounts from `.env`. Give your girlfriend only her username and password through a private channel. Never place those credentials in website code.

## How chat and deletion work

- Only the two configured accounts can sign in. Passwords are hashed before they are stored in SQLite.
- Messages are stored on the home laptop in `chat-server/data/chat.sqlite`, not in GitHub or Vercel.
- A scheduled cleanup runs every night at midnight in `SWEEP_TIMEZONE` and removes messages older than 24 hours. A cleanup also runs when the server starts. This is a rolling 24-hour retention rule, so it does not wipe every message regardless of age at midnight.
- If the laptop sleeps, shuts down, loses internet, or the tunnel stops, the chat will be offline. Configure Windows power settings so the laptop stays awake while plugged in, if appropriate for your home setup.
- A 24-hour deletion policy is not a guarantee of forensic erasure from every storage medium or backup. SQLite WAL files are checkpointed after cleanup, but don't use the chat for sensitive information.
- The school network may block the Vercel site, tunnel hostname, WebSockets, or chat service. This project does not try to bypass school network controls.

## Troubleshooting

- **“Chat server URL is not configured yet”**: update `chat-config.js` and wait for Vercel to redeploy.
- **“This website is not allowed…” / CORS error**: check that `FRONTEND_ORIGINS` exactly matches the browser's ClockIT origin, including `https://`, with no path or trailing slash. Restart the server.
- **Health URL does not load from outside**: check that the Node server and tunnel are both running.
- **Login rejected**: use the exact usernames/passwords in the home server's `.env`. Restart the server after edits.
- **Chat won't connect on a school laptop**: try the website on a personal device first. The school network may block the service; ask the school IT team rather than trying to bypass its restrictions.

## Security notes

- Never put `.env`, database files, passwords, JWT secrets, or tunnel credentials in the GitHub repository.
- Use unique passwords. Do not reuse school, email, or other account passwords.
- This starter uses a small, private two-account setup, not a public group chat. Keep Node.js and dependencies updated, and stop the service if you suspect an account is compromised.
- The tunnel encrypts transport, but the account checks in this server are what restrict access to the chat. Do not remove them.
