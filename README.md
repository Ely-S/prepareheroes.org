# Estate Planning Form - Copper CRM Integration

Cloudflare Worker integration for prepareheroes.org estate planning form that creates opportunities in Copper CRM.

## Project Overview

This project provides a seamless integration between the estate planning intake form and Copper CRM. When users submit the form, it creates an opportunity in Copper with all their information.

## Features

- ✅ Cloudflare Worker handles form submissions
- ✅ Creates opportunities in Copper CRM automatically
- ✅ Secure API key handling via environment variables
- ✅ CORS support for cross-origin requests
- ✅ Comprehensive error handling
- ✅ Form validation
- ✅ Automatic redirect after submission
- ✅ Full test suite (unit + integration tests)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy `.dev.vars.example` to `.dev.vars` and add your credentials:

```bash
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars`:
```
COPPER_API_KEY=your_api_key_here
COPPER_USER_EMAIL=eli@edgewaterins.com
```

### 3. Run Tests

```bash
# Unit tests (fast, no API calls)
npm run test:unit

# Integration tests (creates real opportunity)
npm run test:integration
```

### 4. Run Locally (Pages + Functions)

```bash
npm run dev
```

This starts a local Cloudflare Pages dev server (typically at `http://localhost:8787`) that serves the static site and the `/functions` API routes.

### 5. Deploy

```bash
# Deploy the worker
make deploy-worker

# Deploy the website
make deploy

# Or deploy both
make deploy-all
```

## Project Structure

```
├── index.html                  # Main form page
├── script.js                   # Frontend form handling
├── thank-you.html              # Success page
├── worker.js                   # Cloudflare Worker (Copper integration)
├── worker.test.js              # Unit tests (24 tests)
├── worker.integration.test.js  # Integration tests (2 tests)
├── package.json                # Dependencies and scripts
├── wrangler.toml               # Worker configuration
├── Makefile                    # Deployment commands
├── .dev.vars                   # Environment variables (local)
├── .dev.vars.example           # Environment template
└── .gitignore                  # Git exclusions
```

## Documentation

- **[SETUP.md](SETUP.md)** - Complete setup and deployment guide
- **[TESTING.md](TESTING.md)** - Testing guide and best practices

## How It Works

1. User fills out the estate planning form on prepareheroes.org
2. Form is submitted to the Cloudflare Worker at `/api/submit`
3. Worker validates the form data
4. Worker creates an opportunity in Copper CRM via their API
5. On success, user is redirected to the thank-you page
6. On error, user sees a friendly error message

## Form Fields Captured

- **Personal Info:** Name, email, phone
- **Responder Status:** Active/Retired/Civilian
- **Department Info:** DSW number, department (for responders)
- **Family Info:** Marital status, number of dependents
- **Assets:** Real estate, life insurance, existing trusts
- **Package Selection:** Will, Individual Trust, Couples Trust, or Trust Update

## API Endpoints

### Worker Route
```
POST https://prepareheroes.org/api/submit
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "(555) 123-4567",
  "responderStatus": "active",
  "dswNumber": "DSW12345",
  "department": "SFFD",
  "maritalStatus": "married",
  "dependants": "2",
  "realEstate": "yes",
  "lifeInsurance": "yes",
  "existingTrust": "no",
  "selectedPackage": "trust-couple"
}
```

**Response:**
```json
{
  "success": true,
  "opportunityId": 36564532,
  "message": "Opportunity created successfully"
}
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `COPPER_API_KEY` | Your Copper API token | Yes |
| `COPPER_USER_EMAIL` | Your Copper account email | Yes |
| `COPPER_FIELD_PHONE_ID` | Custom field ID for phone | Optional |
| `COPPER_FIELD_RESPONDER_STATUS_ID` | Custom field ID for status | Optional |

## Available Commands

```bash
# Development
npm run dev                 # Start local Pages + Functions dev server
npm run dev:worker          # Start local Worker only (wrangler dev)

# Testing
npm test                    # Run all tests
npm run test:unit           # Run unit tests only
npm run test:integration    # Run integration tests
npm run test:watch          # Run tests in watch mode
npm run test:coverage       # Generate coverage report

# Deployment
make deploy                 # Deploy static site
make deploy-worker          # Deploy worker
make deploy-all             # Deploy both
```

## Test Results

### Unit Tests: ✅ 24/24 Passing
- CORS handling
- HTTP method validation
- Form data validation
- Copper API integration
- Package type handling
- Error handling
- Custom fields
- Responder status handling

### Integration Tests: ✅ 2/2 Passing
- Full workflow (Create → Validate → Delete)
- API connection verification

## Security

- ✅ API keys stored as encrypted secrets (never in code)
- ✅ Environment variables for sensitive data
- ✅ `.dev.vars` excluded from git
- ✅ CORS headers properly configured
- ✅ Input validation on all form fields
- ✅ Error messages don't expose sensitive info

## Deployment

The site is deployed to **prepareheroes.org** using Cloudflare Pages. The worker is deployed to Cloudflare Workers and routed to `prepareheroes.org/api/submit`.

### Production URLs
- **Website:** https://prepareheroes.org/
- **API Endpoint:** https://prepareheroes.org/api/submit
- **Thank You Page:** https://prepareheroes.org/thank-you.html

## Support

For issues or questions:
1. Check the [SETUP.md](SETUP.md) troubleshooting section
2. Review [TESTING.md](TESTING.md) for test-related issues
3. Open an issue with details

## License

MIT

---

**Built for Edgewater Insurance Solutions**
Serving San Francisco First Responders since 2006
