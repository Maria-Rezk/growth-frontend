import { z } from 'zod';
import type { BrandProfile, BrandProfileInput } from '@/types/domain';
import { isHexColour, normalizeHex } from '@/utils/hexColour';

/*
  Brand Profile form schema and the form <-> API mappers, kept apart from the
  page so the payload rules can be tested without rendering it (and so the
  page module exports components only, for Fast Refresh).
*/

export const brandProfileSchema = z.object({
  brandName: z.string().trim().min(2, 'Brand name is required.'),
  industry: z.string().trim().min(2, 'Industry is required.'),
  description: z.string().trim().min(10, 'Add a short brand description.'),
  targetAudience: z.string().trim().min(10, 'Describe the target audience.'),
  toneOfVoice: z.string().trim().min(3, 'Tone of voice is required.'),
  brandNotes: z.string().optional().default(''),
  // string-array fields, edited as comma-separated text
  languages: z.string().optional().default(''),
  serviceAreas: z.string().optional().default(''),
  ctaPreferences: z.string().optional().default(''),
  forbiddenWords: z.string().optional().default(''),
  // structured arrays, edited as rows
  colors: z.array(z.object({
    name: z.string().trim().min(1, 'Colour name is required.'),
    hex: z.string().trim().refine(isHexColour, 'Use a hex value such as #C9144B.'),
  })),
  services: z.array(z.object({
    name: z.string().trim().min(1, 'Service name is required.'),
    description: z.string().optional().default(''),
    priceRange: z.string().optional().default(''),
  })),
  offers: z.array(z.object({
    title: z.string().trim().min(1, 'Offer title is required.'),
    description: z.string().optional().default(''),
    validUntil: z.string().optional().default(''),
  })),
});

export type BrandProfileForm = z.infer<typeof brandProfileSchema>;

export const EMPTY_BRAND_PROFILE: BrandProfileForm = {
  brandName: '', industry: '', description: '', targetAudience: '', toneOfVoice: '', brandNotes: '',
  languages: '', serviceAreas: '', ctaPreferences: '', forbiddenWords: '',
  colors: [], services: [], offers: [],
};

const listToText = (value?: string[]) => (Array.isArray(value) ? value.join(', ') : '');
const textToList = (value?: string) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []);

/** API shape -> form shape. Typed both ends now that BrandProfile is accurate. */
export function toFormValues(profile: BrandProfile): BrandProfileForm {
  return {
    brandName: profile.brandName ?? '',
    industry: profile.industry ?? '',
    description: profile.description ?? '',
    targetAudience: profile.targetAudience ?? '',
    toneOfVoice: profile.toneOfVoice ?? '',
    brandNotes: profile.brandNotes ?? '',
    languages: listToText(profile.languages),
    serviceAreas: listToText(profile.serviceAreas),
    ctaPreferences: listToText(profile.ctaPreferences),
    forbiddenWords: listToText(profile.forbiddenWords),
    colors: (profile.colors ?? []).map((c) => ({ name: c.name ?? '', hex: c.hex ?? '' })),
    services: (profile.services ?? []).map((s) => ({ name: s.name ?? '', description: s.description ?? '', priceRange: s.priceRange ?? '' })),
    offers: (profile.offers ?? []).map((o) => ({ title: o.title ?? '', description: o.description ?? '', validUntil: o.validUntil ?? '' })),
  };
}

/**
 * Form shape -> API payload.
 *
 * `brandNotes` is the one optional free-text field the API can clear, and it
 * only touches the column when the key is present: an omitted key means
 * "leave it", an empty string means "set it to NULL". So once a profile
 * exists, a cleared box must send `''` — `undefined` would be dropped by
 * JSON.stringify and the old notes would survive the save (FG-05 / N-22).
 * On first create there is nothing to clear, so an empty box is omitted.
 */
export function toPayload(values: BrandProfileForm, exists: boolean): BrandProfileInput {
  const hasNotes = Boolean(values.brandNotes?.trim());
  return {
    brandName: values.brandName,
    industry: values.industry,
    description: values.description,
    targetAudience: values.targetAudience,
    toneOfVoice: values.toneOfVoice,
    brandNotes: hasNotes ? values.brandNotes : exists ? '' : undefined,
    languages: textToList(values.languages),
    serviceAreas: textToList(values.serviceAreas),
    ctaPreferences: textToList(values.ctaPreferences),
    forbiddenWords: textToList(values.forbiddenWords),
    // Validated above, so normalizeHex always has a colour to return.
    colors: values.colors.map((c) => ({ name: c.name, hex: normalizeHex(c.hex) ?? c.hex })),
    services: values.services.map((s) => ({ name: s.name, description: s.description || undefined, priceRange: s.priceRange || undefined })),
    offers: values.offers.map((o) => ({ title: o.title, description: o.description || undefined, validUntil: o.validUntil || undefined })),
  };
}
