import { expect, test } from "playwright/test";
import {
  createGoogleMarker,
  normalizeGoogleMapsMapId,
  withConfiguredMapId,
} from "../../src/lib/maps/loader";
import { expectHealthyPage, gotoOK, waitForInteractivePage } from "./helpers";

test.describe("Google Maps configuration", () => {
  test("accepts a real cloud Map ID and rejects demo or placeholder values", () => {
    expect(normalizeGoogleMapsMapId("15431d2b469f209e")).toBe("15431d2b469f209e");
    expect(normalizeGoogleMapsMapId(" 15431D2B469F209E ")).toBe("15431D2B469F209E");
    expect(normalizeGoogleMapsMapId("DEMO_MAP_ID")).toBeUndefined();
    expect(normalizeGoogleMapsMapId("ci-placeholder")).toBeUndefined();
    expect(normalizeGoogleMapsMapId("")).toBeUndefined();

    expect(withConfiguredMapId({ zoom: 9 }, null)).toEqual({ zoom: 9 });
    expect(withConfiguredMapId({ zoom: 9 }, "15431d2b469f209e")).toEqual({
      zoom: 9,
      mapId: "15431d2b469f209e",
    });

    class FakeClassicMarker {
      private mapValue: unknown;
      private positionValue: unknown;
      private zIndexValue: number | undefined;

      constructor(options: { map: unknown; position: unknown; zIndex?: number }) {
        this.mapValue = options.map;
        this.positionValue = options.position;
        this.zIndexValue = options.zIndex;
      }

      addListener() { return {}; }
      getMap() { return this.mapValue; }
      setMap(map: unknown) { this.mapValue = map; }
      getPosition() { return this.positionValue; }
      setPosition(position: unknown) { this.positionValue = position; }
      getZIndex() { return this.zIndexValue; }
      setZIndex(zIndex: number) { this.zIndexValue = zIndex; }
    }

    const fallbackMarker = createGoogleMarker(
      { Marker: FakeClassicMarker },
      { map: "classic-map", position: { lat: 9.93, lng: -84.08 } },
      null,
    );
    expect(fallbackMarker.map).toBe("classic-map");
    fallbackMarker.map = null;
    fallbackMarker.zIndex = 12;
    expect(fallbackMarker.map).toBeNull();
    expect(fallbackMarker.zIndex).toBe(12);
  });

  test("search never requests Google's public demo Map ID", async ({ page }) => {
    const requestUrls: string[] = [];
    page.on("request", (request) => requestUrls.push(request.url()));

    await gotoOK(page, "/es/buscar");
    await waitForInteractivePage(page);
    await page.waitForTimeout(1_000);

    expect(requestUrls.some((url) => /DEMO_MAP_ID/i.test(url))).toBe(false);
    await expectHealthyPage(page);
  });
});
