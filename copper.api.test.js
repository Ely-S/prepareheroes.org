
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import * as copperApi from './functions/copper.api.ts';

// Mock Fetch
const originalFetch = global.fetch;
global.fetch = vi.fn();

// Mock Environment
const mockEnv = {
  COPPER_API_KEY: 'test-api-key',
  COPPER_USER_EMAIL: 'test@example.com'
};

describe('Copper API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  describe('getCopperHeaders', () => {
    it('should return correct headers', () => {
      const headers = copperApi.getCopperHeaders(mockEnv);
      expect(headers).toEqual({
        'Content-Type': 'application/json',
        'X-PW-AccessToken': 'test-api-key',
        'X-PW-Application': 'developer_api',
        'X-PW-UserEmail': 'test@example.com'
      });
    });
  });

  describe('findPersonByEmail', () => {
    it('should return a person if found', async () => {
      const mockPerson = { id: 123, email: 'test@example.com' };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockPerson]
      });

      const result = await copperApi.findPersonByEmail('test@example.com', mockEnv);
      expect(result).toEqual(mockPerson);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/people/search'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ emails: ['test@example.com'], page_size: 1 })
        })
      );
    });

    it('should return null if no person found', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      const result = await copperApi.findPersonByEmail('test@example.com', mockEnv);
      expect(result).toBeNull();
    });

    it('should return null on API error', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Error'
      });

      const result = await copperApi.findPersonByEmail('test@example.com', mockEnv);
      expect(result).toBeNull();
    });
  });

  describe('findPersonByPhone', () => {
    it('should return a person if found', async () => {
      const mockPerson = { id: 123, phone_numbers: [{ number: '5551234567' }] };
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [mockPerson]
      });

      const result = await copperApi.findPersonByPhone('5551234567', mockEnv);
      expect(result).toEqual(mockPerson);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/people/search'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ phone_number: '5551234567', page_size: 1 })
        })
      );
    });
  });

  describe('createPerson', () => {
    it('should create a person and return ID', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 999 })
      });

      const formData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '1234567890'
      };

      const result = await copperApi.createPerson(formData, mockEnv);
      expect(result).toBe(999);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/people'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"name":"John Doe"')
        })
      );
    });

    it('should throw error on API failure', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Creation failed'
      });

      await expect(copperApi.createPerson({}, mockEnv)).rejects.toThrow('Failed to create person record');
    });
  });

  describe('updatePersonPhone', () => {
    it('should update phone if not exists', async () => {
      const person = { id: 123, phone_numbers: [] };
      fetch.mockResolvedValueOnce({ ok: true });

      await copperApi.updatePersonPhone(person, '1234567890', mockEnv);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/people/123'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"number":"1234567890"')
        })
      );
    });

    it('should not update phone if already exists', async () => {
      const person = { id: 123, phone_numbers: [{ number: '1234567890' }] };
      await copperApi.updatePersonPhone(person, '123-456-7890', mockEnv);
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('findOpenOpportunityForPerson', () => {
    it('should return opportunity ID if found', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 101 }]
      });

      const result = await copperApi.findOpenOpportunityForPerson(123, mockEnv);
      expect(result).toBe(101);
    });

    it('should return null if not found', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => []
      });

      const result = await copperApi.findOpenOpportunityForPerson(123, mockEnv);
      expect(result).toBeNull();
    });
  });

  describe('markOpportunityPaid', () => {
    it('should update opportunity stage', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await copperApi.markOpportunityPaid(101, mockEnv);

      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/opportunities/101'),
        expect.objectContaining({
          method: 'PUT',
          body: expect.stringContaining('"pipeline_stage_id":5076181')
        })
      );
    });

    it('should throw error on failure', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Update failed',
        status: 400,
        statusText: 'Bad Request'
      });

      await expect(copperApi.markOpportunityPaid(101, mockEnv)).rejects.toThrow('Copper update failed: 400');
    });
  });

});
