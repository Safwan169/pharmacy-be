import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { Role } from '../roles';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Checks `request.user.role` against the route's `@Roles()`. Must run after
 * JwtAuthGuard, which is what puts the user on the request. A route with no
 * `@Roles()` is open to every signed-in role.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const { user } = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    if (!user || !required.includes(user.role as Role)) {
      throw new ForbiddenException({
        message: 'Only the owner can do this.',
        reason: 'forbidden_role',
      });
    }
    return true;
  }
}
