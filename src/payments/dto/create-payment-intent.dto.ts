import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsUUID()
  bookingId: string;

  @IsUUID()
  userId: string;

  @IsOptional()
  @IsString()
  @Length(8, 128)
  idempotencyKey?: string;
}
