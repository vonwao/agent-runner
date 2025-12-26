import { describe, it, expect } from "vitest";
import { createUnit } from "./engine";

describe("createUnit", () => {
  it("applies default values when optional params are omitted", () => {
    const unit = createUnit({
      id: "test-unit",
      x: 3,
      y: 5,
      team: "player",
    });

    expect(unit.id).toBe("test-unit");
    expect(unit.position).toEqual({ x: 3, y: 5 });
    expect(unit.team).toBe("player");
    expect(unit.hp).toBe(10);
    expect(unit.maxHp).toBe(10);
    expect(unit.attack).toBe(3);
    expect(unit.moveRange).toBe(3);
    expect(unit.attackRange).toBe(1);
  });

  it("uses custom values when provided", () => {
    const unit = createUnit({
      id: "custom-unit",
      x: 1,
      y: 2,
      team: "enemy",
      hp: 20,
      attack: 5,
      moveRange: 4,
      attackRange: 2,
    });

    expect(unit.id).toBe("custom-unit");
    expect(unit.position).toEqual({ x: 1, y: 2 });
    expect(unit.team).toBe("enemy");
    expect(unit.hp).toBe(20);
    expect(unit.maxHp).toBe(20);
    expect(unit.attack).toBe(5);
    expect(unit.moveRange).toBe(4);
    expect(unit.attackRange).toBe(2);
  });
});
