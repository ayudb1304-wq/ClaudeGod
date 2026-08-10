import {
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

/**
 * Floating usage widget (FEATURES 3.1): 5-hour and weekly utilization plus the
 * session reset countdown. Collapsible; position dragged and persisted.
 *
 * Vanilla DOM like the sync banner: it lives in the content script's 250KB gz
 * budget and renders a handful of nodes. Passive by design — it never takes
 * focus and never intercepts typing.
 */

const WIDGET_ID = 'claudegod-usage-widget';
const EDGE_MARGIN_PX = 8;
/** Countdown granularity. Data refresh is the poller's job, not the ticker's. */
const TICK_MS = 30_000;

interface WidgetElements {
  container: HTMLElement;
  header: HTMLElement;
  toggle: HTMLButtonElement;
  body: HTMLElement;
}

function styleBar(fill: HTMLElement, utilization: number): void {
  fill.style.width = `${String(utilization)}%`;
  // Neutral until it matters; no reds below the zone people actually care about.
  fill.style.background = utilization >= 90 ? '#e07a5f' : utilization >= 75 ? '#d9a441' : '#6f8fd9';
}

function buildRow(label: string): { row: HTMLElement; fill: HTMLElement; value: HTMLElement } {
  const row = document.createElement('div');
  row.style.cssText = 'margin:6px 0 0';

  const line = document.createElement('div');
  line.style.cssText = 'display:flex;justify-content:space-between;gap:12px';
  const name = document.createElement('span');
  name.textContent = label;
  const value = document.createElement('span');
  line.append(name, value);

  const track = document.createElement('div');
  track.style.cssText = 'margin-top:3px;height:4px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden';
  const fill = document.createElement('div');
  fill.style.cssText = 'height:100%;border-radius:2px;transition:width .3s';
  track.appendChild(fill);

  row.append(line, track);
  return { row, fill, value };
}

function buildWidget(settings: UsageWidgetSettings): WidgetElements {
  const container = document.createElement('div');
  container.id = WIDGET_ID;
  container.style.cssText = [
    'position:fixed',
    `right:${String(settings.right)}px`,
    `bottom:${String(settings.bottom)}px`,
    'z-index:2147483646',
    'width:200px',
    'padding:8px 12px 10px',
    'border-radius:10px',
    'font:400 12px/1.45 ui-sans-serif,system-ui,sans-serif',
    'background:rgba(20,20,20,.92)',
    'color:#f5f5f5',
    'box-shadow:0 2px 10px rgba(0,0,0,.22)',
    'user-select:none',
  ].join(';');

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;cursor:grab';
  const title = document.createElement('span');
  title.textContent = strings.usage.widgetTitle;
  title.style.cssText = 'font-weight:600';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.style.cssText =
    'border:0;background:none;color:inherit;cursor:pointer;font:inherit;padding:0 2px';
  header.append(title, toggle);

  const body = document.createElement('div');

  container.append(header, body);
  return { container, header, toggle, body };
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
    this.countdown.style.cssText = 'margin-top:6px;color:#bdbdbd;font-size:11px';
    this.message.style.cssText = 'margin-top:6px;color:#bdbdbd';
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
    document.body.appendChild(this.els.container);
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
    const { container, toggle, body } = this.els;

    // Nothing to show yet: stay invisible rather than flashing an empty frame.
    container.style.display = this.state.kind === 'loading' ? 'none' : '';
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
      return;
    }

    const { snapshot } = this.state;
    this.message.style.display = 'none';

    const rows: [ReturnType<typeof buildRow>, UsageWindowSnapshot | null][] = [
      [this.session, snapshot.fiveHour],
      [this.week, snapshot.sevenDay],
    ];
    for (const [row, window] of rows) {
      row.row.style.display = window ? '' : 'none';
      if (window) {
        row.value.textContent = `${String(window.utilization)}%`;
        styleBar(row.fill, window.utilization);
      }
    }

    const reset = formatTimeUntil(snapshot.fiveHour?.resetsAt ?? null, new Date());
    this.countdown.style.display = reset ? '' : 'none';
    if (reset) this.countdown.textContent = strings.usage.resetsIn(reset);
  }

  private wireDrag(): void {
    const { container, header } = this.els;
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
      header.style.cursor = 'grabbing';
    });

    header.addEventListener('pointermove', (event) => {
      if (!start) return;
      const right = clampOffset(start.right - (event.clientX - start.x), window.innerWidth);
      const bottom = clampOffset(start.bottom - (event.clientY - start.y), window.innerHeight);
      this.settings = { ...this.settings, right, bottom };
      container.style.right = `${String(right)}px`;
      container.style.bottom = `${String(bottom)}px`;
    });

    const finish = (event: PointerEvent): void => {
      if (!start) return;
      start = null;
      header.releasePointerCapture(event.pointerId);
      header.style.cursor = 'grab';
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
