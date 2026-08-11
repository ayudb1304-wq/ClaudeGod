import {
  classifyUsageFreshness,
  formatTimeUntil,
  subscribeUsage,
  type UsageMeterState,
  type UsageWindowSnapshot,
} from '@/core/usage';
import {
  readSettings,
  updateUsageWidgetSettings,
  type UsageWidgetSettings,
} from '@/shared/settings';
import { strings } from '@/shared/strings';
import { WIDGET_STYLES } from './widgetStyles';
import { followClaudeTheme } from '../themeSync';

/**
 * Floating usage widget (FEATURES 3.1): 5-hour and weekly utilization plus the
 * session reset countdown. Collapsible; position dragged and persisted.
 *
 * Vanilla DOM inside a shadow root, like the other content-script surfaces:
 * Claude owns this page, so nothing of ours may inherit or leak styles. Passive
 * by design, it never takes focus and never intercepts typing.
 */

const WIDGET_ID = 'claudegod-usage-widget';
const EDGE_MARGIN_PX = 8;
/** Countdown granularity. Data refresh is the poller's job, not the ticker's. */
const TICK_MS = 30_000;

/*
 * Two tiers, not three. The brand colour is orange, so an amber "warning" step
 * between orange and red would read as the same colour twice and carry no
 * information. The meter is brand-coloured until it matters, then red.
 *
 * 80 matches the default alert threshold, so the bar turns red exactly when a
 * Pro user would be notified.
 */
function level(utilization: number): 'ok' | 'danger' {
  return utilization >= 80 ? 'danger' : 'ok';
}

interface MeterRow {
  row: HTMLElement;
  fill: HTMLElement;
  value: HTMLElement;
}

function buildRow(label: string): MeterRow {
  const row = document.createElement('div');
  row.className = 'cg-w-row';

  const line = document.createElement('div');
  line.className = 'cg-w-line';
  const name = document.createElement('span');
  name.textContent = label;
  const value = document.createElement('span');
  value.className = 'cg-w-value';
  line.append(name, value);

  const track = document.createElement('div');
  track.className = 'cg-w-track';
  track.setAttribute('role', 'progressbar');
  track.setAttribute('aria-label', label);
  const fill = document.createElement('div');
  fill.className = 'cg-w-fill';
  track.appendChild(fill);

  row.append(line, track);
  return { row, fill, value };
}

interface WidgetElements {
  host: HTMLElement;
  widget: HTMLElement;
  header: HTMLElement;
  toggle: HTMLButtonElement;
  body: HTMLElement;
}

function buildWidget(settings: UsageWidgetSettings): WidgetElements {
  const host = document.createElement('div');
  host.id = WIDGET_ID;
  // Position lives on the host; everything visual lives inside the shadow root.
  host.style.cssText = [
    'all:initial',
    'position:fixed',
    `right:${String(settings.right)}px`,
    `bottom:${String(settings.bottom)}px`,
    'z-index:2147483646',
  ].join(';');

  const root = host.attachShadow({ mode: 'open' });
  // Match Claude's own light/dark toggle, not just the OS (FEATURES 8.3).
  followClaudeTheme(host);
  const style = document.createElement('style');
  style.textContent = WIDGET_STYLES;
  root.appendChild(style);

  const widget = document.createElement('div');
  widget.className = 'cg-root cg-widget';

  const header = document.createElement('div');
  header.className = 'cg-w-head';
  const dot = document.createElement('span');
  dot.className = 'cg-w-dot';
  const title = document.createElement('span');
  title.className = 'cg-w-title';
  title.textContent = strings.usage.widgetTitle;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'cg-w-toggle';
  header.append(dot, title, toggle);

  const body = document.createElement('div');
  body.className = 'cg-w-body';

  widget.append(header, body);
  root.appendChild(widget);
  return { host, widget, header, toggle, body };
}

class UsageWidget {
  private readonly els: WidgetElements;
  private settings: UsageWidgetSettings;
  private state: UsageMeterState = { kind: 'loading' };
  private readonly session = buildRow(strings.usage.session);
  private readonly week = buildRow(strings.usage.week);
  private readonly countdown = document.createElement('div');
  private readonly message = document.createElement('div');

  constructor(settings: UsageWidgetSettings) {
    this.settings = settings;
    this.els = buildWidget(settings);
    this.countdown.className = 'cg-w-note';
    this.message.className = 'cg-w-note';
    this.message.textContent = strings.usage.unavailable;
    this.els.body.append(this.session.row, this.week.row, this.countdown, this.message);

    this.els.toggle.addEventListener('click', () => {
      this.settings = { ...this.settings, collapsed: !this.settings.collapsed };
      this.render();
      this.persist();
    });
    this.wireDrag();
    this.render();
  }

  attach(): void {
    document.body.appendChild(this.els.host);
  }

  update(state: UsageMeterState): void {
    this.state = state;
    this.render();
  }

  /** Re-renders the countdown between data refreshes. */
  tick(): void {
    this.render();
  }

