import {
  BadRequestException,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ImportResultDto } from './dto/import-result.dto';
import { ImportService } from './import.service';

/** 25 MB — the real medicine.csv is ~3.7 MB, so this leaves generous headroom. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Browsers and Excel label CSVs inconsistently, so accept the known variants. */
const ACCEPTED_MIME_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
]);

@ApiTags('import')
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('csv')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'medicine.csv' },
      },
    },
  })
  @ApiOperation({
    summary: 'Import the medicine catalogue from a CSV upload',
    description:
      'Admin only. Idempotent — variants are matched on the CSV `brand id`, and ' +
      're-importing refreshes descriptive fields while leaving any price and stock ' +
      'the admin has already entered untouched. Prices in the source file are ignored. ' +
      'Loading the full ~21.7k-row file takes a while; prefer `npm run import:csv` for ' +
      'the initial load to avoid an HTTP timeout.',
  })
  @ApiOkResponse({ description: 'Import completed.', type: ImportResultDto })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid token.' })
  async importCsv(
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ImportResultDto> {
    if (!file) {
      throw new BadRequestException('A CSV file must be uploaded as "file".');
    }
    if (file.size === 0) {
      throw new BadRequestException('The uploaded file is empty.');
    }
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported content type "${file.mimetype}". Upload a CSV file.`,
      );
    }

    try {
      return await this.importService.importFromCsv(file.buffer);
    } catch (error) {
      // A malformed CSV surfaces as a parser error; report it as a bad request
      // rather than a 500, since the client sent the bad input.
      if (error instanceof Error && error.name.startsWith('CsvError')) {
        throw new BadRequestException(`Could not parse CSV: ${error.message}`);
      }
      throw error;
    }
  }
}
