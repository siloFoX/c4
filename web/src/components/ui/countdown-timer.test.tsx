import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { createRef } from 'react';
import {
  CountdownTimer,
  DEFAULT_COUNTDOWN_FORMAT,
  DEFAULT_CRITICAL_THRESHOLD,
  DEFAULT_TICK_INTERVAL_MS,
  DEFAULT_WARNING_THRESHOLD,
  clampCountdownDuration,
  formatCountdownTime,
  getCountdownState,
  tickRemaining,
} from './countdown-timer';
import type { CountdownTimerHandle } from './countdown-timer';

afterEach(() => {
  cleanup();
});

describe('clampCountdownDuration', () => {
  it('returns 0 for NaN', () => {
    expect(clampCountdownDuration(Number.NaN)).toBe(0);
  });
  it('returns 0 for negatives', () => {
    expect(clampCountdownDuration(-5)).toBe(0);
  });
  it('passes through positives', () => {
    expect(clampCountdownDuration(120)).toBe(120);
  });
  it('passes through 0', () => {
    expect(clampCountdownDuration(0)).toBe(0);
  });
  it('returns 0 for +Infinity', () => {
    expect(clampCountdownDuration(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('formatCountdownTime', () => {
  it('auto: MM:SS when under 1h', () => {
    expect(formatCountdownTime(45)).toBe('00:45');
    expect(formatCountdownTime(125)).toBe('02:05');
  });
  it('auto: HH:MM:SS at 1h or above', () => {
    expect(formatCountdownTime(3600)).toBe('01:00:00');
    expect(formatCountdownTime(3725)).toBe('01:02:05');
  });
  it('hh:mm:ss forces hours even under 1h', () => {
    expect(formatCountdownTime(60, 'hh:mm:ss')).toBe('00:01:00');
  });
  it('mm:ss collapses hours into minutes', () => {
    expect(formatCountdownTime(3725, 'mm:ss')).toBe('62:05');
  });
  it('ceils fractional seconds', () => {
    expect(formatCountdownTime(0.5)).toBe('00:01');
    expect(formatCountdownTime(7.1)).toBe('00:08');
  });
  it('returns 00:00 for 0 and negatives', () => {
    expect(formatCountdownTime(0)).toBe('00:00');
    expect(formatCountdownTime(-3)).toBe('00:00');
  });
});

describe('getCountdownState', () => {
  it('expired when 0 or below', () => {
    expect(getCountdownState(0)).toBe('expired');
    expect(getCountdownState(-1)).toBe('expired');
  });
  it('critical when <= critical threshold', () => {
    expect(getCountdownState(10)).toBe('critical');
    expect(getCountdownState(5)).toBe('critical');
  });
  it('warning when above critical, <= warning', () => {
    expect(getCountdownState(30)).toBe('warning');
    expect(getCountdownState(20)).toBe('warning');
  });
  it('normal when above warning threshold', () => {
    expect(getCountdownState(31)).toBe('normal');
    expect(getCountdownState(120)).toBe('normal');
  });
  it('custom thresholds apply', () => {
    expect(getCountdownState(15, 20, 5)).toBe('warning');
    expect(getCountdownState(5, 20, 5)).toBe('critical');
    expect(getCountdownState(21, 20, 5)).toBe('normal');
  });
});

describe('tickRemaining', () => {
  it('subtracts deltaMs in seconds', () => {
    expect(tickRemaining(10, 1000)).toBe(9);
    expect(tickRemaining(10, 500)).toBe(9.5);
  });
  it('clamps to 0 when underflow', () => {
    expect(tickRemaining(1, 5000)).toBe(0);
  });
});

describe('Constants', () => {
  it('DEFAULT_WARNING_THRESHOLD = 30', () => {
    expect(DEFAULT_WARNING_THRESHOLD).toBe(30);
  });
  it('DEFAULT_CRITICAL_THRESHOLD = 10', () => {
    expect(DEFAULT_CRITICAL_THRESHOLD).toBe(10);
  });
  it('DEFAULT_COUNTDOWN_FORMAT = auto', () => {
    expect(DEFAULT_COUNTDOWN_FORMAT).toBe('auto');
  });
  it('DEFAULT_TICK_INTERVAL_MS = 250', () => {
    expect(DEFAULT_TICK_INTERVAL_MS).toBe(250);
  });
});

describe('CountdownTimer component', () => {
  it('renders with default aria-label', () => {
    render(
      <CountdownTimer durationSeconds={60} autoStart={false} />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Countdown timer',
    );
  });

  it('honors a custom ariaLabel', () => {
    render(
      <CountdownTimer
        durationSeconds={60}
        autoStart={false}
        ariaLabel="Cooking timer"
      />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'aria-label',
      'Cooking timer',
    );
  });

  it('renders the formatted duration in MM:SS by default', () => {
    render(
      <CountdownTimer durationSeconds={125} autoStart={false} />,
    );
    expect(screen.getByText('02:05')).toBeInTheDocument();
  });

  it('renders the formatted duration in HH:MM:SS when over 1h', () => {
    render(
      <CountdownTimer durationSeconds={3725} autoStart={false} />,
    );
    expect(screen.getByText('01:02:05')).toBeInTheDocument();
  });

  it('format="hh:mm:ss" forces hour display under 1h', () => {
    render(
      <CountdownTimer
        durationSeconds={60}
        autoStart={false}
        format="hh:mm:ss"
      />,
    );
    expect(screen.getByText('00:01:00')).toBeInTheDocument();
  });

  it('format="mm:ss" collapses hours into minutes', () => {
    render(
      <CountdownTimer
        durationSeconds={3725}
        autoStart={false}
        format="mm:ss"
      />,
    );
    expect(screen.getByText('62:05')).toBeInTheDocument();
  });

  it('autoStart=true is the default; shows Pause button', () => {
    render(<CountdownTimer durationSeconds={60} />);
    expect(
      screen.getByLabelText('Pause countdown'),
    ).toBeInTheDocument();
  });

  it('autoStart=false shows Resume button initially', () => {
    render(
      <CountdownTimer durationSeconds={60} autoStart={false} />,
    );
    expect(
      screen.getByLabelText('Resume countdown'),
    ).toBeInTheDocument();
  });

  it('pause button calls onPause and switches to Play icon', () => {
    const onPause = vi.fn();
    render(
      <CountdownTimer durationSeconds={60} onPause={onPause} />,
    );
    fireEvent.click(screen.getByLabelText('Pause countdown'));
    expect(onPause).toHaveBeenCalled();
    expect(
      screen.getByLabelText('Resume countdown'),
    ).toBeInTheDocument();
  });

  it('resume button calls onResume and switches to Pause icon', () => {
    const onResume = vi.fn();
    render(
      <CountdownTimer
        durationSeconds={60}
        autoStart={false}
        onResume={onResume}
      />,
    );
    fireEvent.click(screen.getByLabelText('Resume countdown'));
    expect(onResume).toHaveBeenCalled();
    expect(
      screen.getByLabelText('Pause countdown'),
    ).toBeInTheDocument();
  });

  it('controls=false hides the buttons', () => {
    const { container } = render(
      <CountdownTimer
        durationSeconds={60}
        autoStart={false}
        controls={false}
      />,
    );
    expect(
      container.querySelector(
        '[data-section="countdown-timer-controls"]',
      ),
    ).toBeNull();
  });

  it('showReset=true reveals a reset button', () => {
    render(
      <CountdownTimer
        durationSeconds={60}
        autoStart={false}
        showReset
      />,
    );
    expect(
      screen.getByLabelText('Reset countdown'),
    ).toBeInTheDocument();
  });

  it('reset restores the original duration', () => {
    const ref = createRef<CountdownTimerHandle>();
    render(
      <CountdownTimer
        ref={ref}
        durationSeconds={60}
        autoStart={false}
      />,
    );
    act(() => {
      ref.current?.reset(30);
    });
    expect(screen.getByText('00:30')).toBeInTheDocument();
  });

  it('region data-state reflects warning/critical/normal', () => {
    const { rerender, container } = render(
      <CountdownTimer
        durationSeconds={120}
        autoStart={false}
        warningThresholdSeconds={30}
        criticalThresholdSeconds={10}
      />,
    );
    const region = container.querySelector(
      '[data-section="countdown-timer"]',
    ) as HTMLElement;
    expect(region.getAttribute('data-state')).toBe('normal');

    rerender(
      <CountdownTimer
        durationSeconds={20}
        autoStart={false}
        warningThresholdSeconds={30}
        criticalThresholdSeconds={10}
      />,
    );
    expect(
      (container.querySelector(
        '[data-section="countdown-timer"]',
      ) as HTMLElement).getAttribute('data-state'),
    ).toBe('warning');

    rerender(
      <CountdownTimer
        durationSeconds={5}
        autoStart={false}
        warningThresholdSeconds={30}
        criticalThresholdSeconds={10}
      />,
    );
    expect(
      (container.querySelector(
        '[data-section="countdown-timer"]',
      ) as HTMLElement).getAttribute('data-state'),
    ).toBe('critical');
  });

  it('display uses tabular-nums + state text class', () => {
    render(
      <CountdownTimer
        durationSeconds={5}
        autoStart={false}
        warningThresholdSeconds={30}
        criticalThresholdSeconds={10}
      />,
    );
    const display = screen.getByText('00:05');
    expect(display.className).toContain('text-destructive');
    expect(display.className).toContain('tabular-nums');
  });

  it('region data-running mirrors play/pause state', () => {
    const { container } = render(
      <CountdownTimer durationSeconds={60} />,
    );
    const region = container.querySelector(
      '[data-section="countdown-timer"]',
    ) as HTMLElement;
    expect(region.getAttribute('data-running')).toBe('true');
    fireEvent.click(screen.getByLabelText('Pause countdown'));
    expect(
      (container.querySelector(
        '[data-section="countdown-timer"]',
      ) as HTMLElement).getAttribute('data-running'),
    ).toBe('false');
  });

  it('region data-remaining is the ceiling of the seconds', () => {
    render(
      <CountdownTimer durationSeconds={42} autoStart={false} />,
    );
    expect(screen.getByRole('region')).toHaveAttribute(
      'data-remaining',
      '42',
    );
  });

  it('label slot renders when supplied', () => {
    render(
      <CountdownTimer
        durationSeconds={60}
        autoStart={false}
        label="Time left"
      />,
    );
    expect(screen.getByText('Time left')).toBeInTheDocument();
  });

  it('display has role=timer + aria-atomic', () => {
    render(
      <CountdownTimer durationSeconds={60} autoStart={false} />,
    );
    const display = screen.getByRole('timer');
    expect(display).toHaveAttribute('aria-atomic', 'true');
  });

  it('aria-live=polite by default; assertive when critical', () => {
    const { rerender } = render(
      <CountdownTimer
        durationSeconds={60}
        autoStart={false}
      />,
    );
    expect(screen.getByRole('timer')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    rerender(
      <CountdownTimer
        durationSeconds={5}
        autoStart={false}
      />,
    );
    expect(screen.getByRole('timer')).toHaveAttribute(
      'aria-live',
      'assertive',
    );
  });

  it('exposes a stable displayName', () => {
    expect(CountdownTimer.displayName).toBe('CountdownTimer');
  });

  it('imperative handle has all method names', () => {
    const ref = createRef<CountdownTimerHandle>();
    render(
      <CountdownTimer
        ref={ref}
        durationSeconds={60}
        autoStart={false}
      />,
    );
    expect(typeof ref.current?.start).toBe('function');
    expect(typeof ref.current?.pause).toBe('function');
    expect(typeof ref.current?.resume).toBe('function');
    expect(typeof ref.current?.reset).toBe('function');
    expect(typeof ref.current?.toggle).toBe('function');
    expect(typeof ref.current?.getRemainingSeconds).toBe('function');
    expect(typeof ref.current?.getState).toBe('function');
  });

  it('toggle button is disabled at remaining=0', () => {
    render(
      <CountdownTimer durationSeconds={0} autoStart={false} />,
    );
    expect(screen.getByLabelText('Resume countdown')).toBeDisabled();
  });
});

// ---------------------------------------------------------------
// Fake-timer driven scenarios
// ---------------------------------------------------------------

describe('CountdownTimer (fake-timer driven)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ticks down over time and fires onTick', () => {
    const onTick = vi.fn();
    render(
      <CountdownTimer
        durationSeconds={5}
        tickIntervalMs={250}
        onTick={onTick}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onTick).toHaveBeenCalled();
    const calls = onTick.mock.calls;
    const lastCall = calls[calls.length - 1]![0] as number;
    expect(lastCall).toBeLessThanOrEqual(5);
    expect(lastCall).toBeGreaterThanOrEqual(3.5);
  });

  it('fires onExpire exactly once when reaching 0', () => {
    const onExpire = vi.fn();
    render(
      <CountdownTimer
        durationSeconds={1}
        tickIntervalMs={250}
        onExpire={onExpire}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('pause prevents further ticks', () => {
    const onTick = vi.fn();
    render(
      <CountdownTimer
        durationSeconds={10}
        tickIntervalMs={250}
        onTick={onTick}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.click(screen.getByLabelText('Pause countdown'));
    const ticksBefore = onTick.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onTick.mock.calls.length).toBe(ticksBefore);
  });
});
