import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { onRequest as submitQuizHandler } from './functions/api/submit_quiz.js';
import { onRequest as checkoutRedirectHandler } from './functions/c/[id].js';

const originalFetch = global.fetch;

const mockEnv = {
  COPPER_API_KEY: 'test-key',
  COPPER_USER_EMAIL: 'test@example.com'
};

const baseFormData = {
  firstName: 'Taylor',
  lastName: 'Reed',
  email: 'taylor.reed@example.com',
  responderStatus: 'civilian',
  selectedPackage: 'trust-couple'
};

describe('Checkout link and state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('stores checkout link/state and returns checkoutLink on submit', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/people/search') && options.method === 'POST') {
        return {
          ok: true,
          json: async () => [{ id: 77 }]
        };
      }

      if (url.endsWith('/opportunities') && options.method === 'POST') {
        return {
          ok: true,
          json: async () => ({ id: 555 })
        };
      }

      if (url.endsWith('/opportunities/555') && options.method === 'GET') {
        return {
          ok: true,
          json: async () => ({ id: 555, details: 'Email: taylor.reed@example.com' })
        };
      }

      if (url.endsWith('/opportunities/555') && options.method === 'PUT') {
        return {
          ok: true,
          json: async () => ({ id: 555 })
        };
      }

      return { ok: false, status: 404, text: async () => 'Not Found' };
    });

    global.fetch = fetchMock;

    const request = new Request('https://prepareheroes.org/api/submit_quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(baseFormData)
    });

    const response = await submitQuizHandler({ request, env: mockEnv });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.checkoutLink).toBe('https://prepareheroes.org/c/555');

    const putCall = fetchMock.mock.calls.find(
      ([url, options]) => url.endsWith('/opportunities/555') && options.method === 'PUT'
    );
    expect(putCall).toBeTruthy();
    const [, putOptions] = putCall;
    const payload = JSON.parse(putOptions.body);
    expect(payload.details).toContain('Checkout Link: https://prepareheroes.org/c/555');
    expect(payload.details).toContain('Checkout State: Pending');
  });
});

describe('/c/:id redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('redirects paid opportunities to success page', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 123, pipeline_stage_id: 5076181 })
    });

    const request = new Request('https://prepareheroes.org/c/123');
    const response = await checkoutRedirectHandler({
      request,
      env: mockEnv,
      params: { id: '123' }
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('https://prepareheroes.org/success.html?applicationId=123');
  });

  it('redirects unpaid opportunities to checkout with params', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 321,
        pipeline_stage_id: 5076179,
        primary_contact_id: 777,
        details: 'Email: user@example.com',
        custom_fields: [
          { custom_field_definition_id: 722620, value: 'trust-couple' },
          { custom_field_definition_id: 722612, value: 'civilian' }
        ]
      })
    });

    const request = new Request('https://prepareheroes.org/c/321');
    const response = await checkoutRedirectHandler({
      request,
      env: mockEnv,
      params: { id: '321' }
    });

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      'https://prepareheroes.org/checkout.html?chosenPackage=trust-couple&customerType=civilian&email=user%40example.com&opportunityId=321'
    );
  });

  it('returns 404 when the opportunity is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => 'Not Found'
    });

    const request = new Request('https://prepareheroes.org/c/999');
    const response = await checkoutRedirectHandler({
      request,
      env: mockEnv,
      params: { id: '999' }
    });

    expect(response.status).toBe(404);
  });
});
