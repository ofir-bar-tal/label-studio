import { SyncManager } from "../Syncable";

function createTarget(name: string, type = "video") {
  const received: Array<{ data: any; event: string }> = [];

  return {
    target: {
      name,
      type,
      syncReceive(data: any, event: string) {
        received.push({ data, event });
      },
    },
    received,
  };
}

describe("SyncManager", () => {
  test("broadcasts frame index alongside time to every other target in the group", () => {
    const manager = new SyncManager();
    const { target: a } = createTarget("video_a");
    const { target: b, received: bReceived } = createTarget("video_b");

    manager.register(a as any);
    manager.register(b as any);

    manager.sync({ time: 1.25, frame: 30, playing: true }, "seek", "video_a");

    expect(bReceived).toHaveLength(1);
    expect(bReceived[0].data.frame).toBe(30);
    expect(bReceived[0].data.time).toBe(1.25);
  });

  test("does not echo the event back to its origin", () => {
    const manager = new SyncManager();
    const { target: a, received: aReceived } = createTarget("video_a");
    const { target: b } = createTarget("video_b");

    manager.register(a as any);
    manager.register(b as any);

    manager.sync({ frame: 5 }, "seek", "video_a");

    expect(aReceived).toHaveLength(0);
  });
});
