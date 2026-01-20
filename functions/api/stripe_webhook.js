
import Stripe from 'stripe';
import { findPersonByEmail, findPersonByPhone, findOpenOpportunityForPerson, markOpportunityPaid } from '../copper.api.ts';

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
    apiVersion: '2025-11-17.clover', // Using user specific version
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
