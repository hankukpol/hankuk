import { z } from "zod";

export const studyRoomSchema = z.object({
  name: z.string().trim().min(1, "자습실 이름을 입력해 주세요."),
  columns: z
    .number()
    .int("열 수는 정수여야 합니다.")
    .min(3, "열 수는 3 이상이어야 합니다.")
    .max(20, "열 수는 20 이하로 설정해 주세요."),
  rows: z
    .number()
    .int("행 수는 정수여야 합니다.")
    .min(2, "행 수는 2 이상이어야 합니다.")
    .max(20, "행 수는 20 이하로 설정해 주세요."),
  aisleColumns: z.array(z.number().int().min(1)).optional(),
  isActive: z.boolean().optional(),
});

export const seatLayoutItemSchema = z
  .object({
    id: z.string().min(1).optional(),
    label: z.string().trim(),
    positionX: z.number().int().min(1),
    positionY: z.number().int().min(1),
    isActive: z.boolean(),
  })
  .refine((seat) => !seat.isActive || seat.label.length > 0, {
    message: "운영 좌석은 좌석 번호를 입력해 주세요.",
    path: ["label"],
  });

export const seatLayoutSchema = z.object({
  roomId: z.string().min(1, "자습실을 선택해 주세요."),
  seats: z.array(seatLayoutItemSchema),
});

export const seatAssignSchema = z.object({
  studentId: z.string().min(1).nullable(),
});
