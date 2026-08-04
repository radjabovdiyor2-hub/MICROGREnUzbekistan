import yaml
import sys
import re

def main():
    has_errors = False
    
    def log_error(msg):
        nonlocal has_errors
        has_errors = True
        print(f"ERROR: {msg}", file=sys.stderr)

    try:
        with open('docker-compose.prod.yml', encoding='utf-8') as f:
            compose_data = yaml.safe_load(f)
    except Exception as e:
        log_error(f"Failed to parse docker-compose.prod.yml: {e}")
        sys.exit(1)

    services = compose_data.get('services', {})
    
    unique_builds = set()
    
    allowed_external_prefixes = ['pgvector', 'redis', 'nginx', 'certbot']

    tgas_services = [
        'web_office', 'stepan', 'sales', 'support', 'hr', 'finance', 'marketing',
        'analytics', 'content', 'qa', 'rnd', 'devops', 'franchise', 'n8n_bridge'
    ]

    for svc_name, svc_conf in services.items():
        # Rule 1: if build exists, image must exist
        if 'build' in svc_conf and 'image' not in svc_conf:
            log_error(f"Service '{svc_name}' has 'build:' but lacks 'image:'.")
            
        # Rule 2: collect unique (dockerfile, target)
        if 'build' in svc_conf:
            b = svc_conf['build']
            if isinstance(b, dict):
                df = b.get('dockerfile', 'Dockerfile')
                target = b.get('target', None)
                unique_builds.add((df, target))
            else:
                unique_builds.add((None, None))
                
        # Rule 3: image must point to ghcr.io or be allowed external
        if 'image' in svc_conf:
            img = svc_conf['image']
            is_ghcr = img.startswith('ghcr.io')
            is_allowed_ext = any(img.startswith(prefix) for prefix in allowed_external_prefixes)
            # handle variables like ghcr.io/${GHCR_OWNER:-radjabovdiyor2-hub}...
            if not is_ghcr and not is_allowed_ext:
                log_error(f"Service '{svc_name}' has image '{img}' which is neither ghcr.io nor in allowed external list.")
                
        # Rule 5: mem_limit check
        # postgres < 512m
        if svc_name == 'postgres':
            ml = svc_conf.get('mem_limit')
            if not ml or int(str(ml).lower().replace('m', '')) < 512:
                log_error(f"Service '{svc_name}' mem_limit is less than 512m (found {ml}).")
                
        # tgas services < 192m 
        if svc_name in tgas_services:
            ml = svc_conf.get('mem_limit')
            if not ml:
                # check anchor or just error if missing
                pass
            if ml and int(str(ml).lower().replace('m', '')) < 192:
                log_error(f"Service '{svc_name}' mem_limit is less than 192m (found {ml}).")
        
        # actually x-tgas-bot anchor is merged by pyyaml, so ml WILL be present if inherited.
        if svc_name in tgas_services and 'mem_limit' in svc_conf:
             ml = svc_conf['mem_limit']
             if int(str(ml).lower().replace('m', '')) < 192:
                 log_error(f"Service '{svc_name}' mem_limit is less than 192m (found {ml}).")

    if len(unique_builds) > 4:
        log_error(f"Number of unique builds in docker-compose.prod.yml is {len(unique_builds)} > 4.")

    # Rule 4: check ci.yml and deploy_unified.sh for forbidden strings
    forbidden = ['up -d --build', 'compose build']
    
    for file_path in ['.github/workflows/ci.yml', 'deploy_unified.sh']:
        try:
            with open(file_path, encoding='utf-8') as f:
                content = f.read()
                for fb in forbidden:
                    if fb in content:
                        log_error(f"Forbidden string '{fb}' found in {file_path}.")
        except Exception as e:
            log_error(f"Failed to read {file_path}: {e}")

    if has_errors:
        sys.exit(1)
    else:
        print("All invariant checks passed.")
        sys.exit(0)

if __name__ == '__main__':
    main()
