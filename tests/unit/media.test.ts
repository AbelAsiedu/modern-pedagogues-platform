import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { MAX_DIMENSION, MAX_UPLOAD_BYTES, mediaPath, processImage } from "@/server/media/service";

const solid = (w: number, h: number, fmt: "jpeg" | "png" | "webp" = "jpeg") =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 30, b: 30 } } })[fmt]().toBuffer();

describe("processImage", () => {
  it("accepts JPEG, PNG and WebP and keeps the format", async () => {
    for (const [fmt, type] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]] as const) {
      const out = await processImage(await solid(64, 48, fmt));
      expect(out.contentType).toBe(type);
      expect(out.width).toBe(64);
      expect(out.height).toBe(48);
    }
  });

  it("shrinks very large pictures to the maximum dimension, preserving the shape", async () => {
    const out = await processImage(await solid(4000, 2000, "jpeg"));
    expect(Math.max(out.width, out.height)).toBe(MAX_DIMENSION);
    expect(out.width / out.height).toBeCloseTo(2, 1);
  });

  it("removes EXIF metadata such as GPS location", async () => {
    const withExif = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#fff" } })
      .withExif({ IFD0: { Copyright: "secret-owner" }, IFD3: { GPSLatitudeRef: "N" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await processImage(withExif);
    expect((await sharp(out.data).metadata()).exif).toBeUndefined();
    expect(out.data.includes(Buffer.from("secret-owner"))).toBe(false);
  });

  it("drops anything appended after the image (a common way to smuggle a script)", async () => {
    const jpeg = await solid(32, 32, "jpeg");
    const out = await processImage(Buffer.concat([jpeg, Buffer.from("<script>alert(1)</script>")]));
    expect(out.data.includes(Buffer.from("<script>"))).toBe(false);
  });

  it("refuses SVG, GIF, HTML, empty files and random bytes, whatever they are called", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
    const gif = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } }).gif().toBuffer();
    for (const bad of [svg, gif, Buffer.from("<html><body>hi</body></html>"), Buffer.alloc(0), Buffer.from("not an image at all")]) {
      await expect(processImage(bad)).rejects.toMatchObject({ code: "VALIDATION" });
    }
  });

  it("refuses files over the size limit", async () => {
    await expect(processImage(Buffer.alloc(MAX_UPLOAD_BYTES + 1, 1))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("builds a stable public path from the id and type", () => {
    const id = "0194b2c8-1d3a-7c4e-9a52-0f6a1b2c3d4e";
    expect(mediaPath({ id, contentType: "image/png" })).toBe(`/media/${id}.png`);
    expect(mediaPath({ id, contentType: "image/webp" })).toBe(`/media/${id}.webp`);
    expect(mediaPath({ id, contentType: "image/jpeg" })).toBe(`/media/${id}.jpg`);
  });
});
