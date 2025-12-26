import { describe, it, expect } from "vitest";
import { getValidMoveTargets } from "./grid";
import type { Unit } from "./types";

describe("getValidMoveTargets", () => {
  const grid = { width: 8, height: 8 };

  it("returns limited moves for unit in corner", () => {
    const unit: Unit = {
      id: "test-1",
      position: { x: 0, y: 0 },
      hp: 10,
      maxHp: 10,
      attack: 3,
      moveRange: 2,
      attackRange: 1,
      team: "player",
    };

    const targets = getValidMoveTargets(unit, grid, [unit]);

    // Unit at (0,0) with moveRange 2 can only reach positions in the corner
    // Should not include the unit's own position (occupied)
    expect(targets).not.toContainEqual({ x: 0, y: 0 });
    // Should include adjacent valid positions
    expect(targets).toContainEqual({ x: 1, y: 0 });
    expect(targets).toContainEqual({ x: 0, y: 1 });
    expect(targets).toContainEqual({ x: 2, y: 0 });
    expect(targets).toContainEqual({ x: 0, y: 2 });
    expect(targets).toContainEqual({ x: 1, y: 1 });
    // Should not include positions beyond moveRange
    expect(targets).not.toContainEqual({ x: 3, y: 0 });
  });

  it("excludes positions blocked by another unit", () => {
    const unit: Unit = {
      id: "mover",
      position: { x: 4, y: 4 },
      hp: 10,
      maxHp: 10,
      attack: 3,
      moveRange: 1,
      attackRange: 1,
      team: "player",
    };

    const blocker: Unit = {
      id: "blocker",
      position: { x: 4, y: 5 },
      hp: 10,
      maxHp: 10,
      attack: 3,
      moveRange: 1,
      attackRange: 1,
      team: "enemy",
    };

    const targets = getValidMoveTargets(unit, grid, [unit, blocker]);

    // The blocker's position should not be a valid target
    expect(targets).not.toContainEqual({ x: 4, y: 5 });
    // Other adjacent positions should be valid
    expect(targets).toContainEqual({ x: 4, y: 3 });
    expect(targets).toContainEqual({ x: 3, y: 4 });
    expect(targets).toContainEqual({ x: 5, y: 4 });
  });
});
