import { APIError } from 'payload/errors';

const logs = false;

export const subscriptionCreatedOrUpdated = async (args) => {
  const {
    event,
    payload,
  } = args;

  const customerStripeID = event.data.object.customer;

  if (logs) payload.logger.info(`🪝 A new subscription was created or updated in Stripe on customer ID: ${customerStripeID}, syncing to Payload...`);

  const {
    id: eventID,
    plan,
    status: subscriptionStatus
  } = event.data.object;

  let payloadProductID;

  // First lookup the product in Payload
  try {
    if (logs) payload.logger.info(`- Looking up existing Payload product with Stripe ID: ${plan.product}...`);

    const productQuery = await payload.find({
      collection: 'products',
      depth: 0,
      where: {
        stripeProductID: {
          equals: plan.product
        }
      }
    });

    payloadProductID = productQuery.docs?.[0]?.id;

    if (payloadProductID) {
      if (logs) payload.logger.info(`- Found existing product with Stripe ID: ${plan.product}. Creating relationship...`);
    }

  } catch (error: any) {
    payload.logger.error(`Error finding product ${error?.message}`);
  }

  // Now look up the customer in Payload
  try {
    if (logs) payload.logger.info(`- Looking up existing Payload customer with Stripe ID: ${customerStripeID}.`);

    const usersReq: any = await payload.find({
      collection: 'users',
      depth: 0,
      where: {
        stripeID: customerStripeID
      }
    })

    const foundUser = usersReq.docs[0];

    if (foundUser) {
      if (logs) payload.logger.info(`- Found existing customer, now updating.`);

      const subscriptions = foundUser.subscriptions || [];
      const indexOfSubscription = subscriptions.findIndex(({ stripeSubscriptionID }) => stripeSubscriptionID === eventID);

      if (indexOfSubscription > -1) {
        // update existing subscription
        if (logs) payload.logger.info(`- This subscription exists, now updating.`);

        subscriptions[indexOfSubscription] = {
          stripeProductID: plan.product,
          product: payloadProductID,
          status: subscriptionStatus,
        };
      } else {
        if (logs) payload.logger.info(`- This is a new subscription, now adding.`);

        // create new subscription
        subscriptions.push({
          stripeSubscriptionID: eventID,
          stripeProductID: plan.product,
          product: payloadProductID,
          status: subscriptionStatus
        })
      }

      try {
        await payload.update({
          collection: 'users',
          id: foundUser.id,
          data: {
            subscriptions,
            skipSync: true
          }
        })

        if (logs) payload.logger.info(`✅ Successfully updated subscription.`);
      } catch (error) {
        payload.logger.error(`- Error updating subscription: ${error}`);
      }
    } else {
      if (logs) payload.logger.info(`- No existing user found, cannot update subscription.`);
    }
  } catch (error) {
    new APIError(`Error looking up user with Stripe ID: '${customerStripeID}': ${error?.message}`);
  }
};
