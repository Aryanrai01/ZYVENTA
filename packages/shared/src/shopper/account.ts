import { z } from 'zod';
import { ADDRESS_LABELS, type AddressLabel } from '../constants/statuses.js';
import { INDIAN_STATE_CODES, type IndianStateCode } from '../constants/india.js';
import type { AuthUser } from '../auth/schemas.js';
import { indianMobileSchema, objectIdSchema, pincodeSchema } from '../validation/fields.js';

export const MAX_ADDRESSES = 20;

export const addressInputSchema = z
  .object({
    label: z.enum(ADDRESS_LABELS).default('HOME'),
    fullName: z.string().trim().min(2, 'Enter the full name').max(80),
    phone: indianMobileSchema,
    line1: z.string().trim().min(3, 'Enter the house number and street').max(120),
    line2: z.string().trim().max(120).default(''),
    landmark: z.string().trim().max(80).default(''),
    city: z.string().trim().min(2, 'Enter the city').max(60),
    state: z.enum(INDIAN_STATE_CODES, { error: 'Choose a state' }),
    pincode: pincodeSchema,
    isDefault: z.boolean().default(false),
  })
  .strict();
export type AddressInput = z.infer<typeof addressInputSchema>;
export type AddressFormValues = z.input<typeof addressInputSchema>;

export const addressUpdateSchema = addressInputSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>;

export const addressIdParamSchema = z.object({ id: objectIdSchema }).strict();

export interface AddressView {
  id: string;
  label: AddressLabel;
  fullName: string;
  phone: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: IndianStateCode;
  pincode: string;
  country: 'IN';
  isDefault: boolean;
}

export const notificationPreferencesSchema = z
  .object({
    orderUpdates: z.boolean(),
    stockAlerts: z.boolean(),
    promotions: z.boolean(),
    /** Security alerts (new sign-ins, password changes) cannot be turned off. */
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

export interface NotificationPreferences {
  orderUpdates: boolean;
  stockAlerts: boolean;
  promotions: boolean;
  securityAlerts: boolean;
}

/** Full profile form (web); the API accepts any non-empty subset. */
export const profileFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Use at least 2 characters').max(80),
    /** Empty string removes the number. */
    phone: z.union([indianMobileSchema, z.literal('')]),
  })
  .strict();
export type ProfileFormValues = z.infer<typeof profileFormSchema>;

export const profileUpdateSchema = profileFormSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export interface ProfileView extends AuthUser {
  notificationPreferences: NotificationPreferences;
}
