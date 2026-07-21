import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import { EventsService } from "./events.service";
import { PublishEventDto } from "./dto/publish-event.dto";
import { InternalAuthGuard } from "@src/auth/internal-auth.guard";

@Controller()
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post("events")
  @UseGuards(InternalAuthGuard)
  @HttpCode(HttpStatus.OK)
  async publish(@Body() dto: PublishEventDto) {
    const result = await this.eventsService.publish(dto);
    if (result.status === "pending") {
      return { ...result, statusCode: HttpStatus.ACCEPTED };
    }
    return result;
  }

  @Get("events")
  @UseGuards(InternalAuthGuard)
  async findAll(
    @Query("pattern") pattern?: string,
    @Query("status") status?: string,
    @Query("source") source?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.eventsService.findMany({
      pattern,
      status,
      source,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("events/:id")
  @UseGuards(InternalAuthGuard)
  async findOne(@Param("id") id: string) {
    const event = await this.eventsService.findOneWithDeliveries(Number(id));
    if (!event) {
      throw new NotFoundException(`Event ${id} not found`);
    }
    return event;
  }
}
