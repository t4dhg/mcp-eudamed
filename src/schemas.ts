import { z } from 'zod';
const text = z.string().trim().min(1).max(200);
export const searchShape = {
  manufacturerSrn: text
    .regex(
      /^[A-Z]{2}-MF-\d{9}$/,
      'Expected manufacturer SRN such as US-MF-000000001; use eudamed_discover_actors for company names.',
    )
    .optional(),
  tradeName: text.optional(),
  deviceName: text.optional(),
  basicUdi: text.optional(),
  primaryDi: text.optional(),
  reference: text.optional(),
};
export const searchKeys = Object.keys(searchShape) as (keyof typeof searchShape)[];
export const searchSchema = z
  .object({
    ...searchShape,
    exact: z.boolean().default(false),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict()
  .refine(
    (v) => searchKeys.some((k) => v[k]),
    'At least one restrictive device filter is required',
  );
export type DeviceSearch = z.input<typeof searchSchema>;
export const actorSchema = z
  .object({
    actorId: text.regex(
      /^(?:[A-Z]{2}-(?:MF|AR|IM|PR)-\d{9}|\d{4})$/,
      'Expected actor ID/SRN such as US-MF-000000001 or a four-digit notified body ID; use eudamed_discover_actors for names.',
    ),
  })
  .strict();
export const discoverySchema = z
  .object({
    name: text.describe(
      'Registered legal or abbreviated company name. Data Lake matching is exact, not substring.',
    ),
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    role: z
      .enum([
        'Manufacturer',
        'Authorised Representative',
        'Importer',
        'System/Procedure Pack Producer',
        'Notified Body',
      ])
      .optional(),
    limit: z.number().int().min(1).max(100).default(20),
  })
  .strict();
export const referenceInputSchema = z
  .object({
    language: z
      .string()
      .regex(/^[a-z]{2}$/)
      .default('en'),
    code: text.optional(),
    id: z.number().int().optional(),
    limit: z.number().int().min(1).max(500).default(100),
  })
  .strict();
const nullableText = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();
export const deviceSchema = z
  .object({
    ID: nullableNumber,
    VERSION_NUMBER: nullableNumber,
    UUID: nullableText,
    PRIMARY_DI: nullableText,
    BASIC_UDI: nullableText,
    TRADE_NAME: nullableText,
    DEVICE_NAME: nullableText,
    DEVICE_MODEL: nullableText,
    REFERENCE: nullableText,
    MF_SRN: nullableText,
    MF_NAME: nullableText,
    AR_SRN: nullableText,
    AR_NAME: nullableText,
    NOMENCLATURE_CODE: nullableText,
    MEDICAL_PURPOSE: nullableText,
    RISK_CLASS_ID: nullableNumber,
    STATUS_ID: nullableNumber,
    APPLICABLE_LEGISLATION_ID: nullableNumber,
    DEVICE_STATUS_TYPE_ID: nullableNumber,
    PLACED_ON_THE_MARKET_ID: nullableNumber,
  })
  .passthrough()
  .refine(
    (row) => ['PRIMARY_DI', 'BASIC_UDI', 'UUID', 'ID'].some((key) => row[key] != null),
    'Device identity missing',
  );
export type Device = z.infer<typeof deviceSchema>;
export const actorRecordSchema = z
  .object({
    ACTOR_ID: z.string(),
    NAME: nullableText,
    ABBREVIATED_NAME: nullableText,
    STATUS: nullableText,
    ACTOR_TYPE: nullableText,
    ACT_COUNTRY_NAME: nullableText,
    ACT_COUNTRY_ISO2_CODE: nullableText,
  })
  .strip();
export type Actor = z.infer<typeof actorRecordSchema>;
export const referenceSchema = z.object({
  ID: z.number().int(),
  CODE: z.string(),
  LANGUAGE: z.string(),
  VALUE: z.string(),
});
export type Reference = z.infer<typeof referenceSchema>;
export const investigationSchema = z
  .object({
    ...searchShape,
    language: z
      .string()
      .regex(/^[a-z]{2}$/)
      .default('en'),
    deadlineMs: z.number().int().min(1).max(300000).default(60000),
    maxDevices: z.number().int().min(1).max(20).default(10),
    maxManufacturers: z.number().int().min(1).max(5).default(3),
    maxRepresentatives: z.number().int().min(1).max(5).default(3),
  })
  .strict()
  .refine(
    (v) => searchKeys.some((k) => v[k]),
    'Provide a device identifier, name or manufacturer SRN',
  );
export type InvestigationInput = z.input<typeof investigationSchema>;
