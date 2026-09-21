import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiForbiddenResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiPaginatedResponse, PaginatedDto } from '../../common/dto/paginated.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { AuditLog } from './entities/audit-log.entity';

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner')
@ApiForbiddenResponse({ description: 'Owner only.' })
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Who changed what, newest first' })
  @ApiPaginatedResponse(AuditLog, 'Audit entries.')
  findAll(@Query() query: AuditQueryDto): Promise<PaginatedDto<AuditLog>> {
    return this.auditService.findAll(query);
  }
}
