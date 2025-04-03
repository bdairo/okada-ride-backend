import express from 'express';
import { auth, authorize } from '../middleware/auth.js';
import stripe from '../config/stripe.js';
import { Ride } from '../models/Ride.js';
import { User } from '../models/User.js';
import winston from 'winston';

const router = express.Router();

// Create a Stripe Checkout Session
router.post('/create-checkout-session', auth, async (req, res) => {
    try {
        const { rideId } = req.body;
        
        if (!rideId) {
            return res.status(400).json({ error: 'Ride ID is required' });
        }
        
        // Get the ride details with populated patient information
        const ride = await Ride.findById(rideId)
            .populate('patient', 'firstName lastName email')
            .lean();
            
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        
        // Get patient information for prefilling
        const patientName = ride.patient ? `${ride.patient.firstName} ${ride.patient.lastName}` : '';
        const patientEmail = ride.patient ? ride.patient.email : '';
        
        // Create a Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            customer_email: patientEmail, // Prefill the customer's email
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: `Ride from ${ride.pickup.address} to ${ride.dropoff.address}`,
                            description: `Ride ID: ${ride._id}`,
                        },
                        unit_amount: Math.round(ride.fare.total * 100), // Convert to cents
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            // Redirect directly to the ride details page after successful payment
            success_url: `${process.env.FRONTEND_URL}/rides/${rideId}?payment_success=true`,
            cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
            metadata: {
                rideId: ride._id.toString(),
                userId: req.user._id.toString(),
                patientName: patientName,
            },
            payment_intent_data: {
                // Set a description that includes the patient name
                description: `Ride payment for ${patientName}`,
                // Set metadata on the payment intent as well
                metadata: {
                    rideId: ride._id.toString(),
                    patientName: patientName,
                },
            },
        });
        
        res.json({ id: session.id, url: session.url });
    } catch (error) {
        winston.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
});

