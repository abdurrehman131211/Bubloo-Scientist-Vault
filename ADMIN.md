# Bubloo Scientist Vault — owner guide

## Open the admin panel

Sign in as **abdur.rehman.siddiqui1312@gmail.com**, then select **Admin panel** in the sidebar. Admin authorization is bound to your existing verified account's database user ID. It cannot be enabled by changing frontend code or user metadata.

The panel shows member emails, verification, entry counts, plans, pending requests and grants. It never returns other users' saved passwords, encryption keys, or vault payloads.

## Approve unlimited access

In **Approve an email**, enter the email and select **Approved email — unlimited, no expiry**, then **Save access**. You may approve an email before registration; the account must verify that email before unlimited access works.

To revoke, use **Revoke** in the approvals list or select **Free** in the form. The owner always has unlimited access.

## Subscription requests

1. A member selects **My plan → Request subscription**.
2. The request appears under **Pending subscription requests**.
3. Arrange and confirm payment outside this app.
4. Select **Set subscription**, choose the expiry in your local time, then **Save access**.
5. The member selects **Refresh my access**, or signs in again.

You can decline requests and extend an existing subscription by editing its expiry. No payment processor, card collection, price, recurring charge or automatic renewal has been enabled.

## Free plan limits

Free members can save up to five passwords. The database enforces the limit for normal saves, direct API requests and backup restores. Atomic per-user usage counters serialize concurrent inserts.

If a grant is revoked or a subscription expires, existing entries remain readable, editable, deletable and exportable. Adding entries requires fewer than five saved entries or active unlimited access. No entries are deleted by a plan change.

“Unlimited” means no application-level password count cap; Supabase database/storage and hosting quotas still apply. Keep public signups enabled when offering the service to members.

## Built-in website viewer

Select **Website viewer**, or **Open website** on an entry. Open an external HTTPS address, reload it, copy the selected entry's password, or open the address in a new tab. Passwords are never automatically sent to websites.

The viewer is a sandboxed iframe. Sites can block embedding, third-party cookies or framed sign-in. Use **Open in new tab** when a site refuses to load. This is not a full browser engine or extension; universal autofill, inspecting cross-origin navigation, and bypassing frame restrictions are not supported.

Closing or locking clears the viewer. Five-minute inactivity locking still applies; activity inside third-party frames cannot be observed by the vault to reset its timer.

## Database setup and verification

Both `supabase/schema.sql` and `supabase/plans.sql` are already applied to the connected project. Do not rerun them. For another project, replace the owner UUID in plans.sql with your verified owner account UUID first.

`tests/authorization.sql` contains rollback-based integration checks for free limits, bulk inserts, admin protection, allowlisting, subscriptions, expiry, revocation and cross-user isolation. Run it in a controlled database/session. `npm test` also checks website URL validation.

Security review: private entitlement tables intentionally have no client-facing RLS policies and deny direct table access. Privileged implementations live in a non-exposed schema behind guarded API wrappers. Supabase also reports that account-level leaked-password protection is disabled; see https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection for that setting.
