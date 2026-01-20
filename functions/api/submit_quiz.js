/**
 * Cloudflare Pages Function to handle form submissions and create Copper CRM opportunities
 * This function is automatically available at /api/submit_quiz
 */

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
 * Helper to get Copper API Headers
 */
function getCopperHeaders(env) {
  return {
    'Content-Type': 'application/json',
    'X-PW-AccessToken': env.COPPER_API_KEY,
    'X-PW-Application': 'developer_api',
    'X-PW-UserEmail': env.COPPER_USER_EMAIL
  };
}

/**
 * Find a person by email
 */
async function findPersonByEmail(email, env) {
  const url = 'https://api.copper.com/developer_api/v1/people/search';
  const response = await fetch(url, {
    method: 'POST',
    headers: getCopperHeaders(env),
    body: JSON.stringify({
      emails: [email],
      page_size: 1
    })
  });

  if (!response.ok) {
    console.error('Error searching person:', await response.text());
    return null;
  }
  
  const data = await response.json();
  return data.length > 0 ? data[0] : null;
}

/**
 * Create a new person
 */
async function createPerson(formData, env) {
  const url = 'https://api.copper.com/developer_api/v1/people';
  const payload = {
    name: `${formData.firstName} ${formData.lastName}`,
    emails: [{ email: formData.email, category: 'work' }],
    phone_numbers: formData.phone ? [{ number: formData.phone, category: 'mobile' }] : []
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: getCopperHeaders(env),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Error creating person:', errorText);
    throw new Error('Failed to create person record');
  }

  const data = await response.json();
  return data.id;
}

/**
 * Update person's phone number if not present
 */
async function updatePersonPhone(person, phone, env) {
  const currentNumbers = person.phone_numbers || [];
  // Check if phone already exists (simple check)
  const exists = currentNumbers.some(p => p.number.replace(/\D/g, '') === phone.replace(/\D/g, ''));
  
  if (!exists) {
    const newNumbers = [...currentNumbers, { number: phone, category: 'mobile' }];
    const url = `https://api.copper.com/developer_api/v1/people/${person.id}`;
    
    await fetch(url, {
      method: 'PUT',
      headers: getCopperHeaders(env),
      body: JSON.stringify({ phone_numbers: newNumbers })
    }).catch(e => console.error('Failed to update phone:', e));
  }
}

/**
 * Create a new opportunity in Copper CRM (Estate Planning pipeline)
 */
async function createCopperOpportunity(formData, personId, env) {
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

  // Representative Mapping from copper_users.json
  const representativeMapping = {
    "Caleb Taylor": 1206272,
    "Ian Curran": 1202942,
    "Chet Radish": 1202913,
    "Eli Sakov": 1213114,
    "James Garner": 1202796,
    "Sandro Magalhaes": 1219949,
    "Natalie Retes": 1206271
  };

  const assigneeId = formData.referredBy ? representativeMapping[formData.referredBy] : null;

  // Estate Planning Pipeline and Stage IDs
  const ESTATE_PLANNING_PIPELINE_ID = 1130648;
  const COMPLETED_QUIZ_STAGE_ID = 5076179;

  // Custom field IDs (created for Estate Planning opportunities)
  const FIELD_IDS = {
    phone: 722611,
    responderStatus: 722612,
    dswNumber: 722613,
    department: 722614,
    maritalStatus: 722615,
    dependants: 722616,
    realEstate: 722617,
    lifeInsurance: 722618,
    existingTrust: 722619,
    selectedPackage: 722620,
    referredBy: 723226 // Added referredBy field ID
  };

  // Build custom fields array with all form data
  const customFields = [
    { custom_field_definition_id: FIELD_IDS.phone, value: formData.phone || '' },
    { custom_field_definition_id: FIELD_IDS.responderStatus, value: formData.responderStatus || '' },
    { custom_field_definition_id: FIELD_IDS.dswNumber, value: formData.dswNumber || '' },
    { custom_field_definition_id: FIELD_IDS.department, value: formData.department || '' },
    { custom_field_definition_id: FIELD_IDS.maritalStatus, value: formData.maritalStatus || '' },
    { custom_field_definition_id: FIELD_IDS.dependants, value: formData.dependants || '' },
    { custom_field_definition_id: FIELD_IDS.realEstate, value: formData.realEstate || '' },
    { custom_field_definition_id: FIELD_IDS.lifeInsurance, value: formData.lifeInsurance || '' },
    { custom_field_definition_id: FIELD_IDS.existingTrust, value: formData.existingTrust || '' },
    { custom_field_definition_id: FIELD_IDS.selectedPackage, value: selectedPackage },
    { custom_field_definition_id: FIELD_IDS.referredBy, value: formData.referredBy || '' }
  ];

  // Build comprehensive details
  const details = [
    `Name: ${formData.firstName} ${formData.lastName}`,
    `Email: ${formData.email}`,
    `Phone: ${formData.phone}`,
    '',
    `Submitted via prepareheroes.org`,
    `Package: ${packageName}`,
    `Referred By: ${formData.referredBy || 'None'}`
  ].join('\n');

  // Prepare Copper API request for Opportunity
  const copperPayload = {
    name: opportunityName,
    pipeline_id: ESTATE_PLANNING_PIPELINE_ID,
    pipeline_stage_id: COMPLETED_QUIZ_STAGE_ID,
    primary_contact_id: personId, // Link the person
    details: details,
    custom_fields: customFields
  };

  if (assigneeId) {
    copperPayload.assignee_id = assigneeId;
  }

  // Make request to Copper API
  const response = await fetch(copperApiUrl, {
    method: 'POST',
    headers: getCopperHeaders(env),
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
