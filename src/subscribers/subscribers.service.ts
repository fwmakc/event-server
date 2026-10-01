import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  generateWebhookSecret,
  validateWebhookEgress,
  WebhookEgressMode,
} from "api-server-toolkit/helper";
import { SubscriberEntity } from "@src/database/entities";
import { CreateSubscriberDto, UpdateSubscriberDto } from "./dto/subscriber.dto";

/** Response shape that never carries the secret (except create/rotate). */
type SubscriberPublic = Omit<SubscriberEntity, "secret"> & { hasSecret: boolean };

const stripSecret = (sub: SubscriberEntity): SubscriberPublic => {
  const { secret, ...rest } = sub;
  void secret;
  return { ...rest, hasSecret: !!secret };
};

/** Create/rotate response: the secret appears only when it exists. */
const withSecretOnce = (
  sub: SubscriberEntity,
): SubscriberPublic | (SubscriberPublic & { secret: string }) =>
  sub.secret ? { ...stripSecret(sub), secret: sub.secret } : stripSecret(sub);

@Injectable()
export class SubscribersService {
  private readonly egressMode: WebhookEgressMode;
  private readonly egressAllowlist: string[];

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(SubscriberEntity)
    private readonly repo: Repository<SubscriberEntity>,
  ) {
    this.egressMode = (config.get<string>("WEBHOOK_EGRESS_MODE", "internal") || "internal") as WebhookEgressMode;
    this.egressAllowlist = (config.get<string>("WEBHOOK_ALLOW_HOSTS", "") || "")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
  }

  private validateUrl(url: string): void {
    const check = validateWebhookEgress(url, this.egressMode, this.egressAllowlist);
    if (!check.ok) {
      throw new BadRequestException(
        `Subscriber URL rejected by egress policy (${this.egressMode}): ${check.reason}`,
      );
    }
  }

  async create(dto: CreateSubscriberDto): Promise<SubscriberPublic & { secret?: string }> {
    this.validateUrl(dto.url);
    const existing = await this.repo.findOne({
      where: { service: dto.service, url: dto.url },
    });

    if (existing) {
      existing.patterns = [...new Set([...existing.patterns, ...dto.patterns])];
      existing.active = dto.active ?? true;
      if (dto.secret) existing.secret = dto.secret;
      const saved = await this.repo.save(existing);
      return withSecretOnce(saved);
    }

    const sub = this.repo.create({
      service: dto.service,
      url: dto.url,
      patterns: dto.patterns,
      // Secret only when the caller knows it (or explicitly asks for a
      // generated one it will store from the response). A subscriber
      // without a secret keeps the shared internal-key transport — auto-
      // generating one would silently break a registrant that never saw it.
      secret: dto.secret ?? (dto.generateSecret ? generateWebhookSecret() : null),
      active: dto.active ?? true,
    });
    const saved = await this.repo.save(sub);
    return withSecretOnce(saved);
  }

  async update(id: number, dto: UpdateSubscriberDto): Promise<SubscriberPublic> {
    const sub = await this.repo.findOne({ where: { id } });
    if (!sub) throw new NotFoundException(`Subscriber ${id} not found`);

    if (dto.url !== undefined) {
      this.validateUrl(dto.url);
      sub.url = dto.url;
    }
    if (dto.patterns !== undefined) sub.patterns = dto.patterns;
    if (dto.secret !== undefined) sub.secret = dto.secret;
    if (dto.active !== undefined) sub.active = dto.active;

    return stripSecret(await this.repo.save(sub));
  }

  /** Generate a fresh secret, return it exactly once. */
  async rotateSecret(id: number): Promise<{ id: number; secret: string }> {
    const sub = await this.repo.findOne({ where: { id } });
    if (!sub) throw new NotFoundException(`Subscriber ${id} not found`);
    const secret = generateWebhookSecret();
    await this.repo.update(id, { secret });
    return { id, secret };
  }

  async remove(id: number): Promise<{ id: number; deleted: boolean }> {
    const result = await this.repo.delete(id);
    if (!result.affected) throw new NotFoundException(`Subscriber ${id} not found`);
    return { id, deleted: true };
  }

  async findAll(): Promise<{ total: number; data: SubscriberPublic[] }> {
    const [data, total] = await this.repo.findAndCount({
      order: { createdAt: "ASC" },
    });
    return { total, data: data.map(stripSecret) };
  }

  async findOne(id: number): Promise<SubscriberEntity | null> {
    return this.repo.findOne({ where: { id } });
  }
}
