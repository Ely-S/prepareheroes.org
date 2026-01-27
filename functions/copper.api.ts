
/**
 * Copper API Client
 */

const COPPER_API_URL = 'https://api.copper.com/developer_api/v1';
const ESTATE_PLANNING_PIPELINE_ID = 1130648;
const PAID_STAGE_ID = 5076181;
const COMPLETED_QUIZ_STAGE_ID = 5076179;
export const FIELD_IDS = {
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
  referredBy: 723226,
  paymentLink: 727706
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function upsertDetailsLines(details: string, updates: Record<string, string | undefined>) {
  let output = details || '';
  Object.entries(updates).forEach(([label, value]) => {
    if (value === undefined) return;
    const line = `${label}: ${value}`;
    const regex = new RegExp(`^${escapeRegExp(label)}:.*$`, 'm');
    if (regex.test(output)) {
      output = output.replace(regex, line);
    } else {
      output = output ? `${output}\n${line}` : line;
    }
  });
  return output;
}

/**
 * Helper to get Copper API Headers
 */
export function getCopperHeaders(env) {
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
export async function findPersonByEmail(email, env) {
  const url = `${COPPER_API_URL}/people/search`;
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
 * Find a person by phone
 */
export async function findPersonByPhone(phone, env) {
  const url = `${COPPER_API_URL}/people/search`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getCopperHeaders(env),
    body: JSON.stringify({
      phone_number: phone, // Fuzzy match by default for 7+ digits
      page_size: 1
    })
  });

  if (!response.ok) {
    console.error('Error searching person by phone:', await response.text());
    return null;
  }
  
  const data = await response.json();
  return data.length > 0 ? data[0] : null;
}

/**
 * Create a new person
 */
export async function createPerson(formData, env) {
  const url = `${COPPER_API_URL}/people`;
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
export async function updatePersonPhone(person, phone, env) {
  const currentNumbers = person.phone_numbers || [];
  // Check if phone already exists (simple check)
  const exists = currentNumbers.some(p => p.number.replace(/\D/g, '') === phone.replace(/\D/g, ''));
  
  if (!exists) {
    const newNumbers = [...currentNumbers, { number: phone, category: 'mobile' }];
    const url = `${COPPER_API_URL}/people/${person.id}`;
    
    await fetch(url, {
      method: 'PUT',
      headers: getCopperHeaders(env),
      body: JSON.stringify({ phone_numbers: newNumbers })
    }).catch(e => console.error('Failed to update phone:', e));
  }
}

/**
 * Find Open Opportunity for Person
 */
export async function findOpenOpportunityForPerson(personId, env) {
  // Search for OPEN opportunities in the specific pipeline for this contact
  const url = `${COPPER_API_URL}/opportunities/search`;
  const response = await fetch(url, {
    method: 'POST',
    headers: getCopperHeaders(env),
    body: JSON.stringify({
      primary_contact_ids: [personId],
      pipeline_ids: [ESTATE_PLANNING_PIPELINE_ID],
      status: ['Open'],
      page_size: 5 // Fetch a few to check ambiguity
    })
  });
  
  if (!response.ok) return null;
  const data = await response.json();

  if (data.length === 0) return null;
  
  if (data.length > 1) {
    console.log(`[Copper API] Multiple open opportunities found for person ${personId}. Using the first one.`);
  }
  
  return data[0].id;
}

/**
 * Update checkout link/state in the opportunity details and custom field
 */
export async function upsertCheckoutDetails(opportunityId, env, { checkoutLink, checkoutState }: { checkoutLink?: string; checkoutState?: string }) {
  const url = `${COPPER_API_URL}/opportunities/${opportunityId}`;
  let existingDetails = '';
  let existingCustomFields: { custom_field_definition_id: number; value: any }[] = [];

  try {
    const existingResponse = await fetch(url, {
      method: 'GET',
      headers: getCopperHeaders(env)
    });
    if (existingResponse.ok) {
      const existing = await existingResponse.json();
      existingDetails = existing?.details || '';
      existingCustomFields = Array.isArray(existing?.custom_fields) ? existing.custom_fields : [];
    }
  } catch (error) {
    console.warn(`[Copper API] Failed to fetch existing opportunity ${opportunityId}:`, error);
  }

  const updatedDetails = upsertDetailsLines(existingDetails, {
    'Checkout Link': checkoutLink,
    'Checkout State': checkoutState
  });

  const payload: { details: string; custom_fields?: { custom_field_definition_id: number; value: any }[] } = {
    details: updatedDetails
  };

  if (checkoutLink) {
    const normalizedFields = existingCustomFields.map((field) => ({
      custom_field_definition_id: field.custom_field_definition_id,
      value: field.value
    }));
    const filteredFields = normalizedFields.filter(
      (field) => String(field.custom_field_definition_id) !== String(FIELD_IDS.paymentLink)
    );
    payload.custom_fields = [
      ...filteredFields,
      {
        custom_field_definition_id: FIELD_IDS.paymentLink,
        value: checkoutLink
      }
    ];
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: getCopperHeaders(env),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const txt = await response.text();
    console.error(`[Copper API] Failed to update checkout details ${opportunityId}: ${txt}`);
    throw new Error(`Copper update failed: ${response.status}`);
  }

  if (checkoutLink) {
    const paymentLinkResponse = await fetch(url, {
      method: 'PUT',
      headers: getCopperHeaders(env),
      body: JSON.stringify({
        custom_fields: [
          {
            custom_field_definition_id: FIELD_IDS.paymentLink,
            value: checkoutLink
          }
        ]
      })
    });

    if (!paymentLinkResponse.ok) {
      const txt = await paymentLinkResponse.text();
      console.error(`[Copper API] Failed to update payment link ${opportunityId}: ${txt}`);
      throw new Error(`Copper update failed: ${paymentLinkResponse.status}`);
    }
  }

  return await response.json();
}

/**
 * Mark Opportunity as Paid
 */
export async function markOpportunityPaid(opportunityId, env, paymentInfo = {}) {
  const url = `${COPPER_API_URL}/opportunities/${opportunityId}`;
  const {
    invoiceId,
    invoiceUrl,
    sessionId,
    paymentIntentId
  } = paymentInfo as {
    invoiceId?: string;
    invoiceUrl?: string;
    sessionId?: string;
    paymentIntentId?: string;
  };

  let existingDetails = '';
  try {
    const existingResponse = await fetch(url, {
      method: 'GET',
      headers: getCopperHeaders(env)
    });
    if (existingResponse.ok) {
      const existing = await existingResponse.json();
      existingDetails = existing?.details || '';
    }
  } catch (error) {
    console.warn(`[Copper API] Failed to fetch existing opportunity ${opportunityId}:`, error);
  }

  const paymentLines: string[] = [];
  if (invoiceId) paymentLines.push(`Stripe Invoice ID: ${invoiceId}`);
  if (invoiceUrl) paymentLines.push(`Stripe Invoice URL: ${invoiceUrl}`);
  if (sessionId) paymentLines.push(`Stripe Session ID: ${sessionId}`);
  if (paymentIntentId) paymentLines.push(`Stripe Payment Intent: ${paymentIntentId}`);

  const newPaymentLines = paymentLines.filter(line => !existingDetails.includes(line));
  let updatedDetails = existingDetails;
  if (newPaymentLines.length) {
    const paymentBlock = ['Stripe Payment', ...newPaymentLines].join('\n');
    updatedDetails = existingDetails
      ? `${existingDetails}\n\n${paymentBlock}`
      : paymentBlock;
  }
  updatedDetails = upsertDetailsLines(updatedDetails, {
    'Checkout State': 'Paid'
  });

  const payload: { pipeline_stage_id: number; details?: string } = {
    pipeline_stage_id: PAID_STAGE_ID
  };
  if (updatedDetails && updatedDetails !== existingDetails) {
    payload.details = updatedDetails;
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: getCopperHeaders(env),
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    const txt = await response.text();
    console.error(`[Copper API] Failed to update opportunity ${opportunityId}: ${txt}`);
    throw new Error(`Copper update failed: ${response.status}`);
  }
  
  console.log(`[Copper API] Successfully updated opportunity ${opportunityId} to Paid stage`);
  return await response.json();
}

/**
 * Create a new opportunity in Copper CRM (Estate Planning pipeline)
 */
export async function createCopperOpportunity(formData, personId, env) {
  const copperApiUrl = `${COPPER_API_URL}/opportunities`;

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
  const copperPayload: {
    name: string;
    pipeline_id: number;
    pipeline_stage_id: number;
    primary_contact_id: number;
    details: string;
    custom_fields: { custom_field_definition_id: number; value: any }[];
    assignee_id?: number;
  } = {
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
