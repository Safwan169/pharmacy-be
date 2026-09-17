export const ROLES = ['owner', 'cashier'] as const;
export type Role = (typeof ROLES)[number];
