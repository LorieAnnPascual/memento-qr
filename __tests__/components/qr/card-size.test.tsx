import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { canvasSizeForMm, createDefaultCustomCard, resizeDesign, type CustomCardDesign } from '@/lib/qr/card-builder-types';
import { CardSizeControl } from '@/components/qr/card-builder/card-size-control';
import { PrintGuides, PrintGuidesLegend, SAFE_MARGIN_MM } from '@/components/qr/card-builder/print-guides';

describe('canvasSizeForMm', () => {
  it('keeps the proportions and fits the long side to 600 px', () => {
    expect(canvasSizeForMm(88.9, 50.8)).toEqual({ width: 600, height: 343 });
    expect(canvasSizeForMm(50.8, 88.9)).toEqual({ width: 343, height: 600 });
    expect(canvasSizeForMm(70, 70)).toEqual({ width: 600, height: 600 });
  });

  it('accepts another long side', () => {
    expect(canvasSizeForMm(100, 50, 400)).toEqual({ width: 400, height: 200 });
  });
});

describe('resizeDesign', () => {
  const base: CustomCardDesign = {
    width: 400,
    height: 600,
    elements: [
      { id: 'qr', type: 'qr', x: 100, y: 90, width: 200, height: 200, zIndex: 0 },
      { id: 't', type: 'text', x: 60, y: 450, width: 280, height: 40, zIndex: 1, text: 'Hello', color: '#000', fontFamily: 'sans' as never, fontSize: 24, bold: false, align: 'center' },
      { id: 'b', type: 'shape', x: 0, y: 0, width: 400, height: 60, zIndex: 2, shape: 'rectangle', color: '#f00', opacity: 100 },
    ],
  };

  it('changes the canvas size', () => {
    const next = resizeDesign(base, 600, 343);

    expect(next).toMatchObject({ width: 600, height: 343 });
  });

  it('keeps the QR square and centred on the same relative spot', () => {
    const next = resizeDesign(base, 600, 343);
    const qr = next.elements.find((e) => e.id === 'qr')!;

    expect(qr.width).toBe(qr.height);
    // Was centred horizontally (200/400); still is.
    expect(qr.x + qr.width / 2).toBeCloseTo(300, 5);
  });

  it('scales text with the smaller side so it stays readable', () => {
    const next = resizeDesign(base, 600, 343);
    const text = next.elements.find((e) => e.id === 't') as Extract<CustomCardDesign['elements'][number], { type: 'text' }>;

    // sy = 343/600 is the smaller ratio, so 24 becomes about 14.
    expect(text.fontSize).toBe(Math.round(24 * (343 / 600)));
  });

  it('stretches a full-width banner with the canvas', () => {
    const banner = resizeDesign(base, 600, 343).elements.find((e) => e.id === 'b')!;

    expect(banner.x).toBe(0);
    expect(banner.width).toBe(600);
  });

  it('never leaves anything outside the new canvas', () => {
    for (const [w, h] of [[300, 200], [600, 343], [343, 600], [200, 200]] as const) {
      for (const el of resizeDesign(base, w, h).elements) {
        expect(el.x).toBeGreaterThanOrEqual(0);
        expect(el.y).toBeGreaterThanOrEqual(0);
        expect(el.x + el.width).toBeLessThanOrEqual(w + 1e-6);
        expect(el.y + el.height).toBeLessThanOrEqual(h + 1e-6);
      }
    }
  });

  it('never makes text vanishingly small', () => {
    const tiny = resizeDesign(base, 40, 30).elements.find((e) => e.id === 't') as { fontSize: number };

    expect(tiny.fontSize).toBeGreaterThanOrEqual(6);
  });

  it('keeps the physical size and bleed, and does not change the original', () => {
    const sized = { ...base, sizeMm: { width: 60, height: 90 }, bleedMm: 3 };
    const next = resizeDesign(sized, 343, 600);

    expect(next.sizeMm).toEqual({ width: 60, height: 90 });
    expect(next.bleedMm).toBe(3);
    expect(base.width).toBe(400);
  });

  it('works on the default design', () => {
    const next = resizeDesign(createDefaultCustomCard('vertical'), 600, 343);

    expect(next.elements).toHaveLength(1);
  });
});

