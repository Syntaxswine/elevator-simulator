import { LOBBY_INDEX } from './config.js';

// M2/M4 will fill in state machine + dispatcher. For M1, just enough to
// have a render-able elevator.
export function createElevator() {
  return {
    currentFloor: LOBBY_INDEX,   // integer floor index (0..11)
    position: LOBBY_INDEX,       // continuous y in tower-units (= currentFloor when stationary)
    direction: 'NONE',           // 'UP' | 'DOWN' | 'NONE'
    doorState: 'CLOSED',         // 'CLOSED' | 'OPENING' | 'OPEN' | 'CLOSING'
    carCalls: new Set(),
  };
}
