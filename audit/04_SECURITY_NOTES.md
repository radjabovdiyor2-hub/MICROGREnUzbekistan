# 04 SECURITY NOTES

## Secrets Management
- `.env` files are used for environment variables.
- CI/CD symlinks `.env` during deployment. (Confirmed)
- `BOT_SECRET` missing fallback issue fixed. API now requires token in production. (Confirmed)

## Docker Security
- N8N port 5678 exposed on host network directly without proxy reverse auth. (Confirmed - requires N8N native basic auth).
- Removed unsafe `/var/run/docker.sock` mount from `mg_devops`. (Confirmed)

## Rate Limiting
- `nginx/nginx.conf` has `limit_req_zone` applied to `/api/` paths. (Confirmed)

## Missing Best Practices
- E2E encryption for sensitive customer data. (Unknown / Not implemented)
- Dependency vulnerability scans (e.g. `npm audit`) are not enforced in CI. (Confirmed)