  private render(): void {
    const { host, toggle, body } = this.els;

    // Nothing to show yet: stay invisible rather than flashing an empty frame.
    host.style.display = this.state.kind === 'loading' ? 'none' : '';
    if (this.state.kind === 'loading') return;

    toggle.textContent = this.settings.collapsed ? '▸' : '▾';
    toggle.setAttribute(
      'aria-label',
      this.settings.collapsed ? strings.usage.expand : strings.usage.collapse,
    );
    body.style.display = this.settings.collapsed ? 'none' : '';
    if (this.settings.collapsed) return;

    if (this.state.kind === 'unavailable') {
      this.session.row.style.display = 'none';
      this.week.row.style.display = 'none';
      this.countdown.style.display = 'none';
      this.message.style.display = '';
      this.message.textContent = strings.usage.unavailable;
      return;
    }

    const { snapshot } = this.state;
    const now = new Date();
    const freshness = classifyUsageFreshness(snapshot, now);
    this.message.style.display = 'none';

    /*
     * Expired means the window rolled over since we measured, so the stored
     * percentage is about a window that no longer exists. Unlike the popup this
     * self-heals: polling resumes as soon as the tab is visible, so we say we
     * are updating rather than raising an alarm.
     */
    if (freshness === 'expired') {
      this.session.row.style.display = 'none';
      this.week.row.style.display = 'none';
      this.countdown.style.display = 'none';
      this.message.style.display = '';
      this.message.textContent = strings.usage.widgetRefreshing;
      return;
    }

    body.setAttribute('data-stale', String(freshness === 'stale'));

    const rows: [MeterRow, UsageWindowSnapshot | null][] = [
      [this.session, snapshot.fiveHour],
      [this.week, snapshot.sevenDay],
    ];
    for (const [row, window] of rows) {
      row.row.style.display = window ? '' : 'none';
      if (!window) continue;
      row.value.textContent = `${String(window.utilization)}%`;
      row.fill.style.width = `${String(window.utilization)}%`;
      row.fill.setAttribute('data-level', level(window.utilization));
      row.row.querySelector('.cg-w-track')?.setAttribute('aria-valuenow', String(window.utilization));
    }

    const reset = formatTimeUntil(snapshot.fiveHour?.resetsAt ?? null, now);
    this.countdown.style.display = reset ? '' : 'none';
    if (reset) this.countdown.textContent = strings.usage.resetsIn(reset);
  }

  private wireDrag(): void {
    const { host, header } = this.els;
    let start: { x: number; y: number; right: number; bottom: number } | null = null;

    header.addEventListener('pointerdown', (event) => {
      if (event.target === this.els.toggle) return;
      start = {
        x: event.clientX,
        y: event.clientY,
        right: this.settings.right,
        bottom: this.settings.bottom,
      };
      header.setPointerCapture(event.pointerId);
      header.setAttribute('data-dragging', 'true');
    });

    header.addEventListener('pointermove', (event) => {
      if (!start) return;
      const right = clampOffset(start.right - (event.clientX - start.x), window.innerWidth);
      const bottom = clampOffset(start.bottom - (event.clientY - start.y), window.innerHeight);
      this.settings = { ...this.settings, right, bottom };
      host.style.right = `${String(right)}px`;
      host.style.bottom = `${String(bottom)}px`;
    });

    const finish = (event: PointerEvent): void => {
      if (!start) return;
      start = null;
      header.releasePointerCapture(event.pointerId);
      header.removeAttribute('data-dragging');
      this.persist();
    };
    header.addEventListener('pointerup', finish);
    header.addEventListener('pointercancel', finish);
  }

  /**
   * Always writes the widget's complete state. Partial patches from the toggle
   * and the drag handler can interleave (each is an async read-merge-write), and
   * a stale read then silently reverts the other writer's field. Full-state
   * writes make last-writer-wins consistent.
   */
  private persist(): void {
    void updateUsageWidgetSettings({ ...this.settings });
  }
}

function clampOffset(value: number, viewport: number): number {
  return Math.min(Math.max(value, EDGE_MARGIN_PX), Math.max(EDGE_MARGIN_PX, viewport - 60));
}

export function mountUsageWidget(): void {
  void (async () => {
    try {
      // A stale instance can survive an extension reload on an open tab; two
      // widgets fighting over position writes corrupt the stored settings.
      document.getElementById(WIDGET_ID)?.remove();
      const settings = await readSettings();
      // FEATURES 8.1: hiding the widget removes it from the page entirely. The
      // popup still shows usage, so hiding costs the user no information.
      if (settings.usageWidget.hidden) return;
      const widget = new UsageWidget(settings.usageWidget);
      widget.attach();
      subscribeUsage((state) => {
        try {
          widget.update(state);
        } catch {
          /* Claude owns this DOM; a render failure must not break the page. */
        }
      });
      setInterval(() => widget.tick(), TICK_MS);
    } catch {
      // Widget is a nice-to-have overlay. If mounting fails we vanish quietly.
    }
  })();
}
