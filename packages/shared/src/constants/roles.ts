/**
 * Platform roles. A user holds an array of roles so a seller can also shop as a customer.
 * ADMIN accounts are only ever created through the API's `create-admin` CLI script.
 */
export const ROLES = ['USER', 'SELLER', 'ADMIN'] as const;

export type Role = (typeof ROLES)[number];

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;

export type UserStatus = (typeof USER_STATUSES)[number];
