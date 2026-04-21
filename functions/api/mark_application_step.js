import { markOpportunityReadyForCheckout } from '../copper.api.ts';

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return corsResponse(null, 204);
  }

  if (request.method !== 'POST') {
    return corsResponse({ success: false, error: 'Method not allowed' }, 405);
  }

  try {
    const body = await request.json();
    const opportunityId = body?.opportunityId;
    const step = body?.step;

    if (!opportunityId || step !== 'checkout') {
      return corsResponse({ success: false, error: 'Invalid request body' }, 400);
    }

    await markOpportunityReadyForCheckout(opportunityId, env);
    return corsResponse({ success: true });
  } catch (error) {
    console.error('[mark_application_step] Failed to update progress', error);
    return corsResponse({ success: false, error: 'Failed to update progress' }, 500);
  }
}

function corsResponse(data, status = 200) {
  return new Response(data === null ? null : JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
