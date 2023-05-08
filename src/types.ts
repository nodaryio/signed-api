import { z } from "zod";

/**
 * Common EVM Data Schema
 */
export const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const evmIdSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);

export const signedDataSchema = z.object({
  feedName: z.string(),
  oisTitle: z.string(),
  beaconId: evmIdSchema,
  airnode: evmAddressSchema,
  endpointId: evmIdSchema,
  templateId: evmIdSchema,
  parameters: z.string(),
  timestamp: z.string(),
  encodedValue: z.string(),
  signature: z.string(),
});

export type SignedData = z.infer<typeof signedDataSchema>;
