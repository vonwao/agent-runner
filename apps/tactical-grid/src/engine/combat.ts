import type { GameState, Unit } from "./types";
import { distance } from "./grid";

function isGameState(value: Unit | GameState): value is GameState {
  return "grid" in value && "units" in value;
}

export function isValidAttackTarget(attacker: Unit, target: Unit): boolean;
export function isValidAttackTarget(
  state: GameState,
  attacker: Unit,
  target: Unit
): boolean;
export function isValidAttackTarget(
  arg1: Unit | GameState,
  arg2: Unit,
  arg3?: Unit
): boolean {
  const attacker = isGameState(arg1) ? arg2 : arg1;
  const target = isGameState(arg1) ? arg3 : arg2;

  if (!target) {
    return false;
  }

  if (attacker.team === target.team) {
    return false;
  }

  if (distance(attacker.position, target.position) > attacker.attackRange) {
    return false;
  }

  return target.hp > 0;
}

export function resolveCombat(
  attacker: Unit,
  defender: Unit
): { defender: Unit } {
  const hp = Math.max(0, defender.hp - attacker.attack);
  return { defender: { ...defender, hp } };
}
