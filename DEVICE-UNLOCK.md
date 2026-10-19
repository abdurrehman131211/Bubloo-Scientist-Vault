# Installation and optional mobile device unlock

## Install the app

Use **Install app** in the page header. Compatible browsers show their installation prompt. Other browsers show instructions for Safari's Add to Home Screen or the browser's install menu. The installed app uses the same HTTPS website, Supabase account and encrypted vault.

The service worker stores no data, caches no scripts, and does not intercept requests. This release does not add offline vault access. An internet connection and account sign-in are still required.

## Enable biometric / device unlock

1. On a compatible phone, sign in and leave your vault locked.
2. Under **Faster unlock on your phone**, select **Set up biometric unlock**.
3. Confirm your master passphrase and trust in this device.
4. Complete the phone's passkey creation and verification prompts. Setup may ask twice.
5. Select **Unlock with biometrics** on subsequent vault unlocks in this browser.

The phone decides whether to verify using fingerprint, face recognition or the screen-lock PIN. The web app cannot require a specific biometric modality and never receives fingerprint or face data. Account sign-in is separate; this feature replaces repeated vault-passphrase entry, not Supabase account authentication.

The feature is offered only on detected mobile/tablet devices with a user-verifying platform authenticator. Device detection is a UI hint, not authorization. Secure enrollment additionally requires the passkey provider and browser to return a WebAuthn PRF result. Unsupported combinations fail without storing an unlock record; the master passphrase remains available.

## Protection and recovery

- The passphrase is confirmed against the existing encrypted vault verifier. It is never stored or sent to Supabase.
- A vault-key byte array is derived using the same existing PBKDF2 parameters. A PRF-protected AES-GCM wrapper is created using HKDF and account/origin/vault-salt context. Only that encrypted wrapper, credential ID and public PRF input are stored in localStorage.
- WebAuthn requires user verification. Assertions are checked for expected challenge, origin, credential ID, relying-party hash, and user-presence / user-verification flags. Recovery additionally requires the PRF-derived key to decrypt the wrapped key and the existing vault verifier to decrypt successfully. This is local encrypted-key recovery, not a server-side passkey login endpoint.
- Recovered vault keys are imported as non-extractable CryptoKeys. Temporary key buffers are cleared after use; JavaScript cannot guarantee complete memory erasure.
- No biometric template, plaintext master passphrase, plaintext vault key or password entries are stored by this feature.
- Passkeys may sync through a credential provider; the app does not promise hardware-only passkey storage. The encrypted wrapper stays in this browser and is excluded from app exports and server storage.
- **Disable device unlock** removes the encrypted record from this browser. The passkey itself can be removed through the phone's credential settings.
- Clearing website data, changing the website origin, or losing the passkey requires the master passphrase and a new setup. Losing the master passphrase still has no recovery path.
- Keep a stable production domain. Preview deployments have different origins and require separate setup.
- The installed app retains automatic locking and server-enforced subscription limits.

## Validation

Automated tests verify compatibility with existing vault encryption, successful key recovery, rejection of wrong PRF output, account/origin/salt binding, and failure when secure PRF support is missing. Real fingerprint/Face ID and mobile browser installation prompts require device testing; they cannot be fully validated by these crypto tests.

References: https://developer.mozilla.org/en-US/docs/Web/API/Web_Authentication_API/WebAuthn_extensions#prf and https://w3c.github.io/webauthn/#prf-extension
