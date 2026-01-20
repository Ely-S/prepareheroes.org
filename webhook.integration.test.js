import { describe, it, expect, afterAll } from 'vitest';
import { onRequest as submitQuizHandler } from './functions/api/submit_quiz.js';
import { onRequest as stripeWebhookHandler } from './functions/api/stripe_webhook.js';
import Stripe from 'stripe';

// Mock Worker Router that dispatches based on URL
const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const context = { request, env, waitUntil: () => {} };

    if (url.pathname === '/api/submit_quiz') {
      return submitQuizHandler(context);
    } 
    
    if (url.pathname === '/api/stripe_webhook') {
      return stripeWebhookHandler(context);
    }

    return new Response('Not Found', { status: 404 });
  }
};

// Initialize Stripe (test mode doesn't need real key for signature generation)
const stripe = new Stripe('sk_test_dummy', {
  apiVersion: '2025-11-17.clover',
});

// Test configuration
const TEST_CONFIG = {
  COPPER_API_URL: 'https://api.copper.com/developer_api/v1',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_12345'
};

// Environment variables
const env = {
  COPPER_API_KEY: process.env.COPPER_API_KEY || '',
  COPPER_USER_EMAIL: process.env.COPPER_USER_EMAIL || '',
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || 'sk_test_mock',
  STRIPE_WEBHOOK_SECRET: TEST_CONFIG.STRIPE_WEBHOOK_SECRET
};

const hasCopperCreds = Boolean(env.COPPER_API_KEY && env.COPPER_USER_EMAIL);
const describeIfCreds = hasCopperCreds ? describe : describe.skip;

// Helper to make Copper API requests
async function copperApiRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-PW-AccessToken': env.COPPER_API_KEY,
      'X-PW-Application': 'developer_api',
      'X-PW-UserEmail': env.COPPER_USER_EMAIL
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${TEST_CONFIG.COPPER_API_URL}${endpoint}`, options);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Copper API error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

// Helper to delete an opportunity
async function deleteOpportunity(opportunityId) {
  await copperApiRequest(`/opportunities/${opportunityId}`, 'DELETE');
}

describeIfCreds('Webhook Payment Flow Test', () => {
  let createdOpportunityId = null;
  const testTimestamp = Date.now();
  
  // Test Data
  const testFormData = {
    firstName: 'WebhookTest',
    lastName: `User${testTimestamp}`,
    email: `webhook-test-${testTimestamp}@example.com`,
    phone: '(555) 123-4567',
    responderStatus: 'active',
    dswNumber: `TEST${testTimestamp}`,
    department: 'TEST-DEPT',
    maritalStatus: 'single',
    dependants: '0',
    realEstate: 'no',
    lifeInsurance: 'no',
    existingTrust: 'no',
    selectedPackage: 'will'
  };

  it('should create an opportunity and mark it as paid via webhook', async () => {
    console.log('\n--- Starting Webhook Payment Flow Test ---');

    // 1. Create Opportunity
    console.log('\n[Step 1] Creating opportunity via API...');
    const createReq = new Request('https://prepareheroes.org/api/submit_quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testFormData)
    });

    const createRes = await worker.fetch(createReq, env);
    const createResult = await createRes.json();
    
    expect(createRes.status).toBe(200);
    expect(createResult.success).toBe(true);
    createdOpportunityId = createResult.opportunityId;
    console.log(`✓ Opportunity created: ${createdOpportunityId}`);

    // 2. Validate Initial State
    const initialOpp = await copperApiRequest(`/opportunities/${createdOpportunityId}`);
    expect(initialOpp.status).not.toBe('Won');
    console.log(`✓ Initial status verified: ${initialOpp.status}`);

    // 3. Simulate Stripe Webhook
    console.log('\n[Step 3] Simulating Stripe Webhook...');
    
    const webhookPayload = {
      id: `evt_test_${testTimestamp}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: `cs_test_${testTimestamp}`,
          object: 'checkout.session',
          client_reference_id: String(createdOpportunityId),
          payment_status: 'paid',
          customer_details: {
            email: testFormData.email,
            name: `${testFormData.firstName} ${testFormData.lastName}`
          }
        }
      }
    };

    const payloadString = JSON.stringify(webhookPayload);
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: payloadString,
      secret: TEST_CONFIG.STRIPE_WEBHOOK_SECRET
    });

    const webhookReq = new Request('https://prepareheroes.org/api/stripe_webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': signature
      },
      body: payloadString
    });

    const webhookRes = await worker.fetch(webhookReq, env);
    if (webhookRes.status !== 200) {
        console.log('Webhook failed:', await webhookRes.text());
    }
    expect(webhookRes.status).toBe(200);
    console.log('✓ Webhook processed successfully');

    // 4. Validate Final State
    console.log('\n[Step 4] Validating final opportunity status...');
    
    // Give Copper API a moment to update
    await new Promise(resolve => setTimeout(resolve, 2000));

    const finalOpp = await copperApiRequest(`/opportunities/${createdOpportunityId}`);
    
    console.log('Final Status:', finalOpp.status);
    console.log('Final Stage ID:', finalOpp.pipeline_stage_id);

    // Verify it moved to the Paid stage (5076181)
    expect(finalOpp.pipeline_stage_id).toBe(5076181);
    
    console.log('✓ Opportunity marked as Paid (Stage Updated)');

  }, 60000);

  afterAll(async () => {
    if (createdOpportunityId) {
      console.log('\n[Cleanup] Deleting test opportunity...');
      try {
        await deleteOpportunity(createdOpportunityId);
        console.log('✓ Cleanup successful');
      } catch (err) {
        console.error('Cleanup failed:', err.message);
      }
    }
  });
});
