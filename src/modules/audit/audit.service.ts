import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PaginatedDto, paginate } from '../../common/dto/paginated.dto';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditEntry {
  userId: number | null;
  action: string;
  entityType: string;
  entityId?: number | null;
  summary: string;
  details?: Record<string, unknown> | null;
}

export interface AuditQuery {
  entity_type?: string;
  entity_id?: number;
  page: number;
  limit: number;
  skip: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly repository: Repository<AuditLog>,
  ) {}

  /** Pass the transaction's manager so the entry is rolled back with the change. */
  async record(entry: AuditEntry, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(AuditLog) : this.repository;
    await repo.save(
      repo.create({
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        summary: entry.summary.slice(0, 255),
        details: entry.details ?? null,
      }),
    );
  }

  async findAll(query: AuditQuery): Promise<PaginatedDto<AuditLog>> {
    const qb = this.repository
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.user', 'user')
      .orderBy('entry.createdAt', 'DESC')
      .addOrderBy('entry.id', 'DESC')
      .skip(query.skip)
      .take(query.limit);
    if (query.entity_type) qb.andWhere('entry.entityType = :type', { type: query.entity_type });
    if (query.entity_id !== undefined) qb.andWhere('entry.entityId = :id', { id: query.entity_id });
    const [data, total] = await qb.getManyAndCount();
    for (const row of data) {
      // Only the identity, never the hash.
      if (row.user) row.user = { id: row.user.id, email: row.user.email, name: row.user.name } as never;
    }
    return paginate(data, total, query.page, query.limit);
  }
}
