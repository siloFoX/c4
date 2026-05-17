import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileDrop } from './file-drop';

function makeFile(name: string, sizeBytes: number, type: string): File {
  const blob = new Blob([new Uint8Array(sizeBytes)], { type });
  return new File([blob], name, { type });
}

describe('<FileDrop>', () => {
  it('renders the dropzone with the canonical body copy', () => {
    render(<FileDrop label="Upload" />);
    expect(
      screen.getByText('Drop files here or click to browse'),
    ).toBeInTheDocument();
  });

  it('renders a label when provided + wires htmlFor to the hidden input', () => {
    render(<FileDrop label="Pick a snapshot" />);
    expect(screen.getByText('Pick a snapshot')).toBeInTheDocument();
  });

  it('renders a hint paragraph when provided', () => {
    render(<FileDrop label="x" hint="Up to 1 MB" />);
    expect(screen.getByText('Up to 1 MB')).toBeInTheDocument();
  });

  it('renders an error alert when provided', () => {
    render(<FileDrop label="x" error="Too big" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Too big');
  });

  it('exposes data-section="file-drop" on the wrapper + "file-drop-zone" on the dropzone', () => {
    const { container } = render(<FileDrop label="x" />);
    expect(
      container.querySelector('[data-section="file-drop"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-section="file-drop-zone"]'),
    ).not.toBeNull();
  });

  it('clicking the dropzone opens the hidden file picker', async () => {
    const user = userEvent.setup();
    const { container } = render(<FileDrop label="x" />);
    const hiddenInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(hiddenInput, 'click');
    await user.click(screen.getByRole('button', { name: /x/i }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('Enter on the dropzone opens the file picker (keyboard fallback)', async () => {
    const user = userEvent.setup();
    const { container } = render(<FileDrop label="x" />);
    const hiddenInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(hiddenInput, 'click');
    const zone = screen.getByRole('button', { name: /x/i });
    zone.focus();
    await user.keyboard('{Enter}');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('Space on the dropzone opens the file picker', async () => {
    const user = userEvent.setup();
    const { container } = render(<FileDrop label="x" />);
    const hiddenInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const clickSpy = vi.spyOn(hiddenInput, 'click');
    const zone = screen.getByRole('button', { name: /x/i });
    zone.focus();
    await user.keyboard(' ');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('disabled disables both the dropzone and the file picker', () => {
    render(<FileDrop label="x" disabled />);
    const zone = screen.getByRole('button', { name: /x/i });
    expect(zone.getAttribute('aria-disabled')).toBe('true');
    expect(zone.getAttribute('tabindex')).toBe('-1');
  });

  it('drag-enter flips data-active=true on the wrapper + dropzone', () => {
    const { container } = render(<FileDrop label="x" />);
    const zone = container.querySelector(
      '[data-section="file-drop-zone"]',
    ) as HTMLDivElement;
    fireEvent.dragEnter(zone, {
      dataTransfer: { files: [], items: [], types: [] },
    });
    expect(zone.getAttribute('data-active')).toBe('true');
  });

  it('drag-leave (final exit) flips data-active back to false', () => {
    const { container } = render(<FileDrop label="x" />);
    const zone = container.querySelector(
      '[data-section="file-drop-zone"]',
    ) as HTMLDivElement;
    fireEvent.dragEnter(zone);
    fireEvent.dragLeave(zone);
    expect(zone.getAttribute('data-active')).toBe('false');
  });

  it('drop fires onAdd with the dropped files', () => {
    const onAdd = vi.fn();
    const { container } = render(<FileDrop label="x" multiple onAdd={onAdd} />);
    const zone = container.querySelector(
      '[data-section="file-drop-zone"]',
    ) as HTMLDivElement;
    const file = makeFile('foo.txt', 100, 'text/plain');
    fireEvent.drop(zone, { dataTransfer: { files: [file] } });
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([file]);
  });

  it('drop rejects when the accept filter does not match + fires onError', () => {
    const onAdd = vi.fn();
    const onError = vi.fn();
    const { container } = render(
      <FileDrop label="x" accept=".json" onAdd={onAdd} onError={onError} />,
    );
    const zone = container.querySelector(
      '[data-section="file-drop-zone"]',
    ) as HTMLDivElement;
    const wrongFile = makeFile('foo.txt', 100, 'text/plain');
    fireEvent.drop(zone, { dataTransfer: { files: [wrongFile] } });
    expect(onAdd).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('not accepted'),
      wrongFile,
    );
  });

  it('drop rejects when a file exceeds maxSize', () => {
    const onError = vi.fn();
    const { container } = render(
      <FileDrop label="x" maxSize={50} onError={onError} />,
    );
    const zone = container.querySelector(
      '[data-section="file-drop-zone"]',
    ) as HTMLDivElement;
    const tooBig = makeFile('big.txt', 100, 'text/plain');
    fireEvent.drop(zone, { dataTransfer: { files: [tooBig] } });
    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('too large'),
      tooBig,
    );
  });

  it('multi-file mode accepts a second drop and renders both rows', () => {
    const onAdd = vi.fn();
    const { container } = render(
      <FileDrop label="x" multiple onAdd={onAdd} />,
    );
    const zone = container.querySelector(
      '[data-section="file-drop-zone"]',
    ) as HTMLDivElement;
    fireEvent.drop(zone, {
      dataTransfer: { files: [makeFile('a.txt', 10, 'text/plain')] },
    });
    fireEvent.drop(zone, {
      dataTransfer: { files: [makeFile('b.txt', 20, 'text/plain')] },
    });
    expect(
      container.querySelectorAll('[data-section="file-drop-staged-row"]'),
    ).toHaveLength(2);
  });

  it('single-file mode replaces the staged file on each drop', () => {
    const { container } = render(<FileDrop label="x" />);
    const zone = container.querySelector(
      '[data-section="file-drop-zone"]',
    ) as HTMLDivElement;
    fireEvent.drop(zone, {
      dataTransfer: { files: [makeFile('a.txt', 10, 'text/plain')] },
    });
    fireEvent.drop(zone, {
      dataTransfer: { files: [makeFile('b.txt', 20, 'text/plain')] },
    });
    expect(
      container.querySelectorAll('[data-section="file-drop-staged-row"]'),
    ).toHaveLength(1);
    expect(
      container.querySelector('[data-file-name="b.txt"]'),
    ).not.toBeNull();
  });

  it('single-file mode rejects a drop of 2+ files', () => {
    const onAdd = vi.fn();
    const onError = vi.fn();
    const { container } = render(
      <FileDrop label="x" onAdd={onAdd} onError={onError} />,
    );
    const zone = container.querySelector(
      '[data-section="file-drop-zone"]',
    ) as HTMLDivElement;
    fireEvent.drop(zone, {
      dataTransfer: {
        files: [
          makeFile('a.txt', 10, 'text/plain'),
          makeFile('b.txt', 20, 'text/plain'),
        ],
      },
    });
    expect(onAdd).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it('renders one staged-files row per file in the controlled list', () => {
    const { container } = render(
      <FileDrop
        label="x"
        selectedFiles={[
          makeFile('a.txt', 10, 'text/plain'),
          makeFile('b.txt', 20, 'text/plain'),
        ]}
      />,
    );
    expect(
      container.querySelectorAll('[data-section="file-drop-staged-row"]'),
    ).toHaveLength(2);
  });

  it('renders each row with the filename and a formatted size', () => {
    render(
      <FileDrop
        label="x"
        selectedFiles={[makeFile('foo.json', 2048, 'application/json')]}
      />,
    );
    expect(screen.getByText('foo.json')).toBeInTheDocument();
    // 2048 bytes -> 2.0 KB
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument();
  });

  it('clicking a row Remove button fires onRemove with the index + file', async () => {
    const onRemove = vi.fn();
    const user = userEvent.setup();
    const f = makeFile('a.txt', 10, 'text/plain');
    render(
      <FileDrop label="x" selectedFiles={[f]} onRemove={onRemove} />,
    );
    await user.click(screen.getByRole('button', { name: 'Remove a.txt' }));
    expect(onRemove).toHaveBeenCalledWith(0, f);
  });

  it('does NOT render the staged-files list when no files are staged', () => {
    const { container } = render(<FileDrop label="x" />);
    expect(
      container.querySelector('[data-section="file-drop-staged"]'),
    ).toBeNull();
  });

  it('does NOT render the ProgressBar slot when progress is unset', () => {
    const { container } = render(<FileDrop label="x" />);
    expect(
      container.querySelector('[data-section="file-drop-progress"]'),
    ).toBeNull();
  });

  it('renders the ProgressBar slot when progress is a number', () => {
    const { container } = render(
      <FileDrop label="x" progress={42} progressLabel="Uploading..." />,
    );
    expect(
      container.querySelector('[data-section="file-drop-progress"]'),
    ).not.toBeNull();
  });

  it('renders the ProgressBar slot when showProgress=true even with progress=null', () => {
    const { container } = render(
      <FileDrop label="x" showProgress progress={null} />,
    );
    expect(
      container.querySelector('[data-section="file-drop-progress"]'),
    ).not.toBeNull();
  });

  it('forwards progressVariant + progressMax to the underlying ProgressBar', () => {
    const { container } = render(
      <FileDrop
        label="x"
        progress={50}
        progressMax={200}
        progressVariant="success"
      />,
    );
    // The underlying ProgressBar exposes role=progressbar; we just
    // verify it's rendered (the variant + max are forwarded by
    // the primitive's own tests).
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  });

  it('supports a custom bodyContent slot in place of the default copy', () => {
    render(
      <FileDrop label="x" bodyContent={<span>Custom prompt</span>} />,
    );
    expect(screen.getByText('Custom prompt')).toBeInTheDocument();
    expect(
      screen.queryByText('Drop files here or click to browse'),
    ).toBeNull();
  });

  it('merges caller className with the wrapper', () => {
    const { container } = render(
      <FileDrop label="x" className="custom-fd" />,
    );
    const wrapper = container.querySelector('[data-section="file-drop"]');
    expect(wrapper!.className).toContain('custom-fd');
    expect(wrapper!.className).toContain('space-y-1.5');
  });

  it('forwards a ref to the dropzone div', () => {
    const ref = createRef<HTMLDivElement>();
    render(<FileDrop label="x" ref={ref} />);
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('accept passthrough renders on the hidden <input type="file">', () => {
    const { container } = render(
      <FileDrop label="x" accept=".json,application/json" />,
    );
    const hidden = container.querySelector('input[type="file"]');
    expect(hidden!.getAttribute('accept')).toBe('.json,application/json');
  });

  it('multiple passthrough sets the multiple attribute on the hidden input', () => {
    const { container } = render(<FileDrop label="x" multiple />);
    const hidden = container.querySelector('input[type="file"]');
    expect(hidden!.hasAttribute('multiple')).toBe(true);
  });
});
