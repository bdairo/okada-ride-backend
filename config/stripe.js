import dotenv from 'dotenv';
import Stripe from 'stripe';

dotenv.config();

// Initialize Stripe with the secret key from environment variables
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default stripe; 