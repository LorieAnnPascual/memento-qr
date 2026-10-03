import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { QRStyleConfig } from '@/lib/qr/generator';

vi.mock('@/lib/qr/frames/sample-qr', () => ({
  getSampleQr: () =>
    Promise.resolve({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100"/></svg>',
      modules: 29,
    }),
}));

import { FramePicker } from '@/components/qr/frame-picker';
import { FRAME_IDS } from '@/lib/qr/frames/registry';

/** Keeps the style in state like the designer does, and exposes the latest value. */
function Harness({ initial = {}, onValue }: { initial?: QRStyleConfig; onValue: (v: QRStyleConfig) => void }) {
  const [style, setStyle] = useState<QRStyleConfig>(initial);
  return (
    <FramePicker
      value={style}
      onChange={(next) => {
        setStyle(next);
        onValue(next);
      }}
    />
  );
}

describe('FramePicker', () => {
  it('offers None and every design as radios inside a labelled group', () => {
    render(<Harness onValue={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: 'Frame' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /none/i })).toBeChecked();
    for (const id of FRAME_IDS) expect(screen.getByTestId(`qr-frame-${id}`)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(FRAME_IDS.length + 1);
    expect(screen.queryByTestId('frame-options')).not.toBeInTheDocument();
  });

  it('shows the occasion groups', () => {
    render(<Harness onValue={() => {}} />);
    for (const label of ['Everyday', 'Celebrations', 'Remembrance', 'Pets']) {
      expect(screen.getByRole('group', { name: label })).toBeInTheDocument();
    }
  });

  it('picking a design stores it with its own colours and caption, then shows the options', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await userEvent.click(screen.getByTestId('qr-frame-wedding'));

    const stored = onValue.mock.calls.at(-1)![0] as QRStyleConfig;
    expect(stored.frame).toMatchObject({ id: 'wedding', caption: 'Scan for our story' });
    expect(stored.frame?.color).toMatch(/^#/);
    expect(screen.getByRole('radio', { name: /wedding/i })).toBeChecked();
    expect(screen.getByTestId('frame-options')).toBeInTheDocument();
  });

  it('changes the colours and the caption, and clearing the caption means none', async () => {
    const onValue = vi.fn();
    render(<Harness initial={{ frame: { id: 'simple' } }} onValue={onValue} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Frame color (hex code)' }), { target: { value: '#112233' } });
    expect((onValue.mock.calls.at(-1)![0] as QRStyleConfig).frame?.color).toBe('#112233');

    fireEvent.change(screen.getByRole('textbox', { name: 'Accent color (hex code)' }), { target: { value: '#445566' } });
    expect((onValue.mock.calls.at(-1)![0] as QRStyleConfig).frame?.accentColor).toBe('#445566');

    const caption = screen.getByLabelText('Caption');
    expect(caption).toHaveAttribute('maxlength', '50');
    fireEvent.change(caption, { target: { value: 'Ana & Ben' } });
    expect((onValue.mock.calls.at(-1)![0] as QRStyleConfig).frame?.caption).toBe('Ana & Ben');

    fireEvent.change(caption, { target: { value: '' } });
    expect((onValue.mock.calls.at(-1)![0] as QRStyleConfig).frame?.caption).toBe('');
  });

  it('allows a caption of 50 characters, and gently warns once it is long enough to get small', async () => {
    render(<Harness initial={{ frame: { id: 'simple', caption: 'Our day' } }} onValue={() => {}} />);
    expect(screen.queryByTestId('qr-frame-caption-long')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'x'.repeat(24) } });
    expect(screen.queryByTestId('qr-frame-caption-long')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Caption'), { target: { value: 'x'.repeat(40) } });
    expect(screen.getByTestId('qr-frame-caption-long')).toHaveTextContent('text shrinks to fit');
  });

  it('keeps a hand-written caption when another design is picked', async () => {
    const onValue = vi.fn();
    render(<Harness initial={{ frame: { id: 'simple', caption: 'Our day' } }} onValue={onValue} />);
    await userEvent.click(screen.getByTestId('qr-frame-pets'));
    expect((onValue.mock.calls.at(-1)![0] as QRStyleConfig).frame).toMatchObject({ id: 'pets', caption: 'Our day' });
  });

  it('removes the frame with the button or with None, leaving the rest of the style alone', async () => {
    const onValue = vi.fn();
    render(<Harness initial={{ dotStyle: 'dots', frame: { id: 'baby' } }} onValue={onValue} />);

    await userEvent.click(screen.getByRole('button', { name: 'Remove frame' }));
    const removed = onValue.mock.calls.at(-1)![0] as QRStyleConfig;
    expect(removed.frame).toBeUndefined();
    expect('frame' in removed).toBe(false);
    expect(removed.dotStyle).toBe('dots');
    expect(screen.getByRole('radio', { name: /none/i })).toBeChecked();
  });

  it('is operable with the keyboard', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    screen.getByRole('radio', { name: /none/i }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect((onValue.mock.calls.at(-1)![0] as QRStyleConfig).frame?.id).toBeTruthy();
  });

  it('ignores an unknown saved frame and shows None', () => {
    // @ts-expect-error a design that no longer exists
    render(<Harness initial={{ frame: { id: 'retired' } }} onValue={() => {}} />);
    expect(screen.getByRole('radio', { name: /none/i })).toBeChecked();
  });
});
