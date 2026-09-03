import { render, screen } from '@testing-library/react';
import DeckPage from './index';

describe('Ver el bicho', () => {
  test('Renders with a ', () => {
    render(<DeckPage />);
    expect(screen.getByText('Mazos')).toBeInTheDocument();
  });
});
