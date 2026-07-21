import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { SubscribersService } from "./subscribers.service";
import { CreateSubscriberDto, UpdateSubscriberDto } from "./dto/subscriber.dto";
import { InternalAuthGuard } from "@src/auth/internal-auth.guard";

@Controller()
export class SubscribersController {
  constructor(private readonly service: SubscribersService) {}

  @Post("subscribe")
  @UseGuards(InternalAuthGuard)
  async create(@Body() dto: CreateSubscriberDto) {
    return this.service.create(dto);
  }

  @Patch("subscribe/:id")
  @UseGuards(InternalAuthGuard)
  async update(@Param("id") id: string, @Body() dto: UpdateSubscriberDto) {
    return this.service.update(Number(id), dto);
  }

  @Delete("subscribe/:id")
  @UseGuards(InternalAuthGuard)
  async remove(@Param("id") id: string) {
    return this.service.remove(Number(id));
  }

  @Get("subscribers")
  @UseGuards(InternalAuthGuard)
  async findAll() {
    return this.service.findAll();
  }
}
