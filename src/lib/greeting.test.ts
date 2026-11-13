import { describe, expect, it } from "vitest";
import { greeting } from "./greeting";

const at = (h: number) => new Date(2026, 10, 10, h);

describe("greeting", () => {
  it("follows the phone's clock", () => {
    expect(greeting(at(1))).toBe("Hi");
    expect(greeting(at(4))).toBe("Good morning");
    expect(greeting(at(12))).toBe("Good afternoon");
    expect(greeting(at(18))).toBe("Good evening");
    expect(typeof greeting()).toBe("string");
  });
});
