import { describe, it, expect, afterAll } from 'vitest';
import { onRequest as submitQuizHandler } from './functions/api/submit_quiz.js';
import { onRequest as stripeWebhookHandler } from './functions/api/stripe_webhook.js';
import { onRequest as markApplicationStepHandler } from './functions/api/mark_application_step.js';
import { onRequest as opportunityRedirectHandler } from './functions/c/[opportunityId].js';
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

    if (url.pathname === '/api/mark_application_step') {
      return markApplicationStepHandler(context);
    }

    if (url.pathname.startsWith('/c/')) {
      const opportunityId = url.pathname.split('/').filter(Boolean)[1];
      return opportunityRedirectHandler({
        ...context,
        params: { opportunityId }
      });
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
  STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_12345',
  PAYMENT_LINK_FIELD_ID: 727706,
  PIPELINE_ID: 1130648,
  SIGNED_ENGAGEMENT_LETTER_STAGE_NAME: 'Signed Engagement Letter'
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

async function findPersonByEmail(email) {
  const results = await copperApiRequest('/people/search', 'POST', {
    emails: [email],
    page_size: 1
  });
  return Array.isArray(results) && results.length > 0 ? results[0] : null;
}

async function deletePerson(personId) {
  await copperApiRequest(`/people/${personId}`, 'DELETE');
}

async function getStageIdByName(pipelineId, stageName) {
  const pipeline = await copperApiRequest(`/pipelines/${pipelineId}`);
  const stages = Array.isArray(pipeline?.stages) ? pipeline.stages : [];
  const stage = stages.find(
    (entry) => String(entry?.name || '').toLowerCase() === stageName.toLowerCase()
  );
  if (!stage?.id) {
    throw new Error(`Stage "${stageName}" not found in pipeline ${pipelineId}`);
  }
  return stage.id;
}

describeIfCreds('Webhook Payment Flow Test', () => {
  let createdOpportunityId = null;
  let createdPersonId = null;
  const testTimestamp = Date.now();
  let signedEngagementLetterStageId = null;
  
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

  it('should create a person/opportunity, move through each app step, and clean up', async () => {
    console.log('\n--- Starting Full Lifecycle Integration Test ---');
    signedEngagementLetterStageId = await getStageIdByName(
      TEST_CONFIG.PIPELINE_ID,
      TEST_CONFIG.SIGNED_ENGAGEMENT_LETTER_STAGE_NAME
    );
    console.log(
      `Using stage "${TEST_CONFIG.SIGNED_ENGAGEMENT_LETTER_STAGE_NAME}" (ID ${signedEngagementLetterStageId})`
    );

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
    expect(createResult.checkoutLink).toBe(`https://prepareheroes.org/c/${createdOpportunityId}`);
    console.log(`✓ Opportunity created: ${createdOpportunityId}`);

    // 2. Validate Initial State
    await new Promise(resolve => setTimeout(resolve, 5000));
    const initialOpp = await copperApiRequest(`/opportunities/${createdOpportunityId}`);
    createdPersonId = initialOpp.primary_contact_id;
    expect(createdPersonId).toBeTruthy();
    expect(initialOpp.status).not.toBe('Won');
    expect(initialOpp.details || '').toContain('Checkout State: Pending');
    expect(initialOpp.pipeline_stage_id).not.toBe(signedEngagementLetterStageId);
    const paymentLinkField = (initialOpp.custom_fields || []).find(
      (field) => String(field.custom_field_definition_id) === String(TEST_CONFIG.PAYMENT_LINK_FIELD_ID)
    );
    expect(paymentLinkField?.value).toBe(`https://prepareheroes.org/c/${createdOpportunityId}`);
    console.log(`✓ Initial status verified: ${initialOpp.status}`);

    // 3. Verify /c/:id routes to signing first
    console.log('\n[Step 3] Verifying /c/:id redirects to signing...');
    const signRedirectRes = await worker.fetch(
      new Request(`https://prepareheroes.org/c/${createdOpportunityId}`, { method: 'GET' }),
      env
    );
    expect(signRedirectRes.status).toBe(302);
    const signLocation = signRedirectRes.headers.get('location') || '';
    expect(signLocation).toContain('/sign.html');
    console.log(`✓ Redirected to signing: ${signLocation}`);

    // 4. Mark signing complete -> checkout ready
    console.log('\n[Step 4] Marking signing complete...');
    const markStepRes = await worker.fetch(
      new Request('https://prepareheroes.org/api/mark_application_step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId: createdOpportunityId,
          step: 'checkout'
        })
      }),
      env
    );
    const markStepBody = await markStepRes.json();
    expect(markStepRes.status).toBe(200);
    expect(markStepBody.success).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 2000));
    const readyOpp = await copperApiRequest(`/opportunities/${createdOpportunityId}`);
    expect(readyOpp.details || '').toContain('Checkout State: Ready');
    expect(readyOpp.pipeline_stage_id).toBe(signedEngagementLetterStageId);
    console.log('✓ Opportunity marked Ready for checkout');

    // 5. Verify /c/:id now routes to checkout
    console.log('\n[Step 5] Verifying /c/:id redirects to checkout...');
    const checkoutRedirectRes = await worker.fetch(
      new Request(`https://prepareheroes.org/c/${createdOpportunityId}`, { method: 'GET' }),
      env
    );
    expect(checkoutRedirectRes.status).toBe(302);
    const checkoutLocation = checkoutRedirectRes.headers.get('location') || '';
    expect(checkoutLocation).toContain('/checkout.html');
    expect(checkoutLocation).not.toContain('status=complete');
    console.log(`✓ Redirected to checkout: ${checkoutLocation}`);

    // 6. Simulate Stripe Webhook
    console.log('\n[Step 6] Simulating Stripe Webhook...');
    
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
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
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

    // 7. Validate Paid State
    console.log('\n[Step 7] Validating final opportunity status...');
    
    // Give Copper API a moment to update
    await new Promise(resolve => setTimeout(resolve, 2000));

    const finalOpp = await copperApiRequest(`/opportunities/${createdOpportunityId}`);
    
    console.log('Final Status:', finalOpp.status);
    console.log('Final Stage ID:', finalOpp.pipeline_stage_id);

    // Verify it moved to the Paid stage (5076181)
    expect(finalOpp.pipeline_stage_id).toBe(5076181);
    expect(finalOpp.details || '').toContain('Checkout State: Paid');
    
    console.log('✓ Opportunity marked as Paid (Stage Updated)');

    // 8. Verify /c/:id now routes to payment complete view
    console.log('\n[Step 8] Verifying /c/:id redirects to payment complete...');
    const completeRedirectRes = await worker.fetch(
      new Request(`https://prepareheroes.org/c/${createdOpportunityId}`, { method: 'GET' }),
      env
    );
    expect(completeRedirectRes.status).toBe(302);
    const completeLocation = completeRedirectRes.headers.get('location') || '';
    expect(completeLocation).toContain('/checkout.html');
    expect(completeLocation).toContain('status=complete');
    console.log(`✓ Redirected to payment complete: ${completeLocation}`);

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

    if (!createdPersonId) {
      const person = await findPersonByEmail(testFormData.email).catch(() => null);
      createdPersonId = person?.id || null;
    }

    if (createdPersonId) {
      console.log('[Cleanup] Deleting test person...');
      try {
        await deletePerson(createdPersonId);
        console.log('✓ Person cleanup successful');
      } catch (err) {
        console.error('Person cleanup failed:', err.message);
      }
    }
  });
});
