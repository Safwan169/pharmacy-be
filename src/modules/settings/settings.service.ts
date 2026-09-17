import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Setting } from './entities/setting.entity';

export const SETTING_KEYS = [
  'shop_name',
  'shop_address',
  'shop_phone',
  'drug_license_no',
  'receipt_footer',
  'low_stock_threshold',
  'receipt_width_mm',
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export type ShopSettings = Record<SettingKey, string>;

const DEFAULTS: ShopSettings = {
  shop_name: 'Pharmacy',
  shop_address: '',
  shop_phone: '',
  drug_license_no: '',
  receipt_footer: '',
  low_stock_threshold: '',
  receipt_width_mm: '80',
};

/**
 * Shop identity and knobs. Read on every receipt, so the whole table is
 * cached in memory and refreshed on write — it's seven rows.
 */
@Injectable()
export class SettingsService {
  private cache: ShopSettings | null = null;

  constructor(
    @InjectRepository(Setting)
    private readonly settingsRepository: Repository<Setting>,
    private readonly configService: ConfigService,
  ) {}

  async getAll(): Promise<ShopSettings> {
    if (this.cache) return this.cache;
    const rows = await this.settingsRepository.find();
    const merged: ShopSettings = { ...DEFAULTS };
    for (const row of rows) {
      if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
        merged[row.key as SettingKey] = row.value;
      }
    }
    this.cache = merged;
    return merged;
  }

  async update(patch: Partial<ShopSettings>): Promise<ShopSettings> {
    for (const key of SETTING_KEYS) {
      const value = patch[key];
      if (value === undefined) continue;
      await this.settingsRepository.save(
        this.settingsRepository.create({ key, value: value.trim() }),
      );
    }
    this.cache = null;
    return this.getAll();
  }

  /** The stock level that counts as "low": the setting, else the env default. */
  async lowStockThreshold(): Promise<number> {
    const raw = (await this.getAll()).low_stock_threshold;
    const parsed = Number(raw);
    if (raw !== '' && Number.isInteger(parsed) && parsed >= 1) return parsed;
    return this.configService.getOrThrow<number>('lowStockThreshold');
  }

  async receiptWidthMm(): Promise<58 | 80> {
    return (await this.getAll()).receipt_width_mm === '58' ? 58 : 80;
  }
}
