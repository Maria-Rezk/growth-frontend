import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import { RequireCompany } from '@/components/layout/RequireCompany';
import { PageHeader, Card, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Field, Input, Textarea } from '@/components/ui/Fields';
import { LoadingState, ErrorState } from '@/components/ui/State';
import { useAsync, useMutation } from '@/hooks/useAsync';
import { brandProfilesService } from '@/services/brandProfiles';
import { queryKeys } from '@/lib/queryClient';

// Schema matches the backend brand-profile contract.
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
  colors: z.array(z.object({ name: z.string().trim().min(1, 'Name'), hex: z.string().trim().min(1, 'Hex') })),
  services: z.array(z.object({
    name: z.string().trim().min(1, 'Service name required'),
    description: z.string().optional().default(''),
    priceRange: z.string().optional().default(''),
  })),
  offers: z.array(z.object({
    title: z.string().trim().min(1, 'Title required'),
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

const listToText = (value: unknown) => (Array.isArray(value) ? value.join(', ') : (value as string) ?? '');
const textToList = (value?: string) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []);

export function BrandProfilePage() {
  return <RequireCompany>{(companyId) => <BrandProfileInner companyId={companyId} />}</RequireCompany>;
}

function BrandProfileInner({ companyId }: { companyId: string }) {
  const profile = useAsync(
    () => brandProfilesService.get(companyId),
    [companyId],
    { queryKey: queryKeys.brandProfile(companyId) },
  );
  const save = useMutation(brandProfilesService.upsert, { invalidateKeys: [queryKeys.brandProfile(companyId)] });

  const form = useForm<BrandProfileForm>({ resolver: zodResolver(brandProfileSchema), defaultValues: EMPTY, mode: 'onBlur' });
  const colors = useFieldArray({ control: form.control, name: 'colors' });
  const services = useFieldArray({ control: form.control, name: 'services' });
  const offers = useFieldArray({ control: form.control, name: 'offers' });

  useEffect(() => {
    if (!profile.data) return;
    const d = profile.data as any;
    form.reset({
      brandName: d.brandName ?? '',
      industry: d.industry ?? '',
      description: d.description ?? '',
      targetAudience: d.targetAudience ?? '',
      toneOfVoice: d.toneOfVoice ?? '',
      brandNotes: d.brandNotes ?? '',
      languages: listToText(d.languages),
      serviceAreas: listToText(d.serviceAreas),
      ctaPreferences: listToText(d.ctaPreferences),
      forbiddenWords: listToText(d.forbiddenWords),
      colors: Array.isArray(d.colors) ? d.colors.map((c: any) => ({ name: c.name ?? '', hex: c.hex ?? '' })) : [],
      services: Array.isArray(d.services) ? d.services.map((s: any) => ({ name: s.name ?? '', description: s.description ?? '', priceRange: s.priceRange ?? '' })) : [],
      offers: Array.isArray(d.offers) ? d.offers.map((o: any) => ({ title: o.title ?? '', description: o.description ?? '', validUntil: o.validUntil ?? '' })) : [],
    });
  }, [form, profile.data]);

  const submit = form.handleSubmit(async (values) => {
    const payload = {
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
      colors: values.colors,
      services: values.services.map((s) => ({ name: s.name, description: s.description || undefined, priceRange: s.priceRange || undefined })),
      offers: values.offers.map((o) => ({ title: o.title, description: o.description || undefined, validUntil: o.validUntil || undefined })),
    };
    const result = await save.mutate(companyId, payload as any, Boolean(profile.data));
    if (result) {
      profile.setData(result);
      toast.success('Brand profile saved.');
    }
  });

  if (profile.loading) return <LoadingState />;
  if (profile.error) return <ErrorState message={profile.error} onRetry={profile.refetch} />;

  return (
    <>
      <PageHeader title="Brand profile" subtitle="The source of truth for AI prompts, content workflows and client-specific strategy." />
      <Card className="form-card">
        <form className="form-grid" onSubmit={submit} noValidate>
          <div className="grid-2">
            <Field label="Brand name" htmlFor="brandName" error={form.formState.errors.brandName?.message}>
              <Input id="brandName" {...form.register('brandName')} />
            </Field>
            <Field label="Industry" htmlFor="industry" error={form.formState.errors.industry?.message}>
              <Input id="industry" {...form.register('industry')} />
            </Field>
          </div>

          <Field label="Description" htmlFor="description" error={form.formState.errors.description?.message}>
            <Textarea id="description" rows={3} {...form.register('description')} />
          </Field>
          <Field label="Target audience" htmlFor="targetAudience" error={form.formState.errors.targetAudience?.message}>
            <Textarea id="targetAudience" rows={3} {...form.register('targetAudience')} />
          </Field>

          <div className="grid-2">
            <Field label="Tone of voice" htmlFor="toneOfVoice" error={form.formState.errors.toneOfVoice?.message}>
              <Input id="toneOfVoice" placeholder="Premium, calm, reassuring" {...form.register('toneOfVoice')} />
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

          {/* Colors */}
          <Card className="content-card">
            <CardHeader title="Brand colors" action={<Button type="button" variant="secondary" size="sm" onClick={() => colors.append({ name: '', hex: '' })}>Add color</Button>} />
            <div className="content-card__body stack-list">
              {colors.fields.length === 0 ? <p className="muted">No colors yet.</p> : null}
              {colors.fields.map((fieldItem, index) => (
                <div key={fieldItem.id} className="grid-2">
                  <Field label="Name" htmlFor={`color-name-${index}`}><Input id={`color-name-${index}`} {...form.register(`colors.${index}.name`)} /></Field>
                  <div className="row-with-remove">
                    <Field label="Hex" htmlFor={`color-hex-${index}`}><Input id={`color-hex-${index}`} placeholder="#F4E8D8" {...form.register(`colors.${index}.hex`)} /></Field>
                    <Button type="button" variant="secondary" size="sm" onClick={() => colors.remove(index)} aria-label={`Remove color ${index + 1}`}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Services */}
          <Card className="content-card">
            <CardHeader title="Services" action={<Button type="button" variant="secondary" size="sm" onClick={() => services.append({ name: '', description: '', priceRange: '' })}>Add service</Button>} />
            <div className="content-card__body stack-list">
              {services.fields.length === 0 ? <p className="muted">No services yet.</p> : null}
              {services.fields.map((fieldItem, index) => (
                <div key={fieldItem.id} className="form-grid bordered-row">
                  <Field label="Name" htmlFor={`svc-name-${index}`} error={form.formState.errors.services?.[index]?.name?.message}>
                    <Input id={`svc-name-${index}`} {...form.register(`services.${index}.name`)} />
                  </Field>
                  <Field label="Description" htmlFor={`svc-desc-${index}`}><Textarea id={`svc-desc-${index}`} rows={2} {...form.register(`services.${index}.description`)} /></Field>
                  <div className="row-with-remove">
                    <Field label="Price range" htmlFor={`svc-price-${index}`}><Input id={`svc-price-${index}`} {...form.register(`services.${index}.priceRange`)} /></Field>
                    <Button type="button" variant="secondary" size="sm" onClick={() => services.remove(index)} aria-label={`Remove service ${index + 1}`}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Offers */}
          <Card className="content-card">
            <CardHeader title="Offers" action={<Button type="button" variant="secondary" size="sm" onClick={() => offers.append({ title: '', description: '', validUntil: '' })}>Add offer</Button>} />
            <div className="content-card__body stack-list">
              {offers.fields.length === 0 ? <p className="muted">No offers yet.</p> : null}
              {offers.fields.map((fieldItem, index) => (
                <div key={fieldItem.id} className="form-grid bordered-row">
                  <Field label="Title" htmlFor={`offer-title-${index}`} error={form.formState.errors.offers?.[index]?.title?.message}>
                    <Input id={`offer-title-${index}`} {...form.register(`offers.${index}.title`)} />
                  </Field>
                  <Field label="Description" htmlFor={`offer-desc-${index}`}><Textarea id={`offer-desc-${index}`} rows={2} {...form.register(`offers.${index}.description`)} /></Field>
                  <div className="row-with-remove">
                    <Field label="Valid until" htmlFor={`offer-valid-${index}`}><Input id={`offer-valid-${index}`} type="date" {...form.register(`offers.${index}.validUntil`)} /></Field>
                    <Button type="button" variant="secondary" size="sm" onClick={() => offers.remove(index)} aria-label={`Remove offer ${index + 1}`}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Field label="Brand notes" htmlFor="brandNotes" hint="Internal guidance for the AI, e.g. claims to avoid.">
            <Textarea id="brandNotes" rows={3} {...form.register('brandNotes')} />
          </Field>

          {save.error ? <p className="error-box" role="alert">{save.error}</p> : null}
          <div className="form-actions"><Button type="submit" loading={form.formState.isSubmitting || save.loading}>Save brand profile</Button></div>
        </form>
      </Card>
    </>
  );
}