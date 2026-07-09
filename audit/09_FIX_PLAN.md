# 09 FIX PLAN

| Priority | Fix | File | Reason | Verification | Risk | Approval Needed |
|----------|-----|------|--------|--------------|------|-----------------|
| 1. URGENT | Remove hardcoded SSH credentials | `check-env.js`, `fix-server.js`, `deploy_nginx.js`, `ssh_probe.py`, `ssh_stop.py`, etc. | Massive security leak. | Git diff | High | YES |
| 2. URGENT | Rotate Production Password | N/A | Old password is in commit history. | Try SSHing with old password (should fail). | High | YES |
| 3. HIGH | Secure N8N instance | `docker-compose.prod.yml` | Port 5678 is exposed on `0.0.0.0`. | Access `http://82.115.50.30:5678` in browser. | Med | YES |
| 4. MED | Fix disabled PM bot logic | `docker-compose.prod.yml` / `pm_bot` | Collides with Stepan bot. | `docker ps` | Low | YES |
| 5. LOW | Replace fragile JS deploy scripts | Root deploy scripts | Custom scripts are brittle. Use SSH keys + Github Actions. | Deploy works. | Low | YES |
