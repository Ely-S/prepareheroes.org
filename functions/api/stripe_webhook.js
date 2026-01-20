
import Stripe from 'stripe';

/**
 * Cloudflare Pages Function to handle Stripe Webhooks
 * POST /api/stripe_webhook
 */
export async function onRequest(context) {
  const { request, env } = context;

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Initialize Stripe
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16', // Use a recent API version
    httpClient: Stripe.createFetchHttpClient(), // Ensure Cloudflare Worker compatibility
  });

  const signature = request.headers.get('stripe-signature');
  const body = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Handle relevant events
  if (event.type === 'checkout.session.completed' || event.type === 'invoice.payment_succeeded') {
    const session = event.data.object;
    try {
      await handlePaymentSuccess(session, env);
    } catch (error) {
      console.error('Error handling payment success:', error);
      // Return 200 to Stripe to prevent retries if it's a logic error we can't fix
      // But if it's transient, maybe 500? For now, 200 to be safe against loops.
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Waterfall logic to find and update the Copper Opportunity
 */
async function handlePaymentSuccess(session, env) {
  let opportunityId = session.client_reference_id || session.metadata?.opportunity_id;
  let matchMethod = 'direct_id';

  // 1. Direct ID check
  if (opportunityId) {
    console.log(`[Stripe Webhook] Found direct Opportunity ID: ${opportunityId}`);
  } 
  
  // 2. Email Fallback
  if (!opportunityId) {
    const email = session.customer_details?.email || session.customer_email;
    if (email) {
      console.log(`[Stripe Webhook] Looking up by email: ${email}`);
      const person = await findPersonByEmail(email, env);
      if (person) {
        opportunityId = await findOpenOpportunityForPerson(person.id, env);
        if (opportunityId) matchMethod = 'email_fallback';
      }
    }
  }

  // 3. Phone Fallback
  if (!opportunityId) {
    const phone = session.customer_details?.phone || session.customer_phone;
    if (phone) {
      console.log(`[Stripe Webhook] Looking up by phone: ${phone}`);
      const person = await findPersonByPhone(phone, env);
      if (person) {
        opportunityId = await findOpenOpportunityForPerson(person.id, env);
        if (opportunityId) matchMethod = 'phone_fallback';
      }
    }
  }

  // Action
  if (opportunityId) {
    console.log(`[Stripe Webhook] Match found via ${matchMethod}. Updating Opportunity ${opportunityId} to Won/Paid.`);
    await markOpportunityPaid(opportunityId, env);
  } else {
    console.warn(`[Stripe Webhook] No matching Opportunity found. Session: ${session.id}`);
  }
}

// --- Copper API Helpers ---

const COPPER_API_URL = 'https://api.copper.com/developer_api/v1';
const ESTATE_PLANNING_PIPELINE_ID = 1130648;
const PAID_STAGE_ID = 5076181;

function getHeaders(env) {
  return {
    'Content-Type': 'application/json',
    'X-PW-AccessToken': env.COPPER_API_KEY,
    'X-PW-Application': 'developer_api',
    'X-PW-UserEmail': env.COPPER_USER_EMAIL
  };
}

async function findPersonByEmail(email, env) {
  const response = await fetch(`${COPPER_API_URL}/people/search`, {
    method: 'POST',
    headers: getHeaders(env),
    body: JSON.stringify({
      emails: [email],
      page_size: 1
    })
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.length > 0 ? data[0] : null;
}

async function findPersonByPhone(phone, env) {
  const response = await fetch(`${COPPER_API_URL}/people/search`, {
    method: 'POST',
    headers: getHeaders(env),
    body: JSON.stringify({
      phone_number: phone, // Fuzzy match by default for 7+ digits
      page_size: 1
    })
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.length > 0 ? data[0] : null;
}

async function findOpenOpportunityForPerson(personId, env) {
  // Search for OPEN opportunities in the specific pipeline for this contact
  const response = await fetch(`${COPPER_API_URL}/opportunities/search`, {
    method: 'POST',
    headers: getHeaders(env),
    body: JSON.stringify({
      primary_contact_ids: [personId],
      pipeline_ids: [ESTATE_PLANNING_PIPELINE_ID],
      status: ['Open'],
      page_size: 5 // Fetch a few to check ambiguity
    })
  });
  
  if (!response.ok) return null;
  const data = await response.json();

  if (data.length === 0) return null;
  
  // If multiple, ideally we pick the most recent one? 
  // For now, let's pick the first one (most recently modified usually, or check sort)
  // Default sort is typically date_modified descending or relevance.
  // Let's assume the first one is the best candidate.
  if (data.length > 1) {
    console.log(`[Stripe Webhook] Multiple open opportunities found for person ${personId}. Using the first one.`);
  }
  
  return data[0].id;
}

async function markOpportunityPaid(opportunityId, env) {
  const response = await fetch(`${COPPER_API_URL}/opportunities/${opportunityId}`, {
    method: 'PUT',
    headers: getHeaders(env),
    body: JSON.stringify({
      pipeline_stage_id: PAID_STAGE_ID,
      status: 'Won'
    })
  });
  
  if (!response.ok) {
    const txt = await response.text();
    console.error(`[Stripe Webhook] Failed to update opportunity ${opportunityId}: ${txt}`);
    throw new Error(`Copper update failed: ${response.status}`);
  }
  
  console.log(`[Stripe Webhook] Successfully updated opportunity ${opportunityId}`);
  return await response.json();
}
