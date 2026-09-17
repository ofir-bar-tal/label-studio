import { render, screen, fireEvent, act } from "@testing-library/react";

mockModule("@humansignal/icons", () => ({
  IconFullscreen: () => <span data-testid="icon-fullscreen" />,
  IconFullscreenExit: () => <span data-testid="icon-fullscreen-exit" />,
  IconPlay: () => <span data-testid="icon-play" />,
  IconPause: () => <span data-testid="icon-pause" />,
  IconVolumeFull: () => <span data-testid="icon-volume-full" />,
  IconVolumeMute: () => <span data-testid="icon-volume-mute" />,
}));

mockModule("@humansignal/ui", () => ({
  ...requireActual("@humansignal/ui"),
  Button: ({ children, onClick, ...props }) => (
    <button type="button" onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Tooltip: ({ children }) => children,
}));

mockModule("../../../../components/ErrorMessage/ErrorMessage", () => ({
  ErrorMessage: ({ error }) => <div data-testid="error-message">{String(error)}</div>,
}));

mockModule("../../../../components/Tags/Object", () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="object-tag">{children}</div>,
}));

const mockHstackCalls = [];
mockModule("../HstackVideoCanvas", () => ({
  HstackVideoCanvas: (props) => {
    mockHstackCalls.push(props);
    if (props.ref) props.ref.current = { play: mock(), pause: mock(), goToFrame: mock() };
    return <div data-testid="hstack-video-canvas">HstackVideoCanvas</div>;
  },
}));

mockModule("../../../../hooks/useFullscreen", () => ({
  useFullscreen: () => ({
    enter: mock(),
    exit: mock(),
    getElement: () => null,
  }),
}));

mockModule("../../../../hooks/useToggle", () => {
  const { useState } = require("react");
  return {
    useToggle: (initial) => {
      const [value, setValue] = useState(initial);
      return [value, () => setValue(true), () => setValue(false), () => setValue((v) => !v)];
    },
  };
});

// jsdom doesn't implement layout, so ResizeObserver never reports real dimensions;
// stub the project's resize-observer wrapper to report a fixed, non-zero size.
mockModule("../../../../utils/resize-observer", () => ({
  __esModule: true,
  default: mock().mockImplementation(function (callback) {
    this._callback = callback;
    this.observe = mock((el) => {
      if (this._callback && el) {
        Object.defineProperty(el, "clientWidth", { value: 800, configurable: true });
        Object.defineProperty(el, "clientHeight", { value: 600, configurable: true });
        this._callback();
      }
    });
    this.unobserve = mock();
    this.disconnect = mock();
    return this;
  }),
}));

const { HtxVideoCompareView } = require("../HtxVideoCompare");
const { VideoCompareModel } = require("../VideoCompare");

async function triggerLoad() {
  await act(() => {
    mockHstackCalls[0].onLoad({ length: 100 });
  });
}

function createItem(overrides = {}) {
  // A plain URL (no `$var` syntax) resolves as-is without needing a real task/annotation store.
  return VideoCompareModel.create({
    name: "cmp",
    value: "https://example.com/combined.mp4",
    framerate: "24",
    ...overrides,
  });
}

describe("HtxVideoCompareView", () => {
  beforeEach(() => {
    clearAllMocks();
    mockHstackCalls.length = 0;
  });

  it("returns null when the video URL is missing", () => {
    const item = createItem({ value: null });
    const { container } = render(<HtxVideoCompareView item={item} />);

    expect(container.firstChild).toBeNull();
  });

  it("renders a single combined video canvas and no region/timeline UI", async () => {
    const item = createItem();

    render(<HtxVideoCompareView item={item} />);

    expect(screen.getAllByTestId("hstack-video-canvas")).toHaveLength(1);
    expect(screen.queryByTestId("video-regions")).toBeNull();
    expect(screen.queryByTestId("timeline")).toBeNull();
  });

  it("shows the controls toolbar only once the video has loaded", async () => {
    const item = createItem();

    render(<HtxVideoCompareView item={item} />);

    expect(screen.queryByLabelText("Play")).toBeNull();

    await triggerLoad();

    expect(screen.getByLabelText("Play")).toBeInTheDocument();
  });

  it("play button toggles item.playing", async () => {
    const item = createItem();

    render(<HtxVideoCompareView item={item} />);
    await triggerLoad();

    expect(item.playing).toBe(false);
    fireEvent.click(screen.getByLabelText("Play"));
    expect(item.playing).toBe(true);
  });

  it("mode toggle switches between side-by-side and wipe", async () => {
    const item = createItem();

    render(<HtxVideoCompareView item={item} />);
    await triggerLoad();

    expect(item.mode).toBe("side-by-side");

    fireEvent.click(screen.getByText("Wipe compare"));
    expect(item.mode).toBe("wipe");

    fireEvent.click(screen.getByText("Side by side"));
    expect(item.mode).toBe("side-by-side");
  });

  it("fullscreen button toggles the fullscreen modifier class", async () => {
    const item = createItem();

    render(<HtxVideoCompareView item={item} />);
    await triggerLoad();

    const root = screen.getByTestId("object-tag").firstChild;

    expect(root.className).not.toContain("fullscreen");
    fireEvent.click(screen.getByLabelText("Fullscreen"));
    expect(root.className).toContain("fullscreen");
  });
});
