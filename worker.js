/**
 * Cloudflare Worker to handle form submissions and create Copper CRM opportunities
 */

export default {
  async fetch(request, env) {
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

      // Create opportunity in Copper CRM
      const opportunity = await createCopperOpportunity(formData, env);

      return corsResponse({
        success: true,
        opportunityId: opportunity.id,
        message: 'Opportunity created successfully'
      });

    } catch (error) {
      console.error('Error processing request:', error);
      return corsResponse({
        success: false,
        error: error.message || 'Failed to create opportunity'
      }, 500);
    }
  }
};

/**
 * Create a new opportunity in Copper CRM
 */
async function createCopperOpportunity(formData, env) {
  const copperApiUrl = 'https://api.copper.com/developer_api/v1/opportunities';

  // Build opportunity name
  const packageNames = {
    'will': 'Will Package',
    'trust-individual': 'Trust (Individual)',
    'trust-couple': 'Trust (Couples)',
    'trust-update': 'Update Existing Trust'
  };

  const selectedPackage = formData.selectedPackage || 'will';
  const packageName = packageNames[selectedPackage] || 'Will Package';
  const opportunityName = `${formData.firstName} ${formData.lastName} - ${packageName}`;

  // Build custom fields and details based on form data
  const details = buildOpportunityDetails(formData);

  // Prepare Copper API request
  const copperPayload = {
    name: opportunityName,
    // You can add these if you have them configured in Copper:
    // primary_contact_id: null, // Would need to create/find contact first
    // customer_source_id: null, // Your Copper customer source ID
    // pipeline_id: null, // Your Copper pipeline ID
    // pipeline_stage_id: null, // Your Copper pipeline stage ID
    details: details,
    custom_fields: [
      {
        custom_field_definition_id: env.COPPER_FIELD_PHONE_ID, // You'll need to set this
        value: formData.phone
      },
      {
        custom_field_definition_id: env.COPPER_FIELD_RESPONDER_STATUS_ID,
        value: formData.responderStatus
      }
      // Add more custom fields as needed
    ]
  };

  // Make request to Copper API
  const response = await fetch(copperApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-PW-AccessToken': env.COPPER_API_KEY,
      'X-PW-Application': 'developer_api',
      'X-PW-UserEmail': env.COPPER_USER_EMAIL
    },
    body: JSON.stringify(copperPayload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Copper API Error:', errorText);
    throw new Error(`Copper API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Build detailed description for the opportunity
 */
function buildOpportunityDetails(formData) {
  const details = [];

  details.push(`Name: ${formData.firstName} ${formData.lastName}`);
  details.push(`Email: ${formData.email}`);
  details.push(`Phone: ${formData.phone}`);
  details.push(`\nFirst Responder Status: ${formData.responderStatus}`);

  if (formData.dswNumber) {
    details.push(`DSW Number: ${formData.dswNumber}`);
  }

  if (formData.department) {
    details.push(`Department: ${formData.department}`);
  }

  details.push(`\nMarital Status: ${formData.maritalStatus}`);
  details.push(`Number of Dependants: ${formData.dependants}`);
  details.push(`Owns Real Estate: ${formData.realEstate}`);
  details.push(`Has Life Insurance: ${formData.lifeInsurance}`);
  details.push(`Has Existing Trust: ${formData.existingTrust}`);

  details.push(`\nSelected Package: ${formData.selectedPackage || 'will'}`);

  return details.join('\n');
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
