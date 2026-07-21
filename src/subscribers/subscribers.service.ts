import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SubscriberEntity } from "@src/database/entities";
import { CreateSubscriberDto, UpdateSubscriberDto } from "./dto/subscriber.dto";

@Injectable()
export class SubscribersService {
  constructor(
    @InjectRepository(SubscriberEntity)
    private readonly repo: Repository<SubscriberEntity>,
  ) {}

  async create(dto: CreateSubscriberDto): Promise<SubscriberEntity> {
    const existing = await this.repo.findOne({
      where: { service: dto.service, url: dto.url },
    });

    if (existing) {
      existing.patterns = [...new Set([...existing.patterns, ...dto.patterns])];
      existing.active = dto.active ?? true;
      return this.repo.save(existing);
    }

    const sub = this.repo.create({
      service: dto.service,
      url: dto.url,
      patterns: dto.patterns,
      active: dto.active ?? true,
    });
    return this.repo.save(sub);
  }

  async update(id: number, dto: UpdateSubscriberDto): Promise<SubscriberEntity> {
    const sub = await this.repo.findOne({ where: { id } });
    if (!sub) throw new NotFoundException(`Subscriber ${id} not found`);

    if (dto.url !== undefined) sub.url = dto.url;
    if (dto.patterns !== undefined) sub.patterns = dto.patterns;
    if (dto.active !== undefined) sub.active = dto.active;

    return this.repo.save(sub);
  }

  async remove(id: number): Promise<{ id: number; deleted: boolean }> {
    const result = await this.repo.delete(id);
    if (!result.affected) throw new NotFoundException(`Subscriber ${id} not found`);
    return { id, deleted: true };
  }

  async findAll(): Promise<{ total: number; data: SubscriberEntity[] }> {
    const [data, total] = await this.repo.findAndCount({
      order: { createdAt: "ASC" },
    });
    return { total, data };
  }

  async findOne(id: number): Promise<SubscriberEntity | null> {
    return this.repo.findOne({ where: { id } });
  }
}
