/**
 * Cloudflare Pages Function to handle form submissions and create Copper CRM opportunities
 * This function is automatically available at /api/submit_quiz
 */

import { findPersonByEmail, createPerson, updatePersonPhone, createCopperOpportunity } from '../copper.api.ts';

/**
 * Handle all requests (GET, POST, OPTIONS, etc.)
 */
export async function onRequest(context) {
  const { request, env } = context;

  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return handleCORS();
  }

  // Only allow POST requests
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Parse form data
    const formData = await request.json();

    // Validate required fields
    if (!formData.firstName || !formData.lastName || !formData.email) {
      return corsResponse({
        success: false,
        error: 'Missing required fields'
      }, 400);
    }

    // 1. Find or Create Person
    let person = await findPersonByEmail(formData.email, env);
    let personId;

    if (person) {
      personId = person.id;
      // Update phone if missing
      if (formData.phone) {
        await updatePersonPhone(person, formData.phone, env);
      }
    } else {
      personId = await createPerson(formData, env);
    }

    // 2. Create opportunity in Copper CRM (Estate Planning pipeline)
    const opportunity = await createCopperOpportunity(formData, personId, env);

    return corsResponse({
      success: true,
      opportunityId: opportunity.id,
      message: 'Estate planning form submitted successfully'
    });

  } catch (error) {
    console.error('Error processing request:', error);
    return corsResponse({
      success: false,
      error: error.message || 'Failed to create opportunity'
    }, 500);
  }
}

/**
 * Handle CORS preflight requests
 */
function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    }
  });
}

/**
 * Create a response with CORS headers
 */
function corsResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  });
}
