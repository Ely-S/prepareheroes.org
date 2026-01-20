
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
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`Webhook signature verification failed: ${err.message}`);
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  // Handle relevant events
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      await handleCheckoutSessionSuccess(session, env);
    } catch (error) {
      console.error('Error handling checkout.session.completed:', error);
      return new Response('Webhook handler failed', { status: 500 });
    }
  } else if (event.type === 'invoice.payment_succeeded') {
    const invoice = event.data.object;
    try {
      await handleInvoicePaymentSuccess(invoice, env, stripe);
    } catch (error) {
      console.error('Error handling invoice.payment_succeeded:', error);
      return new Response('Webhook handler failed', { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Waterfall logic to find and update the Copper Opportunity
 */
async function handleCheckoutSessionSuccess(session, env) {
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
    const invoiceId = typeof session.invoice === 'string' ? session.invoice : session.invoice?.id;
    const invoiceUrl = session.invoice?.hosted_invoice_url;
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    await markOpportunityPaid(opportunityId, env, {
      invoiceId,
      invoiceUrl,
      sessionId: session.id,
      paymentIntentId
    });
  } else {
    console.warn(`[Stripe Webhook] No matching Opportunity found. Session: ${session.id}`);
  }
}

/**
 * Invoice handler (customers/subscriptions)
 */
async function handleInvoicePaymentSuccess(invoice, env, stripe) {
  let opportunityId = invoice.metadata?.opportunity_id;
  let matchMethod = 'direct_id';

  if (opportunityId) {
    console.log(`[Stripe Webhook] Found direct Opportunity ID: ${opportunityId}`);
  }

  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  let customer = null;

  if (customerId) {
    try {
      customer = await stripe.customers.retrieve(customerId);
    } catch (error) {
      console.warn('[Stripe Webhook] Failed to retrieve Stripe customer for invoice.', error);
    }
  }

  // Email fallback
  if (!opportunityId) {
    const email = invoice.customer_email || customer?.email;
    if (email) {
      console.log(`[Stripe Webhook] Looking up by email: ${email}`);
      const person = await findPersonByEmail(email, env);
      if (person) {
        opportunityId = await findOpenOpportunityForPerson(person.id, env);
        if (opportunityId) matchMethod = 'email_fallback';
      }
    }
  }

  // Phone fallback
  if (!opportunityId) {
    const phone = customer?.phone;
    if (phone) {
      console.log(`[Stripe Webhook] Looking up by phone: ${phone}`);
      const person = await findPersonByPhone(phone, env);
      if (person) {
        opportunityId = await findOpenOpportunityForPerson(person.id, env);
        if (opportunityId) matchMethod = 'phone_fallback';
      }
    }
  }

  if (opportunityId) {
    console.log(`[Stripe Webhook] Match found via ${matchMethod}. Updating Opportunity ${opportunityId} to Won/Paid.`);
    const invoiceId = invoice.id;
    const invoiceUrl = invoice.hosted_invoice_url;
    const paymentIntentId = typeof invoice.payment_intent === 'string' ? invoice.payment_intent : invoice.payment_intent?.id;
    await markOpportunityPaid(opportunityId, env, {
      invoiceId,
      invoiceUrl,
      paymentIntentId
    });
  } else {
    console.warn(`[Stripe Webhook] No matching Opportunity found. Invoice: ${invoice.id}`);
  }
}
