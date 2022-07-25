import Handler from ".";
import { PlayerRole } from "../../../seampan/room-snapshot";

export default {
    type: 'update-room',
    handle(state, player, packet) {
        if (player.joinedRoomId === null) {
            console.warn('Player must be in a room first');
            return
        }

        if (state.rooms.getPlayersRoleInRoom(player.joinedRoomId, player.id) !== PlayerRole.Owner) {
            console.error('Not an owner')
            return
        }

        if (typeof packet.preventJoining === 'boolean') {
            state.rooms.setLocked(player.joinedRoomId, packet.preventJoining)
        }
    },
} as Handler<'update-room'>