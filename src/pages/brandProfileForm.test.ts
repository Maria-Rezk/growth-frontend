import { describe, expect, it } from 'vitest';
import { EMPTY_BRAND_PROFILE, toPayload, type BrandProfileForm } from './brandProfileForm';

const filled: BrandProfileForm = {
  ...EMPTY_BRAND_PROFILE,
  brandName: 'Acme',
  industry: 'Hospitality',
  description: 'A boutique hotel group.',
  targetAudience: 'Couples on weekend breaks.',
  toneOfVoice: 'Warm',
};

/** What actually goes over the wire — `undefined` keys vanish here. */
const wire = (payload: unknown) => JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;

describe('Brand Profile payload — brandNotes (FG-05 / N-22)', () => {
  it('sends an empty string when notes are cleared on an existing profile', () => {
    const body = wire(toPayload({ ...filled, brandNotes: '' }, true));
    expect(body).toHaveProperty('brandNotes', '');
  });

  it('treats whitespace-only notes as cleared', () => {
    const body = wire(toPayload({ ...filled, brandNotes: '   \n ' }, true));
    expect(body).toHaveProperty('brandNotes', '');
  });

  it('omits empty notes when the profile is being created', () => {
    const body = wire(toPayload({ ...filled, brandNotes: '' }, false));
    expect(body).not.toHaveProperty('brandNotes');
  });

  it('sends non-empty notes unchanged', () => {
    const notes = '  Never promise revenue figures.  ';
    expect(wire(toPayload({ ...filled, brandNotes: notes }, true))).toHaveProperty('brandNotes', notes);
    expect(wire(toPayload({ ...filled, brandNotes: notes }, false))).toHaveProperty('brandNotes', notes);
  });
});
