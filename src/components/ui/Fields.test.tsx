// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Field, Input, Select } from './Fields';

afterEach(cleanup);

/*
  `Field` renders a hint and an error as separate paragraphs with their own
  ids, but a screen reader only reads them as *belonging to the input* if the
  input's aria-describedby names those ids. This pins that wiring, and that
  it degrades safely (no crash, original children untouched) when a field
  holds more than one control and can't be described by a single id.
*/
describe('Field', () => {
  it('describes the input by its hint', () => {
    render(
      <Field label="Name" htmlFor="name" hint="As it appears on invoices.">
        <Input id="name" />
      </Field>,
    );

    const input = screen.getByLabelText('Name');
    const hint = screen.getByText('As it appears on invoices.');
    expect(input).toHaveAttribute('aria-describedby', hint.id);
  });

  it('describes the input by both hint and error when both are present', () => {
    render(
      <Field label="Name" htmlFor="name" hint="As it appears on invoices." error="Name is required.">
        <Input id="name" />
      </Field>,
    );

    const input = screen.getByLabelText('Name');
    const hint = screen.getByText('As it appears on invoices.');
    const error = screen.getByText('Name is required.');
    expect(input.getAttribute('aria-describedby')).toBe(`${hint.id} ${error.id}`);
  });

  it('keeps an aria-describedby the caller already set', () => {
    render(
      <Field label="Name" htmlFor="name" hint="A hint.">
        <Input id="name" aria-describedby="external-note" />
      </Field>,
    );

    const input = screen.getByLabelText('Name');
    const hint = screen.getByText('A hint.');
    expect(input.getAttribute('aria-describedby')).toBe(`external-note ${hint.id}`);
  });

  it('adds no aria-describedby when there is no hint or error', () => {
    render(
      <Field label="Name" htmlFor="name">
        <Input id="name" />
      </Field>,
    );

    expect(screen.getByLabelText('Name')).not.toHaveAttribute('aria-describedby');
  });

  it('leaves multiple children untouched instead of guessing which one to describe', () => {
    render(
      <Field label="Colour" hint="Pick one.">
        <Input id="colour-name" aria-label="Colour name" />
        <Input id="colour-hex" aria-label="Colour hex" type="color" />
      </Field>,
    );

    expect(screen.getByLabelText('Colour name')).not.toHaveAttribute('aria-describedby');
    expect(screen.getByLabelText('Colour hex')).not.toHaveAttribute('aria-describedby');
  });
});

/*
  The required/optional convention: optional fields say "(optional)" in their
  label; required fields carry aria-required and no visual marker.
*/
describe('Field required and optional', () => {
  it('adds "(optional)" to the label, and it is part of the accessible name', () => {
    render(<Field label="Phone" htmlFor="phone" optional><Input id="phone" /></Field>);
    expect(screen.getByText('(optional)')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Phone (optional)' })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-required');
  });

  it('marks a required field for assistive technology only', () => {
    render(<Field label="Name" htmlFor="name" required><Input id="name" /></Field>);
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAttribute('aria-required', 'true');
    expect(screen.queryByText('(optional)')).not.toBeInTheDocument();
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('keeps the hint and error wiring when a field is required', () => {
    render(
      <Field label="Name" htmlFor="name" required hint="As it appears on the invoice." error="Name is required.">
        <Input id="name" />
      </Field>,
    );
    const input = screen.getByRole('textbox', { name: 'Name' });
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAccessibleDescription('As it appears on the invoice. Name is required.');
  });

  it('works for a select as well as an input', () => {
    render(<Field label="Source" htmlFor="source" required><Select id="source"><option>Website</option></Select></Field>);
    expect(screen.getByRole('combobox', { name: 'Source' })).toHaveAttribute('aria-required', 'true');
  });

  it('marks neither when the caller says nothing', () => {
    render(<Field label="Search" htmlFor="search"><Input id="search" /></Field>);
    const input = screen.getByRole('textbox', { name: 'Search' });
    expect(input).not.toHaveAttribute('aria-required');
  });
});
