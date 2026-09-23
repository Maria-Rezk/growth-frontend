import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Fields';
import { FormErrorSummary } from '@/components/ui/FormErrorSummary';
import { LoadingState, ErrorState } from '@/components/ui/State';
import { RoleGate } from '@/components/domain/RoleGate';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { scopeDraftKey, useFormDraft } from '@/hooks/useFormDraft';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { useAuth } from '@/context/AuthContext';
import { applyServerFieldErrors } from '@/lib/forms';
import { brandProfilesService } from '@/services/brandProfiles';
import { queryKeys } from '@/lib/queryClient';
import type { BrandProfile, BrandProfileInput } from '@/types/domain';

const HEX = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const brandProfileSchema = z.object({
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
    hex: z.string().trim().regex(HEX, 'Use a hex value such as #C9144B.'),
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

type BrandProfileForm = z.infer<typeof brandProfileSchema>;

const EMPTY: BrandProfileForm = {
  brandName: '', industry: '', description: '', targetAudience: '', toneOfVoice: '', brandNotes: '',
  languages: '', serviceAreas: '', ctaPreferences: '', forbiddenWords: '',
  colors: [], services: [], offers: [],
};

const listToText = (value?: string[]) => (Array.isArray(value) ? value.join(', ') : '');
const textToList = (value?: string) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []);

/** API shape -> form shape. Typed both ends now that BrandProfile is accurate. */
function toFormValues(profile: BrandProfile): BrandProfileForm {
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

/** Form shape -> API payload. */
function toPayload(values: BrandProfileForm): BrandProfileInput {
  return {
    brandName: values.brandName,
    industry: values.industry,
    description: values.description,
    targetAudience: values.targetAudience,
    toneOfVoice: values.toneOfVoice,
    brandNotes: values.brandNotes || undefined,
    languages: textToList(values.languages),
    serviceAreas: textToList(values.serviceAreas),
    ctaPreferences: textToList(values.ctaPreferences),
    forbiddenWords: textToList(values.forbiddenWords),
    colors: values.colors.map((c) => ({ name: c.name, hex: c.hex.startsWith('#') ? c.hex : `#${c.hex}` })),
    services: values.services.map((s) => ({ name: s.name, description: s.description || undefined, priceRange: s.priceRange || undefined })),
    offers: values.offers.map((o) => ({ title: o.title, description: o.description || undefined, validUntil: o.validUntil || undefined })),
  };
}

export function BrandProfilePage() {
  return <RequireCompany>{(companyId) => <BrandProfileInner companyId={companyId} />}</RequireCompany>;
}

function BrandProfileInner({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const profile = useAsync(
    () => brandProfilesService.get(companyId),
    [companyId],
    { queryKey: queryKeys.brandProfile(companyId) },
  );

  const form = useForm<BrandProfileForm>({ resolver: zodResolver(brandProfileSchema), defaultValues: EMPTY, mode: 'onBlur' });

  const save = useMutation(brandProfilesService.upsert, {
    invalidateKeys: [queryKeys.brandProfile(companyId)],
    onError: (error) => applyServerFieldErrors(form, error),
  });

  const colors = useFieldArray({ control: form.control, name: 'colors' });
  const services = useFieldArray({ control: form.control, name: 'services' });
  const offers = useFieldArray({ control: form.control, name: 'offers' });

  const isDirty = form.formState.isDirty;
  // This form is long enough to represent real work. Warn before a tab close
  // or reload; in-app navigation still needs a data-router blocker.
  useUnsavedChangesWarning(isDirty);

  useEffect(() => {
    if (!profile.data) return;
    /*
      Only while pristine. `refetchOnWindowFocus` (queryClient.ts) means
      `profile.data` can now change under an open, half-filled form — e.g. the
      person tabs away, someone else saves a brand update, they tab back. This
      guard is what stops that background refresh from silently overwriting
      whatever they were still typing; the reset only ever applies to a form
      nobody has touched yet.
      `reset` (not setValue) so isDirty returns to false and the loaded values
      become the new baseline for the dirty check.
    */
    if (form.formState.isDirty) return;
    form.reset(toFormValues(profile.data));
  }, [form, profile.data]);

  const draft = useFormDraft(
    profile.data ? scopeDraftKey(user?.id, `brand-profile:${companyId}`) : null,
    form,
    { enabled: Boolean(profile.data), serverUpdatedAt: profile.data?.updatedAt },
  );

  const submit = form.handleSubmit(async (values) => {
    const result = await save.mutate(companyId, toPayload(values), Boolean(profile.data));
    if (result) {
      profile.setData(result);
      form.reset(toFormValues(result));
      draft.discard();
      toast.success('Brand profile saved.');
    }
  });

  if (profile.loading) return <Card><LoadingState label="Loading brand profile…" /></Card>;
  if (profile.error) return <Card><ErrorState message={profile.error} onRetry={profile.refetch} /></Card>;

  return (
    <>
      <PageHeader
        title="Brand profile"
        subtitle="The source of truth for AI prompts, content workflows and client strategy."
        action={<BrandFreshness updatedAt={profile.data?.updatedAt} />}
      />

      <form className="form-grid" onSubmit={submit} noValidate>
        <Card>
          <CardHeader title="Identity" subtitle="How the brand describes itself." />
          <div className="form-card form-grid">
            <div className="grid-2">
              <Field label="Brand name" htmlFor="brandName" error={form.formState.errors.brandName?.message}>
                <Input id="brandName" aria-invalid={Boolean(form.formState.errors.brandName)} {...form.register('brandName')} />
              </Field>
              <Field label="Industry" htmlFor="industry" error={form.formState.errors.industry?.message}>
                <Input id="industry" aria-invalid={Boolean(form.formState.errors.industry)} {...form.register('industry')} />
              </Field>
            </div>

            <Field label="Description" htmlFor="description" error={form.formState.errors.description?.message}>
              <Textarea id="description" rows={3} aria-invalid={Boolean(form.formState.errors.description)} {...form.register('description')} />
            </Field>
            <Field label="Target audience" htmlFor="targetAudience" error={form.formState.errors.targetAudience?.message}>
              <Textarea id="targetAudience" rows={3} aria-invalid={Boolean(form.formState.errors.targetAudience)} {...form.register('targetAudience')} />
            </Field>

            <div className="grid-2">
              <Field label="Tone of voice" htmlFor="toneOfVoice" error={form.formState.errors.toneOfVoice?.message}>
                <Input id="toneOfVoice" placeholder="Premium, calm, reassuring" aria-invalid={Boolean(form.formState.errors.toneOfVoice)} {...form.register('toneOfVoice')} />
              </Field>
              <Field label="Languages" htmlFor="languages" hint="Comma-separated, e.g. ar, en">
                <Input id="languages" {...form.register('languages')} />
              </Field>
            </div>

            <div className="grid-2">
              <Field label="Service areas" htmlFor="serviceAreas" hint="Comma-separated">
                <Input id="serviceAreas" {...form.register('serviceAreas')} />
              </Field>
              <Field label="CTA preferences" htmlFor="ctaPreferences" hint="Comma-separated">
                <Input id="ctaPreferences" {...form.register('ctaPreferences')} />
              </Field>
            </div>

            <Field label="Forbidden words" htmlFor="forbiddenWords" hint="Comma-separated. The AI will avoid these.">
              <Input id="forbiddenWords" {...form.register('forbiddenWords')} />
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Brand colours"
            action={<Button type="button" variant="secondary" size="sm" onClick={() => colors.append({ name: '', hex: '#000000' })}>Add colour</Button>}
          />
          <div className="form-card stack-list">
            {colors.fields.length === 0 ? <p className="muted">No colours yet.</p> : null}
            {colors.fields.map((fieldItem, index) => (
              <div key={fieldItem.id} className="repeat-row">
                <Field label="Name" htmlFor={`color-name-${index}`} error={form.formState.errors.colors?.[index]?.name?.message}>
                  <Input id={`color-name-${index}`} {...form.register(`colors.${index}.name`)} />
                </Field>
                <Field label="Hex" htmlFor={`color-hex-${index}`} error={form.formState.errors.colors?.[index]?.hex?.message}>
                  <Input id={`color-hex-${index}`} placeholder="#C9144B" {...form.register(`colors.${index}.hex`)} />
                </Field>
                {/* Native swatch bound to the same field — typing updates the
                    picker and picking updates the text. */}
                <Field label="Pick" htmlFor={`color-swatch-${index}`}>
                  <input
                    id={`color-swatch-${index}`}
                    className="color-swatch"
                    type="color"
                    value={HEX.test(form.watch(`colors.${index}.hex`) ?? '') ? form.watch(`colors.${index}.hex`) : '#000000'}
                    onChange={(e) => form.setValue(`colors.${index}.hex`, e.target.value, { shouldDirty: true })}
                  />
                </Field>
                <Button type="button" variant="secondary" size="sm" onClick={() => colors.remove(index)} aria-label={`Remove colour ${index + 1}`}>Remove</Button>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Services"
            action={<Button type="button" variant="secondary" size="sm" onClick={() => services.append({ name: '', description: '', priceRange: '' })}>Add service</Button>}
          />
          <div className="form-card stack-list">
            {services.fields.length === 0 ? <p className="muted">No services yet.</p> : null}
            {services.fields.map((fieldItem, index) => (
              <div key={fieldItem.id} className="bordered-row">
                <div className="bordered-row__head">
                  <strong>Service {index + 1}</strong>
                  <Button type="button" variant="secondary" size="sm" onClick={() => services.remove(index)} aria-label={`Remove service ${index + 1}`}>Remove</Button>
                </div>
                <div className="grid-2">
                  <Field label="Name" htmlFor={`svc-name-${index}`} error={form.formState.errors.services?.[index]?.name?.message}>
                    <Input id={`svc-name-${index}`} {...form.register(`services.${index}.name`)} />
                  </Field>
                  <Field label="Price range" htmlFor={`svc-price-${index}`}>
                    <Input id={`svc-price-${index}`} {...form.register(`services.${index}.priceRange`)} />
                  </Field>
                </div>
                <Field label="Description" htmlFor={`svc-desc-${index}`}>
                  <Textarea id={`svc-desc-${index}`} rows={2} {...form.register(`services.${index}.description`)} />
                </Field>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Offers"
            action={<Button type="button" variant="secondary" size="sm" onClick={() => offers.append({ title: '', description: '', validUntil: '' })}>Add offer</Button>}
          />
          <div className="form-card stack-list">
            {offers.fields.length === 0 ? <p className="muted">No offers yet.</p> : null}
            {offers.fields.map((fieldItem, index) => (
              <div key={fieldItem.id} className="bordered-row">
                <div className="bordered-row__head">
                  <strong>Offer {index + 1}</strong>
                  <Button type="button" variant="secondary" size="sm" onClick={() => offers.remove(index)} aria-label={`Remove offer ${index + 1}`}>Remove</Button>
                </div>
                <div className="grid-2">
                  <Field label="Title" htmlFor={`offer-title-${index}`} error={form.formState.errors.offers?.[index]?.title?.message}>
                    <Input id={`offer-title-${index}`} {...form.register(`offers.${index}.title`)} />
                  </Field>
                  <Field label="Valid until" htmlFor={`offer-valid-${index}`}>
                    <Input id={`offer-valid-${index}`} type="date" {...form.register(`offers.${index}.validUntil`)} />
                  </Field>
                </div>
                <Field label="Description" htmlFor={`offer-desc-${index}`}>
                  <Textarea id={`offer-desc-${index}`} rows={2} {...form.register(`offers.${index}.description`)} />
                </Field>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="form-card form-grid">
            <Field label="Brand notes" htmlFor="brandNotes" hint="Internal guidance for the AI, e.g. claims to avoid.">
              <Textarea id="brandNotes" rows={3} {...form.register('brandNotes')} />
            </Field>

            {/* The errors are otherwise invisible: a validation failure on a
                field far above the fold left the submit doing nothing. */}
            <FormErrorSummary errors={form.formState.errors} />
            {save.error ? <p className="error-box" role="alert">{save.error}</p> : null}

            <div className="form-status-row">
              <span>
                {isDirty
                  ? (
                    <span className="unsaved-pill">
                      {draft.restored ? 'Unsaved changes — restored from your last visit' : 'Unsaved changes'}
                    </span>
                  )
                  : <span className="muted">All changes saved.</span>}
              </span>
              <RoleGate permission="brand:edit" fallback={<span className="muted">Your role cannot edit the brand profile.</span>}>
                <Button type="submit" loading={form.formState.isSubmitting || save.loading} disabled={!isDirty}>
                  Save brand profile
                </Button>
              </RoleGate>
            </div>
          </div>
        </Card>
      </form>
    </>
  );
}


/**
 * "Updated 3 months ago" — and a nudge past ninety days. Everything the AI
 * writes and every brief the team follows starts here; a stale profile is
 * a quiet way to drift off-brand.
 */
function BrandFreshness({ updatedAt }: { updatedAt?: string }) {
  if (!updatedAt) return null;
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return null;
  const label = days === 0 ? 'Updated today' : days === 1 ? 'Updated yesterday' : days < 30 ? `Updated ${days} days ago` : days < 60 ? 'Updated last month' : `Updated ${Math.floor(days / 30)} months ago`;
  return (
    <span className={days >= 90 ? 'freshness freshness--stale' : 'freshness'} title={new Date(updatedAt).toLocaleString()}>
      {label}{days >= 90 ? ' · worth a review' : ''}
    </span>
  );
}
