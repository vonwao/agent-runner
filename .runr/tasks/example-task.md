# Example Task: Add User Authentication

## Goal
Implement OAuth2 login with Google, allowing users to authenticate and maintain sessions.

## Requirements
- OAuth2 integration with Google
- Session management using secure cookies
- Protected route middleware
- Logout functionality
- User profile page showing authenticated user info

## Success Criteria
- Users can click "Login with Google" and authenticate
- Sessions persist across browser refreshes
- Protected routes redirect unauthenticated users to login
- Logout clears session and redirects to home
- All existing tests pass
- New auth tests pass (login flow, protected routes, logout)

## Notes
- Use passport.js or similar OAuth library
- Store sessions in Redis if available, fallback to in-memory for dev
- Follow existing code style and patterns in the repo
- Add tests for auth flows
