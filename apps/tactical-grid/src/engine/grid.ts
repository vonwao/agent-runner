import type { Position, Unit } from "./types";

export function distance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isInBounds(
  position: Position,
  grid: { width: number; height: number }
): boolean {
  return (
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < grid.width &&
    position.y < grid.height
  );
}

export function getUnitAt(units: Unit[], position: Position): Unit | undefined {
  return units.find(
    (unit) => unit.position.x === position.x && unit.position.y === position.y
  );
}

export function isValidMoveTarget(
  unit: Unit,
  target: Position,
  grid: { width: number; height: number },
  units: Unit[]
): boolean {
  if (!isInBounds(target, grid)) {
    return false;
  }

  if (distance(unit.position, target) > unit.moveRange) {
    return false;
  }

  return getUnitAt(units, target) === undefined;
}

export function getValidMoveTargets(
  unit: Unit,
  grid: { width: number; height: number },
  units: Unit[]
): Position[] {
  const targets: Position[] = [];
  for (let x = 0; x < grid.width; x++) {
    for (let y = 0; y < grid.height; y++) {
      const target = { x, y };
      if (distance(unit.position, target) <= unit.moveRange && isValidMoveTarget(unit, target, grid, units)) {
        targets.push(target);
      }
    }
  }
  return targets;
}
