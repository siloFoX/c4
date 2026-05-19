import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  DEFAULT_PLAYBACK_RATES,
  DEFAULT_PLAYBACK_RATE,
  DEFAULT_SEEK_STEP,
  DEFAULT_VOLUME,
  DEFAULT_VOLUME_STEP,
  VideoPlayer,
  clampSeek,
  clampVolume,
  formatVideoTime,
  nextPlaybackRate,
} from './video-player';
import type { VideoPlayerHandle } from './video-player';

beforeEach(() => {
  // jsdom does not implement these on HTMLMediaElement
  Object.defineProperty(window.HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn(function play(this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', {
        configurable: true,
        value: false,
      });
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    }),
  });
  Object.defineProperty(window.HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: vi.fn(function pause(this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', {
        configurable: true,
        value: true,
      });
      this.dispatchEvent(new Event('pause'));
    }),
  });
  Object.defineProperty(
    window.HTMLMediaElement.prototype,
    'requestPictureInPicture',
    {
      configurable: true,
      value: vi.fn(function requestPip(this: HTMLMediaElement) {
        this.dispatchEvent(new Event('enterpictureinpicture'));
        return Promise.resolve({} as PictureInPictureWindow);
      }),
    },
  );
});

afterEach(() => {
  cleanup();
});

describe('formatVideoTime', () => {
  it('formats 0 as 00:00', () => {
    expect(formatVideoTime(0)).toBe('00:00');
  });
  it('formats < 1 minute', () => {
    expect(formatVideoTime(7)).toBe('00:07');
    expect(formatVideoTime(45)).toBe('00:45');
  });
  it('formats minutes + seconds', () => {
    expect(formatVideoTime(65)).toBe('01:05');
    expect(formatVideoTime(125)).toBe('02:05');
  });
  it('formats hours when present', () => {
    expect(formatVideoTime(3600)).toBe('01:00:00');
    expect(formatVideoTime(3725)).toBe('01:02:05');
  });
  it('falls back to 00:00 for NaN / negative', () => {
    expect(formatVideoTime(Number.NaN)).toBe('00:00');
    expect(formatVideoTime(-5)).toBe('00:00');
  });
  it('floors fractional seconds', () => {
    expect(formatVideoTime(7.9)).toBe('00:07');
  });
});

describe('clampVolume', () => {
  it('clamps below 0', () => {
    expect(clampVolume(-0.5)).toBe(0);
  });
  it('clamps above 1', () => {
    expect(clampVolume(1.5)).toBe(1);
  });
  it('passes through 0-1', () => {
    expect(clampVolume(0.5)).toBe(0.5);
  });
  it('NaN falls back to default 1', () => {
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_VOLUME);
  });
});

describe('clampSeek', () => {
  it('clamps below 0', () => {
    expect(clampSeek(-3, 100)).toBe(0);
  });
  it('clamps above duration', () => {
    expect(clampSeek(150, 100)).toBe(100);
  });
  it('returns 0 for invalid duration', () => {
    expect(clampSeek(10, 0)).toBe(0);
    expect(clampSeek(10, Number.NaN)).toBe(0);
  });
  it('passes through valid', () => {
    expect(clampSeek(50, 100)).toBe(50);
  });
});

describe('nextPlaybackRate', () => {
  it('cycles forward', () => {
    expect(nextPlaybackRate(1, [0.5, 1, 1.5, 2])).toBe(1.5);
    expect(nextPlaybackRate(1.5, [0.5, 1, 1.5, 2])).toBe(2);
  });
  it('wraps at the end', () => {
    expect(nextPlaybackRate(2, [0.5, 1, 1.5, 2])).toBe(0.5);
  });
  it('falls back to first when rate not in list', () => {
    expect(nextPlaybackRate(3, [0.5, 1, 1.5, 2])).toBe(0.5);
  });
  it('returns current when rates is empty', () => {
    expect(nextPlaybackRate(1, [])).toBe(1);
  });
  it('uses DEFAULT_PLAYBACK_RATES when omitted', () => {
    expect(nextPlaybackRate(1)).toBe(1.25);
  });
});

describe('Constants', () => {
  it('DEFAULT_SEEK_STEP = 5', () => {
    expect(DEFAULT_SEEK_STEP).toBe(5);
  });
  it('DEFAULT_VOLUME_STEP = 0.1', () => {
    expect(DEFAULT_VOLUME_STEP).toBe(0.1);
  });
  it('DEFAULT_VOLUME = 1', () => {
    expect(DEFAULT_VOLUME).toBe(1);
  });
  it('DEFAULT_PLAYBACK_RATE = 1', () => {
    expect(DEFAULT_PLAYBACK_RATE).toBe(1);
  });
  it('DEFAULT_PLAYBACK_RATES includes 1', () => {
    expect(DEFAULT_PLAYBACK_RATES).toContain(1);
  });
});

