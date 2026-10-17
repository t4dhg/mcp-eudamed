import type { Device, Reference } from './schemas.js';
export const decodedFields = [
  'RISK_CLASS_ID',
  'APPLICABLE_LEGISLATION_ID',
  'STATUS_ID',
  'DEVICE_STATUS_TYPE_ID',
  'PLACED_ON_THE_MARKET_ID',
  'SPECIAL_DEVICE_TYPE_ID',
  'MULTI_COMPONENT_ID',
] as const;
export const flagFields = [
  'ACTIVE',
  'MEASURING_FUNCTION',
  'STERILE',
  'IMPLANTABLE',
  'REUSABLE',
  'CMR_SUBSTANCE',
  'ENDOCRINE_DISRUPTOR',
  'LATEX',
  'REPROCESSED',
  'STERILIZATION',
  'NEW_DEVICE',
  'ADMINISTERING_MEDICINE',
  'ANIMAL_TISSUES',
  'COMPANION_DIAGNOSTICS',
  'HUMAN_TISSUES',
  'KIT',
  'MICROBIAL_SUBSTANCES',
  'NEAR_PATIENT_TESTING',
  'SELF_TESTING',
  'REAGENT',
  'INSTRUMENT',
  'PROFESSIONAL_TESTING',
  'SUTURES',
  'HUMAN_PRODUCT',
  'MEDICINAL_PRODUCT',
] as const;
const clean = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
export function numericFlag(value: unknown): boolean | null {
  return value === 1 || value === true ? true : value === 0 || value === false ? false : null;
}
export function parseEmbeddedJson(value: unknown): unknown {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
export function normalizeDevice(device: Device, references: Reference[]) {
  const map = new Map(references.map((row) => [`${row.CODE}:${row.ID}`, row.VALUE]));
  const decoded = Object.fromEntries(
    decodedFields.map((field) => {
      const id = typeof device[field] === 'number' ? (device[field] as number) : null;
      const label = id === null ? null : (map.get(`${field}:${id}`) ?? null);
      return [field, { id, label, status: label === null ? 'unresolved' : 'resolved' }];
    }),
  );
  return {
    identity: {
      primaryDi: clean(device.PRIMARY_DI),
      basicUdi: clean(device.BASIC_UDI),
      uuid: clean(device.UUID),
      id: device.ID ?? null,
      version: device.VERSION_NUMBER ?? null,
      tradeName: clean(device.TRADE_NAME),
      deviceName: clean(device.DEVICE_NAME),
      model: clean(device.DEVICE_MODEL),
      reference: clean(device.REFERENCE),
      nomenclatureCode: clean(device.NOMENCLATURE_CODE),
    },
    manufacturer: { srn: clean(device.MF_SRN), name: clean(device.MF_NAME) },
    authorisedRepresentative: { srn: clean(device.AR_SRN), name: clean(device.AR_NAME) },
    decoded,
    flags: Object.fromEntries(flagFields.map((field) => [field, numericFlag(device[field])])),
    intendedPurpose: {
      value: clean(device.MEDICAL_PURPOSE),
      status: clean(device.MEDICAL_PURPOSE) ? 'public-record' : 'missing',
      note: 'Public API text is not verification of the current controlled IFU.',
    },
    documents: {
      ifu: {
        status: 'unverified',
        nextEvidence: 'Obtain the controlled current IFU and label for the exact model and UDI.',
      },
      declarationOfConformity: {
        status: 'unverified',
        nextEvidence:
          'Obtain the manufacturer declaration tied to the exact device and Basic UDI-DI.',
      },
      notifiedBodyCertificate: {
        status: 'unverified',
        applicability: 'unverified',
        nextEvidence:
          'Establish the applicable conformity route, then verify any required certificate, status and schedule against the manufacturer and Basic UDI-DI. ISO 13485 evidence alone is insufficient.',
      },
    },
    limitations: [
      'Public registration does not independently establish product conformity.',
      'Unknown flags remain unknown. Missing documents or searches do not prove non-compliance.',
    ],
  };
}
