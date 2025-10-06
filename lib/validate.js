const { z } = require('zod');

/*
 * Zod validation schemas for incoming request payloads.
 *
 * Validation is performed on the server to ensure that the API
 * contract is upheld regardless of any client-side checks. Each
 * schema returns a parsed value or throws a ZodError which is
 * propagated to the caller.
 */

// Customer object schema. All fields are required strings.
const customerSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  email: z.string().email({ message: 'Invalid email address' }),
  phone: z.string().min(1, { message: 'Phone is required' }),
  address: z.string().min(1, { message: 'Address is required' }),
  zip: z.string().min(1, { message: 'Zip code is required' }),
  city: z.string().min(1, { message: 'City is required' }),
});

// Schema for creating an order
const orderSchema = z.object({
  service: z.enum(['broeyting', 'trefelling', 'plenklipping', 'diverse']),
  customer: customerSchema,
  details: z.string().optional().default(''),
  consent: z.literal(true),
  sourcePage: z.string().optional().default(''),
  priceEstimate: z
    .number()
    .nullable()
    .optional(),
});

// Schema for admin login
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

module.exports = {
  orderSchema,
  loginSchema,
};