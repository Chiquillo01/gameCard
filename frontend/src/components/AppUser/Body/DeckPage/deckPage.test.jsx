import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeckPage from './index';

describe('DeckPage', () => {
  test('shows the page title and the deck actions', () => {
    render(
      <MemoryRouter>
        <DeckPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('MIS MAZOS')).toBeInTheDocument();
    expect(screen.getByText('+ Nuevo mazo')).toBeInTheDocument();
    expect(screen.getByText('Eliminar mazos')).toBeInTheDocument();
  });
});