describe('VideoPlayer component', () => {
  it('renders a region with default aria-label', () => {
    render(<VideoPlayer src="video.mp4" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Video player',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(<VideoPlayer src="video.mp4" ariaLabel="Demo reel" />);
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Demo reel',
    );
  });

  it('renders a <video> element with the given src', () => {
    const { container } = render(<VideoPlayer src="video.mp4" />);
    const video = container.querySelector(
      '[data-section="video-player-element"]',
    ) as HTMLVideoElement;
    expect(video).toBeInTheDocument();
    expect(video.getAttribute('src')).toBe('video.mp4');
  });

  it('poster prop sets the poster image', () => {
    const { container } = render(
      <VideoPlayer src="video.mp4" poster="poster.jpg" />,
    );
    const video = container.querySelector(
      '[data-section="video-player-element"]',
    ) as HTMLVideoElement;
    expect(video.getAttribute('poster')).toBe('poster.jpg');
  });

  it('preload defaults to "metadata"', () => {
    const { container } = render(<VideoPlayer src="video.mp4" />);
    const video = container.querySelector(
      '[data-section="video-player-element"]',
    ) as HTMLVideoElement;
    expect(video.getAttribute('preload')).toBe('metadata');
  });

  it('renders controls bar by default', () => {
    const { container } = render(<VideoPlayer src="video.mp4" />);
    expect(
      container.querySelector('[data-section="video-player-controls"]'),
    ).toBeInTheDocument();
  });

  it('controls=false hides the controls bar', () => {
    const { container } = render(
      <VideoPlayer src="video.mp4" controls={false} />,
    );
    expect(
      container.querySelector('[data-section="video-player-controls"]'),
    ).toBeNull();
  });

  it('play button toggles play state', () => {
    render(<VideoPlayer src="video.mp4" />);
    const playBtn = screen.getByLabelText('Play');
    fireEvent.click(playBtn);
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
  });

  it('clicking pause when playing reverts to play icon', () => {
    render(<VideoPlayer src="video.mp4" />);
    fireEvent.click(screen.getByLabelText('Play'));
    fireEvent.click(screen.getByLabelText('Pause'));
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('mute button toggles', () => {
    render(<VideoPlayer src="video.mp4" />);
    fireEvent.click(screen.getByLabelText('Mute'));
    expect(screen.getByLabelText('Unmute')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Unmute'));
    expect(screen.getByLabelText('Mute')).toBeInTheDocument();
  });

  it('volume slider change updates data-muted when 0', () => {
    const onVolumeChange = vi.fn();
    render(
      <VideoPlayer
        src="video.mp4"
        onVolumeChange={onVolumeChange}
      />,
    );
    const volume = screen.getByLabelText('Volume') as HTMLInputElement;
    fireEvent.change(volume, { target: { value: '0' } });
    expect(onVolumeChange).toHaveBeenCalledWith(0, true);
  });

  it('volume slider mid-value reports unmuted', () => {
    const onVolumeChange = vi.fn();
    render(
      <VideoPlayer
        src="video.mp4"
        onVolumeChange={onVolumeChange}
      />,
    );
    const volume = screen.getByLabelText('Volume') as HTMLInputElement;
    fireEvent.change(volume, { target: { value: '0.4' } });
    expect(onVolumeChange).toHaveBeenLastCalledWith(0.4, false);
  });

  it('playback-rate select updates rate', () => {
    const onRateChange = vi.fn();
    render(
      <VideoPlayer
        src="video.mp4"
        onPlaybackRateChange={onRateChange}
      />,
    );
    const rate = screen.getByLabelText(
      'Playback speed',
    ) as HTMLSelectElement;
    fireEvent.change(rate, { target: { value: '1.5' } });
    expect(onRateChange).toHaveBeenCalledWith(1.5);
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-rate',
      '1.5',
    );
  });

  it('playback-rate select renders all rates', () => {
    render(
      <VideoPlayer
        src="video.mp4"
        playbackRates={[0.5, 1, 2]}
      />,
    );
    const select = screen.getByLabelText(
      'Playback speed',
    ) as HTMLSelectElement;
    const opts = Array.from(select.querySelectorAll('option')).map(
      (o) => o.value,
    );
    expect(opts).toEqual(['0.5', '1', '2']);
  });

  it('Space toggles play (default focus on region)', () => {
    render(<VideoPlayer src="video.mp4" />);
    const region = screen.getByRole('region');
    fireEvent.keyDown(region, { key: ' ' });
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
  });

  it('K toggles play', () => {
    render(<VideoPlayer src="video.mp4" />);
    const region = screen.getByRole('region');
    fireEvent.keyDown(region, { key: 'k' });
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
  });

  it('M toggles mute', () => {
    render(<VideoPlayer src="video.mp4" />);
    const region = screen.getByRole('region');
    fireEvent.keyDown(region, { key: 'm' });
    expect(screen.getByLabelText('Unmute')).toBeInTheDocument();
  });

  it('ArrowUp raises volume by step', () => {
    const onVolumeChange = vi.fn();
    render(
      <VideoPlayer
        src="video.mp4"
        defaultVolume={0.5}
        volumeStep={0.2}
        onVolumeChange={onVolumeChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), { key: 'ArrowUp' });
    // 0.5 + 0.2 = 0.7 (with floating point error allowed)
    const [vol, mute] = onVolumeChange.mock.calls[0]!;
    expect(vol).toBeCloseTo(0.7, 5);
    expect(mute).toBe(false);
  });

  it('ArrowDown lowers volume by step', () => {
    const onVolumeChange = vi.fn();
    render(
      <VideoPlayer
        src="video.mp4"
        defaultVolume={0.5}
        volumeStep={0.2}
        onVolumeChange={onVolumeChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), {
      key: 'ArrowDown',
    });
    const [vol] = onVolumeChange.mock.calls[0]!;
    expect(vol).toBeCloseTo(0.3, 5);
  });

  it('ArrowDown at 0 stays at 0 (muted)', () => {
    const onVolumeChange = vi.fn();
    render(
      <VideoPlayer
        src="video.mp4"
        defaultVolume={0}
        onVolumeChange={onVolumeChange}
      />,
    );
    fireEvent.keyDown(screen.getByRole('region'), {
      key: 'ArrowDown',
    });
    expect(onVolumeChange).toHaveBeenCalledWith(0, true);
  });

  it('P triggers picture-in-picture toggle', () => {
    const { container } = render(<VideoPlayer src="video.mp4" />);
    const video = container.querySelector(
      '[data-section="video-player-element"]',
    ) as HTMLVideoElement & {
      requestPictureInPicture: () => Promise<unknown>;
    };
    fireEvent.keyDown(screen.getByRole('region'), { key: 'p' });
    expect(video.requestPictureInPicture).toHaveBeenCalled();
  });

  it('clicking PiP button requests picture-in-picture', () => {
    const { container } = render(<VideoPlayer src="video.mp4" />);
    const video = container.querySelector(
      '[data-section="video-player-element"]',
    ) as HTMLVideoElement & {
      requestPictureInPicture: () => Promise<unknown>;
    };
    fireEvent.click(screen.getByLabelText('Picture in picture'));
    expect(video.requestPictureInPicture).toHaveBeenCalled();
  });

  it('caption renders when supplied', () => {
    render(
      <VideoPlayer src="video.mp4" caption="Director's cut" />,
    );
    expect(screen.getByText("Director's cut")).toBeInTheDocument();
  });

  it('region data attrs reflect state', () => {
    render(<VideoPlayer src="video.mp4" />);
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-playing', 'false');
    expect(region).toHaveAttribute('data-muted', 'false');
    expect(region).toHaveAttribute('data-pip', 'false');
    expect(region).toHaveAttribute('data-rate', '1');
  });

  it('region carries data-section and tabIndex=0', () => {
    render(<VideoPlayer src="video.mp4" />);
    const region = screen.getByRole('region');
    expect(region).toHaveAttribute('data-section', 'video-player');
    expect(region.tabIndex).toBe(0);
  });

  it('ArrowRight does not break when duration is 0 (no metadata yet)', () => {
    render(<VideoPlayer src="video.mp4" />);
    // should not throw
    expect(() =>
      fireEvent.keyDown(screen.getByRole('region'), {
        key: 'ArrowRight',
      }),
    ).not.toThrow();
  });

  it('exposes a stable displayName', () => {
    expect(VideoPlayer.displayName).toBe('VideoPlayer');
  });

  it('forwards imperative handle (play/pause/seek/getCurrent/getDuration)', () => {
    const ref = createRef<VideoPlayerHandle>();
    render(<VideoPlayer ref={ref} src="video.mp4" />);
    expect(typeof ref.current?.play).toBe('function');
    expect(typeof ref.current?.pause).toBe('function');
    expect(typeof ref.current?.seek).toBe('function');
    expect(typeof ref.current?.getCurrentTime).toBe('function');
    expect(typeof ref.current?.getDuration).toBe('function');
    expect(typeof ref.current?.toggleMute).toBe('function');
    expect(typeof ref.current?.togglePictureInPicture).toBe(
      'function',
    );
  });

  it('imperative ref.play() calls the underlying play', async () => {
    const ref = createRef<VideoPlayerHandle>();
    const { container } = render(
      <VideoPlayer ref={ref} src="video.mp4" />,
    );
    const video = container.querySelector(
      '[data-section="video-player-element"]',
    ) as HTMLVideoElement & { play: () => Promise<void> };
    await ref.current?.play();
    expect(video.play).toHaveBeenCalled();
  });
});
