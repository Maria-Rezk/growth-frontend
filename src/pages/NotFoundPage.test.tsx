// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NotFoundPage } from './NotFoundPage';

afterEach(cleanup);

describe('NotFoundPage', () => {
  it('names the page, shows the address as typed, and sends the person to their start page', () => {
    render(
      <MemoryRouter initialEntries={['/taks']}>
        <Routes>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByText('/taks')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to my home page' })).toHaveAttribute('href', '/');
    expect(document.title).toMatch(/^Page not found · /);
  });

  it('renders no landmark of its own, so it can sit inside the app shell', () => {
    const { container } = render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(container.querySelector('main')).toBeNull();
  });
});
