# Copper CRM Integration Setup Guide

This guide will help you deploy the Cloudflare Worker to integrate your estate planning form with Copper CRM.

## Prerequisites

1. A Cloudflare account (free tier works fine)
2. Node.js installed (v16 or higher)
3. Copper CRM account with API access
4. Your Copper API key and email

## Step 1: Install Wrangler CLI

```bash
npm install -g wrangler
```

## Step 2: Login to Cloudflare

```bash
wrangler login
```

This will open a browser window to authenticate with your Cloudflare account.

## Step 3: Configure Environment Variables

### For Local Development:

1. Copy the example file:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

2. Edit `.dev.vars` and add your actual values:
   ```
   COPPER_API_KEY=44e1c276e36cd4108fff6d5b41ba911c
   COPPER_USER_EMAIL=your-email@example.com
   COPPER_FIELD_PHONE_ID=123456
   COPPER_FIELD_RESPONDER_STATUS_ID=123457
   ```

### For Production:

Set secrets using Wrangler (recommended - keeps secrets secure):

```bash
wrangler secret put COPPER_API_KEY
# Enter: 44e1c276e36cd4108fff6d5b41ba911c when prompted

wrangler secret put COPPER_USER_EMAIL
# Enter your email when prompted

wrangler secret put COPPER_FIELD_PHONE_ID
# Enter the field ID when prompted

wrangler secret put COPPER_FIELD_RESPONDER_STATUS_ID
# Enter the field ID when prompted
```

## Step 4: Find Your Copper Custom Field IDs (Optional)

If you want to map form fields to custom fields in Copper:

1. Log into Copper CRM
2. Go to Settings > Custom Fields
3. Click on the field you want to use
4. The field ID will be in the URL: `https://app.copper.com/companies/settings/custom_fields/FIELD_ID`

You can also use the Copper API to list all custom fields:
```bash
curl https://api.copper.com/developer_api/v1/custom_field_definitions \
  -H "X-PW-AccessToken: YOUR_API_KEY" \
  -H "X-PW-Application: developer_api" \
  -H "X-PW-UserEmail: YOUR_EMAIL"
```

## Step 5: Run Tests

Before deploying, run the test suite to verify everything works:

### Run Unit Tests (Fast, No API Calls)
```bash
npm run test:unit
```

This runs 24 unit tests that verify the worker logic without calling the real Copper API.

### Run Integration Tests (Creates Real Opportunity)
```bash
npm run test:integration
```

This creates a real test opportunity in Copper, validates it, and deletes it.

**Expected output:**
```
✓ Opportunity created with ID: 36564532
✓ Opportunity validated successfully
✓ Opportunity deleted successfully
✓ Confirmed opportunity is deleted
```

See **TESTING.md** for detailed testing documentation.

## Step 5b: Test Locally (Pages + Functions)

```bash
npm run dev
```

This starts a local Cloudflare Pages dev server (typically at `http://localhost:8787`).

Open `http://localhost:8787` in a browser and test the form. The frontend already posts to the local Pages Function route at `/api/submit_quiz`.

If you want to run the Worker directly instead of Pages, use:
```bash
npm run dev:worker
```

## Step 6: Deploy the Worker to Production

```bash
wrangler deploy
```

After deployment, Wrangler will output your Worker URL, something like:
```
Published wills-form-handler (version-id)
  https://wills-form-handler.YOUR-SUBDOMAIN.workers.dev
```

## Step 7: Set Up Worker Route on Your Domain

Since you're using Cloudflare Pages for prepareheroes.org, you can route the worker through your domain for a cleaner setup.

### Option A: Using Cloudflare Dashboard (Recommended)

1. Go to the Cloudflare Dashboard
2. Select your domain (prepareheroes.org)
3. Navigate to **Workers Routes** (in the Workers & Pages section)
4. Click **Add Route**
5. Configure:
   - **Route:** `prepareheroes.org/api/submit`
   - **Worker:** Select `wills-form-handler`
   - **Zone:** prepareheroes.org
6. Save

### Option B: Using wrangler.toml

Add this to your `wrangler.toml`:

```toml
routes = [
  { pattern = "prepareheroes.org/api/submit", zone_name = "prepareheroes.org" }
]
```

Then redeploy:
```bash
wrangler deploy
```

### Option C: Use the Direct Worker URL

If you prefer, you can use the direct worker URL instead:

Edit `script.js`:
```javascript
const WORKER_URL = 'https://wills-form-handler.YOUR-SUBDOMAIN.workers.dev';
```

**Note:** Using a route (Option A or B) is recommended as it keeps everything on your domain and looks more professional.

## Step 8: Create a Thank You Page

Create a `thank-you.html` page on your site to show after successful submission:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thank You | Prepare Heroes</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <section class="section-padding" style="text-align: center; padding: 100px 20px;">
        <div class="container">
            <h1>Thank You!</h1>
            <p style="font-size: 1.2rem; margin: 30px 0;">
                Your information has been submitted successfully.
                We'll be in touch shortly to help you with your estate planning needs.
            </p>
            <a href="/" class="btn btn-primary">Return Home</a>
        </div>
    </section>
</body>
</html>
```

If you want a different redirect URL, update this in `script.js`:
```javascript
const REDIRECT_URL = 'https://prepareheroes.org/your-custom-page.html';
```

## Step 9: Deploy Your Updated Frontend

Since you're using Cloudflare Pages with a Makefile:

```bash
make deploy
```

This will deploy your updated frontend with the form integration.

## Testing the Integration

1. Open your website
2. Fill out the form completely
3. Submit the form
4. Check:
   - Browser console for any errors
   - Cloudflare Workers dashboard for logs
   - Copper CRM for the new opportunity

## Troubleshooting

### "401 Unauthorized" Error
- Verify your API key is correct
- Verify your email matches your Copper account
- Check that secrets are set correctly: `wrangler secret list`

### "CORS Error" in Browser
- The worker includes CORS headers, but make sure you're not running into browser security issues
- Try testing in an incognito window

### Form Doesn't Submit
- Check browser console for JavaScript errors
- Verify `WORKER_URL` is set correctly in `script.js`
- Check Cloudflare Workers logs in the dashboard

### Opportunity Created But Fields Are Missing
- Verify custom field IDs are correct
- Check Copper API documentation for field requirements
- Some fields may require specific data types

## Viewing Worker Logs

```bash
wrangler tail
```

This will stream real-time logs from your worker, helpful for debugging.

## Optional Enhancements

### Add Pipeline and Stage IDs

To automatically assign opportunities to a specific pipeline and stage:

1. Find your pipeline ID in Copper (Settings > Pipelines)
2. Update `worker.js`:
   ```javascript
   const copperPayload = {
     name: opportunityName,
     pipeline_id: 12345, // Your pipeline ID
     pipeline_stage_id: 67890, // Your stage ID
     details: details,
     // ...
   };
   ```

### Create or Link Contacts

To link the opportunity to a contact (person):

1. Modify the worker to first search for or create a contact
2. Use the `primary_contact_id` field in the opportunity payload

See Copper API docs: https://developer.copper.com/people/

## Security Notes

- **Never commit `.dev.vars` to git** - it contains secrets
- Use `wrangler secret` for production - secrets are encrypted
- Consider adding rate limiting to prevent spam
- Validate all input data in the worker

## Additional Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Copper API Documentation](https://developer.copper.com/)
- [Wrangler CLI Reference](https://developers.cloudflare.com/workers/wrangler/)
