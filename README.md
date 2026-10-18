# Bubloo Scientist · Password Vault

A branded password manager with free and manually approved unlimited plans with a calm, responsive interface. Supabase provides account authentication and encrypted storage. Deployment is left to the owner.

## Start locally

Install Node.js 22 or newer. No third-party packages or installation are required.

```sh
git clone https://github.com/abdurrehman131211/Bubloo-Scientist-Vault.git
cd Bubloo-Scientist-Vault
npm start
```

Open http://localhost:5173. Run `npm test` for cryptography tests and `npm run build` to create the `dist` folder.

## First use

1. Create an account using your own email and a unique account password (12+ characters). Confirm the email from Supabase, then sign in.
2. Choose a separate master passphrase (16+ characters; a long unique phrase is best). Keep an offline copy somewhere safe. **It cannot be recovered or reset.** Account password recovery cannot decrypt your vault.
3. Add your passwords or generate new ones. Export an encrypted backup periodically.
4. Members can register verified accounts and store five passwords free. Keep signups enabled for members. See ADMIN.md for email approvals, subscriptions, expiry dates, and the website viewer.

## Deploy it yourself

- Supabase project: `Bubloo Scientist Vault` (`upmggwbcbwfhwomzsewm`), Mumbai region.
- The database schema is already applied. `supabase/schema.sql` is a reference for setting up a different project; do not reapply it to this project.
- Client configuration lives in `config.js`. The publishable key is intentionally public. Never use a secret/service-role key in frontend files.
- Build command: `npm run build`. Publish directory: `dist`. No environment variables are needed for the configured project.
- Use HTTPS (localhost also supports Web Crypto). Do not open `index.html` directly as a file.
- In Supabase → Authentication → URL Configuration, set **Site URL** to your deployed HTTPS URL so confirmation links return to your app. The app asks you to sign in after confirming email and does not persist URL tokens.
- Netlify/Cloudflare Pages can consume the included `_headers`. For other hosting providers, configure equivalent headers, especially CSP, `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`. `index.html` also includes a CSP meta policy, but `frame-ancestors` requires a response header.
- No deployment workflow or hosting integration has been enabled.

## Features

- Add, edit, delete, search, reveal, and copy passwords.
- Random password generator (16–128 characters).
- Encrypts titles, usernames, websites, passwords, and notes before storage.
- Locks after 5 minutes of inactivity and immediately when the tab is hidden.
- Encrypted backup export and restore of missing items to the same account/vault. Restore preserves existing entries. Cross-account/disaster migration and master-passphrase rotation are not implemented.

## Security design and limits

- Native Web Crypto AES-256-GCM, fresh random 96-bit nonce per encryption, a random 256-bit salt, and PBKDF2-HMAC-SHA-256 with 600,000 iterations. Authenticated additional data binds each record to its user and item ID.
- Master passphrase is never sent to Supabase. Derived key is non-extractable and held only in memory. Authentication tokens are also memory-only; reload requires sign-in. Expired sessions require sign-in again.
- Supabase RLS and ownership checks protect each user's rows. Vault config cannot be updated/deleted by the client. Supabase can see account information, salt, ciphertext sizes, item counts/IDs, and timestamps.
- Password copying writes to the system clipboard. Clear it after pasting; clipboard history can retain secrets.
- Locking removes app references and clears forms; JavaScript cannot guarantee physical memory erasure. A compromised browser/device or maliciously changed application can read secrets while unlocked. This custom app has not had an independent security audit.
- Keep database backups and encrypted exports. Losing the master passphrase makes encrypted records inaccessible.

## Validation

Crypto tests verify round trips, wrong passphrase rejection, ciphertext tamper rejection, owner binding, nonce uniqueness, and password generation. Live database tests verified cross-user read isolation and blocked insert/update/delete; test fixtures were rolled back. Supabase security advisor returned no findings at implementation time.
