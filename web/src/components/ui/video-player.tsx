import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import {
  Pause,
  PictureInPicture2,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.437, TODO 11.419) VideoPlayer primitive.
//
// HTML5 video with a custom controls bar (play / pause,
// scrubber, time, volume, mute, playback-rate select,
// picture-in-picture). Keyboard shortcuts wired on the
// outer container so the player still responds when the
// underlying <video> element does not have focus.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface VideoPlayerHandle {
  play: () => Promise<void>;
  pause: () => void;
  seek: (time: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  toggleMute: () => void;
  togglePictureInPicture: () => Promise<void>;
}

export interface VideoPlayerProps {
  src: string;
  poster?: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  defaultVolume?: number;
  defaultPlaybackRate?: number;
  playbackRates?: number[];
  controls?: boolean;
  className?: string;
  ariaLabel?: string;
  seekStep?: number;
  volumeStep?: number;
  preload?: 'auto' | 'metadata' | 'none';
  caption?: ReactNode;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onVolumeChange?: (volume: number, muted: boolean) => void;
  onPlaybackRateChange?: (rate: number) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_PLAYBACK_RATES: readonly number[] = [
  0.5, 0.75, 1, 1.25, 1.5, 2,
];
export const DEFAULT_SEEK_STEP = 5;
export const DEFAULT_VOLUME_STEP = 0.1;
export const DEFAULT_VOLUME = 1;
export const DEFAULT_PLAYBACK_RATE = 1;

export function formatVideoTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

export function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VOLUME;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function clampSeek(time: number, duration: number): number {
  if (!Number.isFinite(time) || time < 0) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  if (time > duration) return duration;
  return time;
}

export function nextPlaybackRate(
  current: number,
  rates: readonly number[] = DEFAULT_PLAYBACK_RATES,
): number {
  if (rates.length === 0) return current;
  const idx = rates.findIndex((r) => r === current);
  if (idx < 0) return rates[0] ?? current;
  const nextIdx = (idx + 1) % rates.length;
  return rates[nextIdx] ?? current;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(
    {
      src,
      poster,
      autoPlay = false,
      loop = false,
      muted: mutedProp,
      defaultVolume = DEFAULT_VOLUME,
      defaultPlaybackRate = DEFAULT_PLAYBACK_RATE,
      playbackRates = DEFAULT_PLAYBACK_RATES,
      controls = true,
      className,
      ariaLabel = 'Video player',
      seekStep = DEFAULT_SEEK_STEP,
      volumeStep = DEFAULT_VOLUME_STEP,
      preload = 'metadata',
      caption,
      onPlay,
      onPause,
      onEnded,
      onTimeUpdate,
      onVolumeChange,
      onPlaybackRateChange,
    },
    forwardedRef,
  ) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [currentTime, setCurrentTime] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [volume, setVolume] = useState<number>(() =>
      clampVolume(defaultVolume),
    );
    const [isMuted, setIsMuted] = useState<boolean>(mutedProp ?? false);
    const [rate, setRate] = useState<number>(defaultPlaybackRate);
    const [isPip, setIsPip] = useState<boolean>(false);

    // Apply initial playback rate when the metadata is ready
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      video.playbackRate = rate;
    }, [rate]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = volume;
      video.muted = isMuted;
    }, [volume, isMuted]);

    const handlePlay = useCallback(() => {
      setIsPlaying(true);
      onPlay?.();
    }, [onPlay]);

    const handlePause = useCallback(() => {
      setIsPlaying(false);
      onPause?.();
    }, [onPause]);

    const handleEnded = useCallback(() => {
      setIsPlaying(false);
      onEnded?.();
    }, [onEnded]);

    const handleTimeUpdate = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      setCurrentTime(video.currentTime);
      onTimeUpdate?.(video.currentTime, video.duration);
    }, [onTimeUpdate]);

    const handleLoadedMetadata = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;
      setDuration(video.duration);
    }, []);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return undefined;
      const onEnter = () => setIsPip(true);
      const onLeave = () => setIsPip(false);
      video.addEventListener('enterpictureinpicture', onEnter);
      video.addEventListener('leavepictureinpicture', onLeave);
      return () => {
        video.removeEventListener('enterpictureinpicture', onEnter);
        video.removeEventListener('leavepictureinpicture', onLeave);
      };
    }, []);

    const playPause = useCallback(async () => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused) {
        try {
          await video.play();
        } catch {
          // autoplay restrictions etc; surface via onPause path
        }
      } else {
        video.pause();
      }
    }, []);

    const seekBy = useCallback(
      (delta: number) => {
        const video = videoRef.current;
        if (!video) return;
        const next = clampSeek(video.currentTime + delta, video.duration);
        video.currentTime = next;
        setCurrentTime(next);
      },
      [],
    );

    const setVolumeClamped = useCallback(
      (next: number) => {
        const v = clampVolume(next);
        setVolume(v);
        setIsMuted(v === 0);
        onVolumeChange?.(v, v === 0);
      },
      [onVolumeChange],
    );

    const toggleMute = useCallback(() => {
      setIsMuted((prev) => {
        const next = !prev;
        onVolumeChange?.(volume, next);
        return next;
      });
    }, [onVolumeChange, volume]);

    const cycleRate = useCallback(() => {
      const next = nextPlaybackRate(rate, playbackRates);
      setRate(next);
      onPlaybackRateChange?.(next);
    }, [onPlaybackRateChange, playbackRates, rate]);

    const togglePip = useCallback(async () => {
      const video = videoRef.current;
      if (!video) return;
      const doc = document as Document & {
        pictureInPictureElement?: Element | null;
        exitPictureInPicture?: () => Promise<void>;
      };
      const v = video as HTMLVideoElement & {
        requestPictureInPicture?: () => Promise<PictureInPictureWindow>;
      };
      try {
        if (doc.pictureInPictureElement === video) {
          await doc.exitPictureInPicture?.();
        } else if (typeof v.requestPictureInPicture === 'function') {
          await v.requestPictureInPicture();
        }
      } catch {
        // browser declined; no-op
      }
    }, []);

    const handleScrubberChange = useCallback(
      (event: ChangeEvent<HTMLInputElement>) => {
        const video = videoRef.current;
        if (!video) return;
        const target = Number(event.target.value);
        const next = clampSeek(target, video.duration || duration);
        video.currentTime = next;
        setCurrentTime(next);
      },
      [duration],
    );

    const handleVolumeSliderChange = useCallback(
      (event: ChangeEvent<HTMLInputElement>) => {
        setVolumeClamped(Number(event.target.value));
      },
      [setVolumeClamped],
    );

    const handleRateChange = useCallback(
      (event: ChangeEvent<HTMLSelectElement>) => {
        const next = Number(event.target.value);
        setRate(next);
        onPlaybackRateChange?.(next);
      },
      [onPlaybackRateChange],
    );

    const onKeyDown = useCallback(
      (event: ReactKeyboardEvent<HTMLDivElement>) => {
        switch (event.key) {
          case ' ':
          case 'Spacebar':
          case 'k':
          case 'K':
            event.preventDefault();
            void playPause();
            break;
          case 'ArrowRight':
            event.preventDefault();
            seekBy(seekStep);
            break;
          case 'ArrowLeft':
            event.preventDefault();
            seekBy(-seekStep);
            break;
          case 'ArrowUp':
            event.preventDefault();
            setVolumeClamped(volume + volumeStep);
            break;
          case 'ArrowDown':
            event.preventDefault();
            setVolumeClamped(volume - volumeStep);
            break;
          case 'm':
          case 'M':
            event.preventDefault();
            toggleMute();
            break;
          case 'p':
          case 'P':
            event.preventDefault();
            void togglePip();
            break;
          default:
            break;
        }
      },
      [
        playPause,
        seekBy,
        seekStep,
        setVolumeClamped,
        toggleMute,
        togglePip,
        volume,
        volumeStep,
      ],
    );

    useImperativeHandle(
      forwardedRef,
      () => ({
        play: async () => {
          const video = videoRef.current;
          if (!video) return;
          try {
            await video.play();
          } catch {
            // ignore
          }
        },
        pause: () => {
          videoRef.current?.pause();
        },
        seek: (time: number) => {
          const video = videoRef.current;
          if (!video) return;
          const next = clampSeek(time, video.duration);
          video.currentTime = next;
          setCurrentTime(next);
        },
        getCurrentTime: () => videoRef.current?.currentTime ?? 0,
        getDuration: () => videoRef.current?.duration ?? 0,
        toggleMute,
        togglePictureInPicture: togglePip,
      }),
      [togglePip, toggleMute],
    );

    return (
      <div
        role="region"
        aria-label={ariaLabel}
        data-section="video-player"
        data-playing={isPlaying ? 'true' : 'false'}
        data-muted={isMuted ? 'true' : 'false'}
        data-pip={isPip ? 'true' : 'false'}
        data-rate={rate}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className={cn(
          'group relative w-full overflow-hidden rounded-md bg-black outline-none focus-visible:ring-2 focus-visible:ring-primary',
          className,
        )}
      >
        <video
          ref={videoRef}
          src={src}
          {...(poster !== undefined ? { poster } : {})}
          autoPlay={autoPlay}
          loop={loop}
          preload={preload}
          data-section="video-player-element"
          className="block w-full"
          playsInline
          onPlay={handlePlay}
          onPause={handlePause}
          onEnded={handleEnded}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
        />
        {controls ? (
          <div
            data-section="video-player-controls"
            className="flex flex-wrap items-center gap-2 bg-black/80 px-3 py-2 text-white"
          >
            <button
              type="button"
              data-section="video-player-play"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onClick={() => void playPause()}
              className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {isPlaying ? (
                <Pause aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Play aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
            <span
              data-section="video-player-current-time"
              className="font-mono text-xs tabular-nums"
            >
              {formatVideoTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step="any"
              value={currentTime}
              onChange={handleScrubberChange}
              aria-label="Seek"
              data-section="video-player-scrubber"
              className="flex-1 accent-primary"
            />
            <span
              data-section="video-player-duration"
              className="font-mono text-xs tabular-nums"
            >
              {formatVideoTime(duration)}
            </span>
            <button
              type="button"
              data-section="video-player-mute"
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              onClick={toggleMute}
              className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {isMuted ? (
                <VolumeX aria-hidden="true" className="h-4 w-4" />
              ) : (
                <Volume2 aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={volumeStep}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeSliderChange}
              aria-label="Volume"
              data-section="video-player-volume"
              className="w-20 accent-primary"
            />
            <select
              value={rate}
              onChange={handleRateChange}
              aria-label="Playback speed"
              data-section="video-player-rate"
              className="rounded bg-black/40 px-1 py-0.5 text-xs"
            >
              {playbackRates.map((r) => (
                <option key={r} value={r}>
                  {r}x
                </option>
              ))}
            </select>
            <button
              type="button"
              data-section="video-player-rate-cycle"
              aria-label="Cycle playback speed"
              onClick={cycleRate}
              className="hidden font-mono text-xs"
            >
              {rate}x
            </button>
            <button
              type="button"
              data-section="video-player-pip"
              aria-label="Picture in picture"
              onClick={() => void togglePip()}
              className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <PictureInPicture2
                aria-hidden="true"
                className="h-4 w-4"
              />
            </button>
          </div>
        ) : null}
        {caption !== undefined ? (
          <div
            data-section="video-player-caption"
            className="bg-black/80 px-3 py-1 text-xs text-white"
          >
            {caption}
          </div>
        ) : null}
      </div>
    );
  },
);

VideoPlayer.displayName = 'VideoPlayer';
