import { RoomSnapshot } from './room-snapshot'

export interface BothWayPackets {
    'ping': { noonce: number }
    'pong': { noonce: number }
}

export interface ClientToServer extends BothWayPackets {
    'join-room': { roomId: string }
    'update-room': Partial<{ preventJoining: boolean }>
    'broadcast-game-state': { serializedState: string }
    'broadcast-my-actions': { tick: number, actions: any[] }
}

export interface ServerToClient extends BothWayPackets {
    'your-info': { id: string }
    'joined-room': { ok: true, roomId: string } | { ok: false }
    'room-info-update': RoomSnapshot
    'game-state-broadcast': { serializedState: string }
    'players-actions': { from: string, tick: number, actions: any[] }
}