// Webhook to handle Stripe events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    
    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        winston.error(`Webhook Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    
    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            // Update the ride payment status
            if (session.metadata.rideId) {
                try {
                    const ride = await Ride.findById(session.metadata.rideId);
                    if (ride) {
                        ride.paymentStatus = 'paid';
                        
                        // Create basic payment details
                        const paymentDetails = {
                            stripeSessionId: session.id,
                            paymentMethod: session.payment_method_types[0],
                            amountPaid: session.amount_total / 100, // Convert from cents
                            paidAt: new Date(),
                            patientName: session.metadata.patientName || '',
                        };
                        
                        // If there's a payment intent, retrieve it to get card details
                        if (session.payment_intent) {
                            try {
                                const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
                                if (paymentIntent && paymentIntent.charges && paymentIntent.charges.data.length > 0) {
                                    const charge = paymentIntent.charges.data[0];
                                    // Add card details if available
                                    if (charge.payment_method_details && charge.payment_method_details.card) {
                                        const card = charge.payment_method_details.card;
                                        paymentDetails.cardBrand = card.brand;
                                        paymentDetails.cardLast4 = card.last4;
                                        paymentDetails.cardExpMonth = card.exp_month;
                                        paymentDetails.cardExpYear = card.exp_year;
                                        paymentDetails.stripePaymentIntentId = session.payment_intent;
                                    }
                                }
                            } catch (error) {
                                winston.error(`Error retrieving payment intent details: ${error.message}`);
                            }
                        }
                        
                        ride.paymentDetails = paymentDetails;
                        await ride.save();
                        winston.info(`Payment completed for ride ${session.metadata.rideId}`);
                    }
                } catch (error) {
                    winston.error(`Error updating ride payment status: ${error.message}`);
                }
            }
            break;
        default:
            winston.info(`Unhandled event type ${event.type}`);
    }
    
    res.json({ received: true });
});

// Get payment status for a ride
router.get('/status/:rideId', auth, async (req, res) => {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) {
            return res.status(404).json({ error: 'Ride not found' });
        }
        
        // Check if the user is authorized to view this ride's payment status
        if (ride.patient.toString() !== req.user._id.toString() && 
            ride.driver?.toString() !== req.user._id.toString() && 
            !req.user.roles.includes('ADMIN')) {
            return res.status(403).json({ error: 'Not authorized to view this ride\'s payment status' });
        }
        
        res.json({
            paymentStatus: ride.paymentStatus || 'unpaid',
            paymentDetails: ride.paymentDetails || null,
        });
    } catch (error) {
        winston.error('Error fetching payment status:', error);
        res.status(500).json({ error: 'Failed to fetch payment status' });
    }
});

// Get ride details by Stripe session ID
router.get('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        if (!sessionId) {
            return res.status(400).json({ error: 'Session ID is required' });
        }
        
        // Find the ride with the given Stripe session ID
        const ride = await Ride.findOne({ 'paymentDetails.stripeSessionId': sessionId })
            .populate('patient', 'firstName lastName email phoneNumber')
            .populate('driver', 'firstName lastName phoneNumber')
            .populate('facility', 'facilityName firstName lastName phoneNumber')
            .lean();
        
        if (!ride) {
            // If no ride is found with the session ID, try to get the session from Stripe
            try {
                const session = await stripe.checkout.sessions.retrieve(sessionId);
                if (session && session.metadata && session.metadata.rideId) {
                    // If we found the session and it has a rideId in metadata, get the ride
                    const rideFromMetadata = await Ride.findById(session.metadata.rideId)
                        .populate('patient', 'firstName lastName email phoneNumber')
                        .populate('driver', 'firstName lastName phoneNumber')
                        .populate('facility', 'facilityName firstName lastName phoneNumber')
                        .lean();
                    
                    if (rideFromMetadata) {
                        return res.json(rideFromMetadata);
                    }
                }
            } catch (stripeError) {
                winston.error(`Error retrieving Stripe session: ${stripeError.message}`);
            }
            
            return res.status(404).json({ error: 'Ride not found for the given session ID' });
        }
        
        res.json(ride);
    } catch (error) {
        winston.error('Error fetching ride by session ID:', error);
        res.status(500).json({ error: 'Failed to fetch ride details' });
    }
});

// Get detailed payment information for a ride
router.get('/details/:rideId', auth, async (req, res) => {
    try {
        winston.info(`Fetching detailed payment info for ride: ${req.params.rideId}`);
        
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) {
            winston.error(`Ride not found: ${req.params.rideId}`);
            return res.status(404).json({ error: 'Ride not found' });
        }
        
        winston.info(`Ride found: ${JSON.stringify({
            id: ride._id,
            status: ride.status,
            paymentStatus: ride.paymentStatus,
            hasPaymentDetails: !!ride.paymentDetails,
            paymentIntentId: ride.paymentDetails?.stripePaymentIntentId
        })}`);
        
        // Check if the user is authorized to view this ride's payment details
        if (ride.patient.toString() !== req.user._id.toString() && 
            ride.driver?.toString() !== req.user._id.toString() && 
            !req.user.roles.includes('ADMIN')) {
            winston.error(`User ${req.user._id} not authorized to view payment details for ride ${ride._id}`);
            return res.status(403).json({ error: 'Not authorized to view this ride\'s payment details' });
        }
        
        // If the user is a driver, return limited payment information
        const isDriver = ride.driver?.toString() === req.user._id.toString() && 
                        !req.user.roles.includes('ADMIN');
        
        if (isDriver) {
            winston.info(`Driver requesting payment details, returning limited information`);
            return res.json({
                paymentStatus: ride.paymentStatus || 'unpaid',
                // Only return basic payment details for drivers
                paymentDetails: ride.paymentDetails ? {
                    paymentMethod: 'card',
                    amountPaid: ride.paymentDetails.amountPaid,
                    paidAt: ride.paymentDetails.paidAt
                } : null
            });
        }
        
        // If the ride is paid but doesn't have payment details, try to find the payment intent from Stripe Checkout sessions
        if (ride.paymentStatus === 'paid' && (!ride.paymentDetails || !ride.paymentDetails.stripePaymentIntentId)) {
            winston.info(`Ride is paid but missing payment details, attempting to find from Stripe`);
            
            try {
                // Try to find a checkout session for this ride
                const sessions = await stripe.checkout.sessions.list({
                    limit: 10,
                    expand: ['data.payment_intent'],
                });
                
                const rideSession = sessions.data.find(session => 
                    session.metadata && session.metadata.rideId === ride._id.toString()
                );
                
                if (rideSession && rideSession.payment_intent) {
                    winston.info(`Found Stripe session for ride: ${JSON.stringify({
                        sessionId: rideSession.id,
                        paymentIntentId: typeof rideSession.payment_intent === 'string' 
                            ? rideSession.payment_intent 
                            : rideSession.payment_intent.id
                    })}`);
                    
                    // Get the payment intent ID
                    const paymentIntentId = typeof rideSession.payment_intent === 'string' 
                        ? rideSession.payment_intent 
                        : rideSession.payment_intent.id;
                    
                    // Update the ride with the payment intent ID
                    if (!ride.paymentDetails) {
                        ride.paymentDetails = {
                            stripeSessionId: rideSession.id,
                            stripePaymentIntentId: paymentIntentId,
                            paymentMethod: 'card',
                            amountPaid: ride.fare.total,
                            paidAt: new Date()
                        };
                    } else {
                        ride.paymentDetails.stripePaymentIntentId = paymentIntentId;
                        if (!ride.paymentDetails.paymentMethod) {
                            ride.paymentDetails.paymentMethod = 'card';
                        }
                    }
                    
                    await ride.save();
                    winston.info(`Updated ride with payment intent ID: ${paymentIntentId}`);
                }
            } catch (stripeListError) {
                winston.error(`Error listing Stripe sessions: ${stripeListError.message}`);
            }
        }
        
        // If the ride still doesn't have payment details or a payment intent, return what we have
        if (!ride.paymentDetails || !ride.paymentDetails.stripePaymentIntentId) {
            winston.info(`No payment details or payment intent ID found, returning basic info`);
            return res.json({
                paymentStatus: ride.paymentStatus || 'unpaid',
                paymentDetails: ride.paymentDetails || null,
            });
        }
        
        // Get detailed payment information from Stripe
        try {
            winston.info(`Retrieving payment intent from Stripe: ${ride.paymentDetails.stripePaymentIntentId}`);
            const paymentIntent = await stripe.paymentIntents.retrieve(
                ride.paymentDetails.stripePaymentIntentId,
                { expand: ['payment_method', 'charges.data.payment_method'] }
            );
            
            winston.info(`Payment intent retrieved: ${JSON.stringify({
                id: paymentIntent.id,
                status: paymentIntent.status,
                hasCharges: !!paymentIntent.charges && paymentIntent.charges.data.length > 0
            })}`);
            
            // Extract card details from the payment intent
            let cardDetails = null;
            if (paymentIntent.charges && paymentIntent.charges.data.length > 0) {
                const charge = paymentIntent.charges.data[0];
                if (charge.payment_method_details && charge.payment_method_details.card) {
                    const card = charge.payment_method_details.card;
                    cardDetails = {
                        brand: card.brand,
                        last4: card.last4,
                        expMonth: card.exp_month,
                        expYear: card.exp_year,
                        country: card.country,
                        funding: card.funding,
                        network: card.network
                    };
                    winston.info(`Card details extracted: ${JSON.stringify(cardDetails)}`);
                }
            }
            
            // Update the ride with the latest card details if we found them
            if (cardDetails) {
                winston.info(`Updating ride with card details`);
                ride.paymentDetails.cardBrand = cardDetails.brand;
                ride.paymentDetails.cardLast4 = cardDetails.last4;
                ride.paymentDetails.cardExpMonth = cardDetails.expMonth;
                ride.paymentDetails.cardExpYear = cardDetails.expYear;
                ride.paymentDetails.paymentMethod = 'card'; // Ensure payment method is set
                await ride.save();
                winston.info(`Ride updated with card details`);
            }
            
            // Return the payment details with the Stripe data
            const response = {
                paymentStatus: ride.paymentStatus,
                paymentDetails: ride.paymentDetails,
                stripeDetails: {
                    paymentIntent: {
                        id: paymentIntent.id,
                        amount: paymentIntent.amount / 100,
                        status: paymentIntent.status,
                        created: paymentIntent.created,
                    },
                    cardDetails
                }
            };
            
            winston.info(`Returning detailed payment info response`);
            res.json(response);
        } catch (stripeError) {
            winston.error(`Error retrieving Stripe payment intent: ${stripeError.message}`);
            // If we can't get the Stripe data, just return what we have
            res.json({
                paymentStatus: ride.paymentStatus,
                paymentDetails: ride.paymentDetails,
                stripeError: stripeError.message
            });
        }
    } catch (error) {
        winston.error(`Error in detailed payment info endpoint: ${error.message}`);
        res.status(500).json({ error: 'Failed to fetch payment details' });
    }
});

export default router; 