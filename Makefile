.PHONY: deploy deploy-worker deploy-all link-domain

# Your Cloudflare Zone ID for prepareheroes.org
# You can find this in the Cloudflare Dashboard on the Overview page for your domain (right sidebar)
ZONE_ID ?=

# Deploy the static site to Cloudflare Pages
deploy:
	wrangler pages deploy . --project-name prepareheroes --branch main

# Deploy the Cloudflare Worker for form handling
deploy-worker:
	wrangler deploy

# Deploy both the site and the worker
deploy-all: deploy-worker deploy

