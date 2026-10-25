# Sessions and password recovery

The application now refreshes from the HttpOnly refresh cookie even when the access cookie has expired and disappeared. Concurrent refreshes share one in-process rotation for ten seconds. Supabase must retain its supported refresh-token reuse interval for concurrent replicas; do not set it to zero. Disabled application profiles remain blocked even with a valid Auth session. Logout attempts Supabase local-session revocation and clears cookies even when the provider is unavailable.

Cookies use HttpOnly, SameSite=Lax, Path=/, and Secure by default in production (explicit COOKIE_SECURE is respected for local testing). Production must use COOKIE_SECURE=true and APP_ORIGIN=https://packapprove.vercel.app without a path. A trailing slash in APP_ORIGIN is normalized for CSRF checks. Never expose the service-role key with NEXT_PUBLIC_.

## Recovery configuration in Supabase

No production settings are modified by the code change. A project administrator must verify these settings before claiming email delivery:

- Auth → URL configuration: Site URL is the production HTTPS origin; add the exact redirect `https://packapprove.vercel.app/api/auth/callback` and only explicitly trusted preview callback URLs.
- Configure and verify SMTP credentials, sender domain, provider rate limits, and spam/delivery monitoring. The built-in provider has restricted recipient/rate policies and is unsuitable as an unrestricted production mail service.
- The default recovery email template should use Supabase's `{{ .ConfirmationURL }}`. The application starts a PKCE recovery flow, retains per-flow verifier cookies for 15 minutes, and exchanges the callback code server-side. The email link must be opened in the same browser that requested it. A link already used, expired, or opened without its verifier returns a clear retry screen.
- Alternatively, a custom recovery email can point to `{{ .SiteURL }}/api/auth/callback?token_hash={{ .TokenHash }}&type=recovery`. This uses Supabase's single-use hashed OTP and does not depend on PKCE cookies. The server always fixes the OTP type to recovery.

After verification, the server issues a 15-minute HttpOnly recovery capability bound to the verified access token. Its expiry and SHA-256 binding are authenticated with HMAC-SHA-256 using server-only AUTH_COOKIE_SECRET (optional) or the existing SUPABASE_SERVICE_ROLE_KEY. Verification uses constant-time byte comparisons; a normal access-token holder cannot forge it by hashing their token. Key rotation invalidates pending recovery capabilities. The capability is never issued from an ordinary login. After verification, the server sets this signed capability. `/api/auth/password` requires that capability; an ordinary logged-in session cannot use the password-recovery endpoint. Changing a password uses Supabase Auth updateUser and never rewrites application profiles, roles, or memberships.

The recovery request returns neutral wording without revealing whether an email is registered. Provider errors produce an actionable error, not a false claim that mail was delivered. Authentication and recovery requests are rate limited per process; a shared gateway limiter remains necessary for multi-replica deployments.

## Validation scope

Six focused unit tests pass: missing-access-cookie refresh, concurrent rotation, invalid-session cleanup, inactive profiles, preservation of cookies during provider outages, and Secure/HttpOnly/SameSite cookie options. A real local Supabase integration test also passes: single-use recovery token verification, password update, successful login with the new password, rejection of the previous password and reused token, and unchanged application role/name. The temporary account is removed after the test. SMTP delivery and the production redirect allowlist require access to the actual Supabase project settings; they cannot be inferred from the public website or the presence of environment variable names. End-to-end provider recovery can be tested safely on a temporary local test account with Supabase Admin generateLink(type=recovery), then callback with its token_hash, then password update. Never run such account mutations against production for testing.

Security regression tests reject ordinary-session SHA-256 cookie forgery, fabricated signatures, expiry tampering, expired capabilities, token-binding mismatches, and truncated signatures. No new production secret is required; AUTH_COOKIE_SECRET is an optional separate signing key (minimum 32 characters). Never put it in a NEXT_PUBLIC_ variable.
