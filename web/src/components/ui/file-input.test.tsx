import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileInput } from './file-input';

function makeFile(
  name: string,
  size: number,
  type: string,
): File {
  const f = new File([new Uint8Array(size)], name, { type });
  // jsdom respects the Blob byte length; assert here for sanity.
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

function dropFiles(target: Element, files: File[]) {
  const dataTransfer = {
    files,
    items: files.map((f) => ({ kind: 'file', type: f.type, getAsFile: () => f })),
    types: ['Files'],
  };
  fireEvent.drop(target, { dataTransfer });
}

describe('<FileInput>', () => {
  it('renders label + hint', () => {
    render(<FileInput label="Upload" hint="JSON or YAML" />);
    expect(screen.getByText('Upload')).toBeInTheDocument();
    expect(screen.getByText('JSON or YAML')).toBeInTheDocument();
  });

  it('renders the error slot text in a role=alert region', () => {
    render(<FileInput label="Upload" error="Boom" />);
    const alertEl = screen.getByRole('alert');
    expect(alertEl).toHaveTextContent('Boom');
  });

  it('click on the dropzone triggers a click on the hidden file input', () => {
    const { container } = render(<FileInput label="Upload" />);
    const dropzone = screen.getByRole('button', { name: /upload/i });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const spy = vi.spyOn(fileInput, 'click');
    fireEvent.click(dropzone);
    expect(spy).toHaveBeenCalled();
  });

  it('drag-and-drop of a valid file fires onFiles with that file', () => {
    const onFiles = vi.fn();
    render(<FileInput label="Upload" onFiles={onFiles} />);
    const dropzone = screen.getByRole('button', { name: /upload/i });
    const f = makeFile('a.json', 10, 'application/json');
    dropFiles(dropzone, [f]);
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0][0].name).toBe('a.json');
  });

  it('rejects a file exceeding maxSize via onError (and does not call onFiles)', () => {
    const onFiles = vi.fn();
    const onError = vi.fn();
    render(
      <FileInput label="Upload" maxSize={5} onFiles={onFiles} onError={onError} />,
    );
    const dropzone = screen.getByRole('button', { name: /upload/i });
    dropFiles(dropzone, [makeFile('big.bin', 100, 'application/octet-stream')]);
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toMatch(/too large/i);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('rejects multiple files when multiple=false via onError', () => {
    const onFiles = vi.fn();
    const onError = vi.fn();
    render(<FileInput label="Upload" onFiles={onFiles} onError={onError} />);
    const dropzone = screen.getByRole('button', { name: /upload/i });
    dropFiles(dropzone, [
      makeFile('a.json', 1, 'application/json'),
      makeFile('b.json', 1, 'application/json'),
    ]);
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toMatch(/one file/i);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('accept filter rejects a non-matching MIME', () => {
    const onFiles = vi.fn();
    const onError = vi.fn();
    render(
      <FileInput
        label="Upload"
        accept="application/json"
        onFiles={onFiles}
        onError={onError}
      />,
    );
    const dropzone = screen.getByRole('button', { name: /upload/i });
    dropFiles(dropzone, [makeFile('a.png', 1, 'image/png')]);
    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toMatch(/not accepted/i);
    expect(onFiles).not.toHaveBeenCalled();
  });

  it('accept filter passes when MIME prefix matches (image/*)', () => {
    const onFiles = vi.fn();
    const onError = vi.fn();
    render(
      <FileInput
        label="Upload"
        accept="image/*"
        onFiles={onFiles}
        onError={onError}
      />,
    );
    const dropzone = screen.getByRole('button', { name: /upload/i });
    dropFiles(dropzone, [makeFile('a.png', 1, 'image/png')]);
    expect(onError).not.toHaveBeenCalled();
    expect(onFiles).toHaveBeenCalledTimes(1);
  });

  it('disabled state ignores drop events', () => {
    const onFiles = vi.fn();
    const onError = vi.fn();
    render(
      <FileInput label="Upload" disabled onFiles={onFiles} onError={onError} />,
    );
    const dropzone = screen.getByRole('button', { name: /upload/i });
    dropFiles(dropzone, [makeFile('a.json', 1, 'application/json')]);
    expect(onFiles).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('aria-describedby includes both hint and error ids', () => {
    render(<FileInput label="Upload" hint="hint text" error="err text" />);
    const dropzone = screen.getByRole('button', { name: /upload/i });
    const describedBy = dropzone.getAttribute('aria-describedby') ?? '';
    const hintEl = screen.getByText('hint text');
    const errorEl = screen.getByRole('alert');
    const ids = describedBy.split(/\s+/);
    expect(ids).toContain(hintEl.id);
    expect(ids).toContain(errorEl.id);
  });

  it('merges caller-provided className onto the dropzone', () => {
    render(<FileInput label="Upload" className="extra-tag" />);
    const dropzone = screen.getByRole('button', { name: /upload/i });
    expect(dropzone).toHaveClass('extra-tag');
  });

  it('forwards a ref to the visible dropzone div (not the hidden input)', () => {
    const ref = createRef<HTMLDivElement>();
    render(<FileInput label="Upload" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('role')).toBe('button');
  });

  it('drag enter toggles data-active=true and drag leave resets it', () => {
    render(<FileInput label="Upload" />);
    const dropzone = screen.getByRole('button', { name: /upload/i });
    expect(dropzone).toHaveAttribute('data-active', 'false');
    fireEvent.dragEnter(dropzone);
    expect(dropzone).toHaveAttribute('data-active', 'true');
    fireEvent.dragLeave(dropzone);
    expect(dropzone).toHaveAttribute('data-active', 'false');
  });

  it('Enter key on the dropzone opens the picker', () => {
    const { container } = render(<FileInput label="Upload" />);
    const dropzone = screen.getByRole('button', { name: /upload/i });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const spy = vi.spyOn(fileInput, 'click');
    fireEvent.keyDown(dropzone, { key: 'Enter' });
    expect(spy).toHaveBeenCalled();
  });

  it('exposes a stable displayName', () => {
    expect(FileInput.displayName).toBe('FileInput');
  });
});
