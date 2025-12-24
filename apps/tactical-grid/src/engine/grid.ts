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