describe('CardSizeControl', () => {
  const free: CustomCardDesign = createDefaultCustomCard('vertical');
  const sized: CustomCardDesign = { ...createDefaultCustomCard('horizontal'), sizeMm: { width: 88.9, height: 50.8 }, bleedMm: 3 };

  function renderControl(design: CustomCardDesign, onChange = vi.fn(), onShowGuidesChange = vi.fn()) {
    render(<CardSizeControl design={design} onChange={onChange} showGuides onShowGuidesChange={onShowGuidesChange} />);
    return { onChange, onShowGuidesChange };
  }

  it('shows a free canvas without bleed or guide controls', () => {
    renderControl(free);

    expect(screen.getByRole('combobox', { name: 'Card size' })).toHaveTextContent('Free canvas, vertical');
    expect(screen.queryByLabelText('Bleed (mm)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Show print guides')).not.toBeInTheDocument();
  });

  it('recognises a preset size (in either orientation) and offers bleed and guides', () => {
    renderControl(sized);

    expect(screen.getByRole('combobox', { name: 'Card size' })).toHaveTextContent('Business card, US');
    expect(screen.getByLabelText('Bleed (mm)')).toHaveValue(3);
    expect(screen.getByLabelText('Show print guides')).toBeChecked();
  });

  it('applies a preset with the default bleed, keeping the card upright', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControl(free); // vertical

    await user.click(screen.getByRole('combobox', { name: 'Card size' }));
    await user.click(await screen.findByRole('option', { name: /Business card, EU/ }));

    // Vertical card: the short side becomes the width.
    expect(onChange).toHaveBeenCalledWith({ kind: 'size', widthMm: 55, heightMm: 85, bleedMm: 3 });
  });

  it('returns to a free canvas', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControl(sized);

    await user.click(screen.getByRole('combobox', { name: 'Card size' }));
    await user.click(await screen.findByRole('option', { name: 'Free canvas, horizontal' }));

    expect(onChange).toHaveBeenCalledWith({ kind: 'free', orientation: 'horizontal' });
  });

  it('turns a preset card upright with the Portrait switch', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControl(sized);

    await user.click(screen.getByLabelText('Portrait'));

    expect(onChange).toHaveBeenCalledWith({ kind: 'size', widthMm: 50.8, heightMm: 88.9, bleedMm: 3 });
  });

  it('lets you type a custom size in millimetres and applies it only when asked', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControl(free);

    await user.click(screen.getByRole('combobox', { name: 'Card size' }));
    await user.click(await screen.findByRole('option', { name: 'Custom size…' }));
    await user.clear(screen.getByLabelText('Width'));
    await user.type(screen.getByLabelText('Width'), '100');
    await user.clear(screen.getByLabelText('Height'));
    await user.type(screen.getByLabelText('Height'), '60');

    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Apply size' }));

    expect(onChange).toHaveBeenCalledWith({ kind: 'size', widthMm: 100, heightMm: 60, bleedMm: 3 });
  });

  it('converts inches to millimetres', async () => {
    const user = userEvent.setup();
    const { onChange } = renderControl(free);

    await user.click(screen.getByRole('combobox', { name: 'Card size' }));
    await user.click(await screen.findByRole('option', { name: 'Custom size…' }));
    await user.click(screen.getByRole('combobox', { name: 'Unit' }));
    await user.click(await screen.findByRole('option', { name: 'in' }));
    await user.clear(screen.getByLabelText('Width'));
    await user.type(screen.getByLabelText('Width'), '4');
    await user.clear(screen.getByLabelText('Height'));
    await user.type(screen.getByLabelText('Height'), '6');
    await user.click(screen.getByRole('button', { name: 'Apply size' }));

    const change = onChange.mock.calls[0][0];
    expect(change.kind).toBe('size');
    expect(change.widthMm).toBeCloseTo(101.6, 6);
    expect(change.heightMm).toBeCloseTo(152.4, 6);
  });

  it('refuses a size that is too small or too big', async () => {
    const user = userEvent.setup();
    renderControl(free);

    await user.click(screen.getByRole('combobox', { name: 'Card size' }));
    await user.click(await screen.findByRole('option', { name: 'Custom size…' }));
    await user.clear(screen.getByLabelText('Width'));
    await user.type(screen.getByLabelText('Width'), '5');

    expect(screen.getByRole('alert')).toHaveTextContent(/between 20 and 500 mm/);
    expect(screen.getByRole('button', { name: 'Apply size' })).toBeDisabled();
  });

  it('changes the bleed and keeps the size', () => {
    const { onChange } = renderControl(sized);

    fireEvent.change(screen.getByLabelText('Bleed (mm)'), { target: { value: '5' } });

    expect(onChange).toHaveBeenLastCalledWith({ kind: 'size', widthMm: 88.9, heightMm: 50.8, bleedMm: 5 });
  });

  it('toggles the guides', async () => {
    const user = userEvent.setup();
    const { onShowGuidesChange } = renderControl(sized);

    await user.click(screen.getByLabelText('Show print guides'));

    expect(onShowGuidesChange).toHaveBeenCalledWith(false);
  });
});

