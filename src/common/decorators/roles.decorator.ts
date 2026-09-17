import { SetMetadata } from '@nestjs/common';
import type { Role } from '../roles';

export const ROLES_KEY = 'roles';

/** Restricts a route to the given roles. Pair with JwtAuthGuard + RolesGuard. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
