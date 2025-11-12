import { describe, expect, it } from "vitest";

import { generateLightningcssPkgIndex } from "../lib/generate-lightningcss-pkg";

describe("generateLightningcssPkgIndex", () => {
  it("prefers relative require for native binary", () => {
    const content = generateLightningcssPkgIndex({
      nativeBinaryName: "lightningcss.darwin-arm64.node",
      platform: "darwin",
      arch: "arm64",
    });

    expect(content).toContain("return require('../lightningcss.darwin-arm64.node');");
    expect(content).toContain("return require(`lightningcss-${parts.join('-')}`);");
  });
});
