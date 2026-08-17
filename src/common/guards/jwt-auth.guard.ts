import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Requires a valid `Authorization: Bearer <token>` header.
 * Apply with `@UseGuards(JwtAuthGuard)` on any controller or route that needs login.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
