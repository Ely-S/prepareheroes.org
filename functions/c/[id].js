import { getOpportunityById, getOpportunityCheckoutData, getPersonById, isOpportunityPaid } from '../copper.api.ts';

export async function onRequest(context) {
  const { request, env, params } = context;
  const opportunityId = params?.id;

  if (!opportunityId) {
    return new Response('Not Found', { status: 404 });
  }

  const opportunity = await getOpportunityById(opportunityId, env);
  if (!opportunity) {
    return new Response('Not Found', { status: 404 });
  }

  if (isOpportunityPaid(opportunity)) {
    const successUrl = new URL('/success.html', request.url);
    successUrl.searchParams.set('applicationId', String(opportunityId));
    return Response.redirect(successUrl.toString(), 302);
  }

  const checkoutData = getOpportunityCheckoutData(opportunity);
  let email = checkoutData.email;

  if (!email && checkoutData.primaryContactId) {
    const person = await getPersonById(checkoutData.primaryContactId, env);
    email = person?.emails?.[0]?.email || '';
  }

  const checkoutUrl = new URL('/checkout.html', request.url);
  if (checkoutData.selectedPackage) {
    checkoutUrl.searchParams.set('chosenPackage', checkoutData.selectedPackage);
  }
  if (checkoutData.customerType) {
    checkoutUrl.searchParams.set('customerType', checkoutData.customerType);
  }
  if (email) {
    checkoutUrl.searchParams.set('email', email);
  }
  checkoutUrl.searchParams.set('opportunityId', String(opportunityId));

  return Response.redirect(checkoutUrl.toString(), 302);
}
