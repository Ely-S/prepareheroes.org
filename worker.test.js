/**
 * Tests for Cloudflare Worker - Copper CRM Integration
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './worker.js';

// Mock environment variables
const mockEnv = {
  COPPER_API_KEY: 'test-api-key-123',
  COPPER_USER_EMAIL: 'test@example.com',
  COPPER_FIELD_PHONE_ID: '12345',
  COPPER_FIELD_RESPONDER_STATUS_ID: '67890'
};

// Helper to create mock requests
function createMockRequest(method, body = null) {
  const init = {
    method,
    headers: new Headers({
      'Content-Type': 'application/json',
      'Origin': 'https://prepareheroes.org'
    })
  };

  if (body) {
    init.body = JSON.stringify(body);
  }

  return new Request('https://prepareheroes.org/api/submit', init);
}

// Sample valid form data
const validFormData = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  phone: '(555) 123-4567',
  responderStatus: 'active',
  dswNumber: 'DSW12345',
  department: 'SFFD',
  maritalStatus: 'married',
  dependants: '2',
  realEstate: 'yes',
  lifeInsurance: 'yes',
  existingTrust: 'no',
  selectedPackage: 'trust-couple'
};

describe('Cloudflare Worker - Copper CRM Integration', () => {

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
  });

  describe('CORS Handling', () => {

    it('should handle OPTIONS preflight requests with correct CORS headers', async () => {
      const request = new Request('https://prepareheroes.org/api/submit', {
        method: 'OPTIONS',
        headers: new Headers({
          'Origin': 'https://prepareheroes.org'
        })
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    });

    it('should include CORS headers in successful POST responses', async () => {
      // Mock successful Copper API response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456, name: 'John Doe - Trust (Couples)' })
      });

      const request = createMockRequest('POST', validFormData);
      const response = await worker.fetch(request, mockEnv);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('HTTP Method Validation', () => {

    it('should reject GET requests', async () => {
      const request = new Request('https://prepareheroes.org/api/submit', {
        method: 'GET'
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(405);
      const text = await response.text();
      expect(text).toBe('Method not allowed');
    });

    it('should reject PUT requests', async () => {
      const request = new Request('https://prepareheroes.org/api/submit', {
        method: 'PUT'
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(405);
    });

    it('should accept POST requests', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456 })
      });

      const request = createMockRequest('POST', validFormData);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
    });
  });

  describe('Form Data Validation', () => {

    it('should reject requests without firstName', async () => {
      const invalidData = { ...validFormData };
      delete invalidData.firstName;

      const request = createMockRequest('POST', invalidData);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required fields');
    });

    it('should reject requests without lastName', async () => {
      const invalidData = { ...validFormData };
      delete invalidData.lastName;

      const request = createMockRequest('POST', invalidData);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required fields');
    });

    it('should reject requests without email', async () => {
      const invalidData = { ...validFormData };
      delete invalidData.email;

      const request = createMockRequest('POST', invalidData);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Missing required fields');
    });

    it('should accept requests with all required fields', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456 })
      });

      const request = createMockRequest('POST', {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@example.com'
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('Copper CRM API Integration', () => {

    it('should call Copper API with correct headers', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456, name: 'Test Opportunity' })
      });
      global.fetch = mockFetch;

      const request = createMockRequest('POST', validFormData);
      await worker.fetch(request, mockEnv);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.copper.com/developer_api/v1/opportunities',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-PW-AccessToken': 'test-api-key-123',
            'X-PW-Application': 'developer_api',
            'X-PW-UserEmail': 'test@example.com'
          })
        })
      );
    });

    it('should create opportunity with correct name format', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456 })
      });
      global.fetch = mockFetch;

      const request = createMockRequest('POST', validFormData);
      await worker.fetch(request, mockEnv);

      const callArgs = mockFetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.name).toBe('John Doe - Trust (Couples)');
    });

    it('should include all form data in opportunity details', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456 })
      });
      global.fetch = mockFetch;

      const request = createMockRequest('POST', validFormData);
      await worker.fetch(request, mockEnv);

      const callArgs = mockFetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.details).toContain('John Doe');
      expect(payload.details).toContain('john.doe@example.com');
      expect(payload.details).toContain('(555) 123-4567');
      expect(payload.details).toContain('active');
      expect(payload.details).toContain('DSW12345');
      expect(payload.details).toContain('SFFD');
      expect(payload.details).toContain('married');
    });

    it('should handle Copper API errors gracefully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API credentials'
      });

      const request = createMockRequest('POST', validFormData);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Copper API error');
    });

    it('should return success with opportunity ID when Copper API succeeds', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: 999888,
          name: 'John Doe - Trust (Couples)',
          status: 'Open'
        })
      });

      const request = createMockRequest('POST', validFormData);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.opportunityId).toBe(999888);
      expect(data.message).toBe('Opportunity created successfully');
    });
  });

  describe('Package Type Handling', () => {

    it('should handle "will" package type correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456 })
      });

      const data = { ...validFormData, selectedPackage: 'will' };
      const request = createMockRequest('POST', data);
      await worker.fetch(request, mockEnv);

      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.name).toContain('Will Package');
    });

    it('should handle "trust-individual" package type correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456 })
      });

      const data = { ...validFormData, selectedPackage: 'trust-individual' };
      const request = createMockRequest('POST', data);
      await worker.fetch(request, mockEnv);

      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.name).toContain('Trust (Individual)');
    });

    it('should handle "trust-update" package type correctly', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456 })
      });

      const data = { ...validFormData, selectedPackage: 'trust-update' };
      const request = createMockRequest('POST', data);
      await worker.fetch(request, mockEnv);

      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.name).toContain('Update Existing Trust');
    });

    it('should default to "will" package when selectedPackage is missing', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456 })
      });

      const data = { ...validFormData };
      delete data.selectedPackage;
      const request = createMockRequest('POST', data);
      await worker.fetch(request, mockEnv);

      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.name).toContain('Will Package');
    });
  });

  describe('Error Handling', () => {

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const request = createMockRequest('POST', validFormData);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Network error');
    });

    it('should handle malformed JSON in request', async () => {
      const request = new Request('https://prepareheroes.org/api/submit', {
        method: 'POST',
        headers: new Headers({
          'Content-Type': 'application/json'
        }),
        body: 'invalid json{'
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
    });

    it('should handle Copper API timeout', async () => {
      global.fetch = vi.fn().mockImplementation(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
      );

      const request = createMockRequest('POST', validFormData);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('Custom Fields', () => {

    it('should include custom fields in Copper payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456 })
      });
      global.fetch = mockFetch;

      const request = createMockRequest('POST', validFormData);
      await worker.fetch(request, mockEnv);

      const callArgs = mockFetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);

      expect(payload.custom_fields).toEqual([
        {
          custom_field_definition_id: '12345',
          value: '(555) 123-4567'
        },
        {
          custom_field_definition_id: '67890',
          value: 'active'
        }
      ]);
    });
  });

  describe('Responder Status Handling', () => {

    it('should include DSW number for active responders', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456 })
      });

      const request = createMockRequest('POST', validFormData);
      await worker.fetch(request, mockEnv);

      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.details).toContain('DSW12345');
      expect(payload.details).toContain('SFFD');
    });

    it('should handle civilian status without DSW number', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ id: 123456 })
      });

      const civilianData = {
        ...validFormData,
        responderStatus: 'civilian',
        dswNumber: undefined,
        department: undefined
      };

      const request = createMockRequest('POST', civilianData);
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      const callArgs = global.fetch.mock.calls[0][1];
      const payload = JSON.parse(callArgs.body);
      expect(payload.details).toContain('civilian');
      expect(payload.details).not.toContain('DSW Number');
    });
  });
});
