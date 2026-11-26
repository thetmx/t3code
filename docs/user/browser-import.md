# Import browser sessions

Import cookies from another browser into the desktop app's [preview browser](./browser.md) so you can reuse existing signed-in sessions.

## Import a profile

1. Open **Settings → Browser → Browser profiles → Add profile** and choose a browser under **Import from**. The source browser can stay open.
2. Allow any OS keyring unlock prompt.

This is a one-time copy—later login changes stay separate, and some sites may still require signing in again.

To stay signed in without re-importing, pick a browser profile under **Settings → Browser → Sync cookies on launch**. Each time T3 Code starts, the first browser tab in the Default profile copies that browser's cookies again. The copy is one-way: sign-ins made in T3 Code are not copied back.

## Platform notes

- **macOS (Safari)**: Requires temporary **Full Disk Access** (grant in System Settings, quit/reopen T3 Code if macOS requires it, then reopen the import wizard). You can revoke Full Disk Access afterward.
- **Windows**: Supports Firefox, Zen, and Helium profiles using standard encryption. Close Helium before importing from it, because it locks its cookie file while running. Other Chromium browsers use app-bound encryption and cannot be imported.
- Partitioned cookies are skipped on all platforms. Administrators can disable cookie import via [managed policy](./managed-policy.md#other-capabilities).
