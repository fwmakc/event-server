import { Controller, Get } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiExtraModels } from "@nestjs/swagger";
import { EventContracts } from "./index";
import { UserRegisteredDto } from "./dto/user-registered.dto";
import { UserConfirmedDto } from "./dto/user-confirmed.dto";
import { PasswordResetDto } from "./dto/password-reset.dto";
import { UserDeactivatedDto } from "./dto/user-deactivated.dto";
import { UserDeletedDto } from "./dto/user-deleted.dto";
import { WebhookEnvelopeDto } from "./dto/webhook-envelope.dto";

@ApiTags("Event Contracts")
@Controller("events")
export class ContractsController {
  @Get("catalog")
  @ApiOperation({ summary: "Реестр всех контрактов событий" })
  @ApiExtraModels(
    UserRegisteredDto,
    UserConfirmedDto,
    PasswordResetDto,
    UserDeactivatedDto,
    UserDeletedDto,
    WebhookEnvelopeDto,
  )
  getCatalog() {
    return Object.entries(EventContracts).map(([pattern, dto]) => ({
      pattern,
      schema: dto.name,
    }));
  }
}
