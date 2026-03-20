import { FIELD_IDS, getCopperHeaders } from '../copper.api.ts';

const COPPER_API_URL = 'https://api.copper.com/developer_api/v1';

function getCustomFieldValue(customFields, fieldId) {
  if (!Array.isArray(customFields)) return undefined;
  const match = customFields.find(
    (field) => String(field.custom_field_definition_id) === String(fieldId)
  );
  return match?.value;
}

async function fetchOpportunity(opportunityId, env) {
  const response = await fetch(`${COPPER_API_URL}/opportunities/${opportunityId}`, {
    method: 'GET',
    headers: getCopperHeaders(env)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch opportunity ${opportunityId}: ${errorText}`);
  }

  return await response.json();
}

async function fetchPersonEmail(personId, env) {
  if (!personId) return '';
  const response = await fetch(`${COPPER_API_URL}/people/${personId}`, {
    method: 'GET',
    headers: getCopperHeaders(env)
  });
  if (!response.ok) return '';
  const person = await response.json();
  const emails = Array.isArray(person?.emails) ? person.emails : [];
  return emails[0]?.email || '';
}

function buildCheckoutUrl(requestUrl, { selectedPackage, customerType, email, opportunityId }) {
  const target = new URL('/checkout.html', requestUrl);

  if (selectedPackage) target.searchParams.set('chosenPackage', selectedPackage);
  if (customerType) target.searchParams.set('customerType', customerType);
  if (email) target.searchParams.set('email', email);
  if (opportunityId) target.searchParams.set('opportunityId', opportunityId);

  return target;
}

export async function onRequest(context) {
  const { request, env, params } = context;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const opportunityId = params?.opportunityId;
  if (!opportunityId) {
    return new Response('Missing opportunity id', { status: 400 });
  }

  try {
    const opportunity = await fetchOpportunity(opportunityId, env);
    const selectedPackage =
      getCustomFieldValue(opportunity.custom_fields, FIELD_IDS.selectedPackage) || 'will';
    const responderStatus = getCustomFieldValue(
      opportunity.custom_fields,
      FIELD_IDS.responderStatus
    );
    const customerType = responderStatus === 'civilian' ? 'civilian' : 'responder';
    const email = await fetchPersonEmail(opportunity.primary_contact_id, env);

    const redirectUrl = buildCheckoutUrl(request.url, {
      selectedPackage,
      customerType,
      email,
      opportunityId
    });

    return Response.redirect(redirectUrl.toString(), 302);
  } catch (error) {
    console.error('[Checkout Redirect] Failed to resolve checkout link', error);
    const fallbackUrl = buildCheckoutUrl(request.url, {
      selectedPackage: 'will',
      customerType: 'responder',
      opportunityId
    });
    return Response.redirect(fallbackUrl.toString(), 302);
  }
}