describe('PrintGuides', () => {
  const props = { widthMm: 90, heightMm: 50, canvasWidthPx: 600, canvasHeightPx: 333, backgroundStyle: { backgroundColor: '#123456' } };

  it('puts the card inside guides with crop marks, a cut line and a safe area', () => {
    const { container } = render(
      <PrintGuides {...props} bleedMm={3}>
        <div data-testid="card" />
      </PrintGuides>,
    );

    expect(screen.getByTestId('card')).toBeInTheDocument();
    const lines = screen.getByTestId('print-guides-lines');
    expect(lines.querySelectorAll('line')).toHaveLength(8); // 2 crop marks at each of 4 corners
    // Bleed, cut line and safe area are drawn as rectangles.
    expect(lines.querySelectorAll('rect')).toHaveLength(3);
    expect(container.querySelector('[data-testid="print-guides-bleed"]')).toBeInTheDocument();
  });

  it('leaves out the bleed area and its outline when there is no bleed', () => {
    render(
      <PrintGuides {...props} bleedMm={0}>
        <div />
      </PrintGuides>,
    );

    expect(screen.queryByTestId('print-guides-bleed')).not.toBeInTheDocument();
    expect(screen.getByTestId('print-guides-lines').querySelectorAll('rect')).toHaveLength(2);
  });

  it('paints the bleed with the card background', () => {
    render(
      <PrintGuides {...props} bleedMm={3}>
        <div />
      </PrintGuides>,
    );

    expect(screen.getByTestId('print-guides-bleed')).toHaveStyle({ backgroundColor: '#123456' });
  });

  it('is hidden from screen readers (decoration only)', () => {
    render(
      <PrintGuides {...props} bleedMm={3}>
        <div />
      </PrintGuides>,
    );

    expect(screen.getByTestId('print-guides-lines')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('PrintGuidesLegend', () => {
  it('explains the guides, and mentions bleed only when there is one', () => {
    const { rerender } = render(<PrintGuidesLegend bleedMm={3} />);
    const key = screen.getByRole('list', { name: 'Print guides key' });

    expect(within(key).getByText(/Cut line/)).toBeInTheDocument();
    expect(within(key).getByText(new RegExp(`Safe area \\(${SAFE_MARGIN_MM} mm in\\)`))).toBeInTheDocument();
    expect(within(key).getByText(/Bleed \(3 mm\)/)).toBeInTheDocument();
    expect(within(key).getByText(/Crop marks/)).toBeInTheDocument();

    rerender(<PrintGuidesLegend bleedMm={0} />);
    expect(screen.queryByText(/Bleed \(/)).not.toBeInTheDocument();
  });
});
