/**
 * Integration Test for Cloudflare Worker - Copper CRM
 *
 * This test creates a real opportunity in Copper CRM, validates it exists,
 * and then deletes it to clean up.
 *
 * Run with: npm run test:integration
 *
 * IMPORTANT: This test hits the real Copper API and requires valid credentials
 */

import { describe, it, expect, afterAll } from 'vitest';
import worker from './worker.js';

// Test configuration
const TEST_CONFIG = {
  COPPER_API_URL: 'https://api.copper.com/developer_api/v1',
  WORKER_URL: 'http://localhost:8787', // For local testing, or use your deployed worker URL
};

// Environment variables - these should be set in .dev.vars or environment
const env = {
  COPPER_API_KEY: process.env.COPPER_API_KEY || '',
  COPPER_USER_EMAIL: process.env.COPPER_USER_EMAIL || '',
  COPPER_FIELD_PHONE_ID: process.env.COPPER_FIELD_PHONE_ID || '',
  COPPER_FIELD_RESPONDER_STATUS_ID: process.env.COPPER_FIELD_RESPONDER_STATUS_ID || ''
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

// Helper to search for an opportunity by name
async function searchOpportunity(name) {
  const searchResults = await copperApiRequest('/opportunities/search', 'POST', {
    name: name
  });

  return searchResults.find(opp => opp.name === name);
}

// Helper to delete an opportunity
async function deleteOpportunity(opportunityId) {
  await copperApiRequest(`/opportunities/${opportunityId}`, 'DELETE');
}

describeIfCreds('Copper CRM Integration Test', () => {
  let createdOpportunityId = null;
  const testTimestamp = Date.now();

  // Test form data with unique identifiers
  const testFormData = {
    firstName: 'IntegrationTest',
    lastName: `User${testTimestamp}`,
    email: `integration-test-${testTimestamp}@example.com`,
    phone: '(555) 999-8888',
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

  const expectedOpportunityName = `IntegrationTest User${testTimestamp} - Will Package`;

  it('should create an opportunity via the worker, validate it exists, and then delete it', async () => {
    console.log('\n--- Starting Integration Test ---');
    console.log(`Test Opportunity Name: ${expectedOpportunityName}`);

    // STEP 1: Create opportunity via the worker
    console.log('\n[Step 1] Creating opportunity via worker...');

    const request = new Request('https://prepareheroes.org/api/submit', {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(testFormData)
    });

    const workerResponse = await worker.fetch(request, env);
    const workerResult = await workerResponse.json();

    console.log('Worker Response:', workerResult);

    // Validate worker response
    expect(workerResponse.status).toBe(200);
    expect(workerResult.success).toBe(true);
    expect(workerResult.opportunityId).toBeDefined();
    expect(workerResult.message).toBe('Opportunity created successfully');

    createdOpportunityId = workerResult.opportunityId;
    console.log(`✓ Opportunity created with ID: ${createdOpportunityId}`);

    // STEP 2: Validate the opportunity exists in Copper
    console.log('\n[Step 2] Validating opportunity exists in Copper...');

    // Wait a moment for the API to be consistent
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Fetch the opportunity directly by ID
    const opportunity = await copperApiRequest(`/opportunities/${createdOpportunityId}`);

    console.log('Fetched Opportunity:', {
      id: opportunity.id,
      name: opportunity.name,
      status: opportunity.status
    });

    // Validate opportunity fields
    expect(opportunity).toBeDefined();
    expect(opportunity.id).toBe(createdOpportunityId);
    expect(opportunity.name).toBe(expectedOpportunityName);
    expect(opportunity.details).toBeDefined();

    // Validate that form data is in the details
    expect(opportunity.details).toContain(testFormData.firstName);
    expect(opportunity.details).toContain(testFormData.lastName);
    expect(opportunity.details).toContain(testFormData.email);
    expect(opportunity.details).toContain(testFormData.phone);
    expect(opportunity.details).toContain(testFormData.responderStatus);
    expect(opportunity.details).toContain(testFormData.dswNumber);
    expect(opportunity.details).toContain(testFormData.department);

    console.log('✓ Opportunity validated successfully');

    // STEP 3: Delete the opportunity to clean up
    console.log('\n[Step 3] Deleting opportunity to clean up...');

    await deleteOpportunity(createdOpportunityId);
    console.log(`✓ Opportunity ${createdOpportunityId} deleted successfully`);

    // STEP 4: Verify it's actually deleted
    console.log('\n[Step 4] Verifying opportunity is deleted...');

    try {
      await copperApiRequest(`/opportunities/${createdOpportunityId}`);
      // If we get here, the opportunity still exists (should not happen)
      throw new Error('Opportunity was not deleted');
    } catch (error) {
      // Expected to fail with 404 or similar
      expect(error.message).toMatch(/404|not found|Copper API error/i);
      console.log('✓ Confirmed opportunity is deleted');
    }

    console.log('\n--- Integration Test Completed Successfully ---\n');
  }, 30000); // 30 second timeout for this test

  // Cleanup in case test fails
  afterAll(async () => {
    if (createdOpportunityId) {
      try {
        console.log('\n[Cleanup] Attempting to delete test opportunity...');
        await deleteOpportunity(createdOpportunityId);
        console.log('✓ Cleanup successful');
      } catch (error) {
        console.log('Note: Cleanup failed (opportunity may already be deleted):', error.message);
      }
    }
  });
});

describeIfCreds('Copper API Connection Test', () => {
  it('should successfully connect to Copper API', async () => {
    // Simple test to verify API credentials work
    const result = await copperApiRequest('/opportunities/search', 'POST', {
      page_size: 1
    });

    expect(Array.isArray(result)).toBe(true);
    console.log(`✓ Copper API connection successful (found ${result.length} opportunities in first page)`);
  });
});
