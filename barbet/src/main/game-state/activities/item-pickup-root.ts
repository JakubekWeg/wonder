import { Direction, getRotationByChangeInCoords } from '../../util/direction'
import {
	DataOffsetDrawables,
	DataOffsetPositions,
	DataOffsetWithActivity,
	EntityTraitIndicesRecord,
} from '../entities/traits'
import { GameState } from '../game-state'
import { ItemType } from '../world/item'
import { ActivityId } from './index'
import * as activityItemPickup from './item-pickup'
import * as walkingByPathRoot from './walking-by-path-root'

const enum MemoryField {
	ReturnTo,
	DestinationX,
	DestinationZ,
	RequestedItemType,
	SIZE,
}

export const perform = (game: GameState, unit: EntityTraitIndicesRecord) => {
	const withActivitiesMemory = game.entities.withActivities.rawData
	const memory = game.entities.activitiesMemory.rawData
	const pointer = withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.MemoryPointer]! + unit.activityMemory

	const itemX = memory[pointer - MemoryField.DestinationX]!
	const itemZ = memory[pointer - MemoryField.DestinationZ]!
	const requestedType = memory[pointer - MemoryField.RequestedItemType]! as ItemType

	const positionsData = game.entities.positions.rawData
	const unitX = positionsData[unit.position + DataOffsetPositions.PositionX]!
	const unitZ = positionsData[unit.position + DataOffsetPositions.PositionZ]!


	if (Math.abs(unitX - itemX) <= 1 && Math.abs(unitZ - itemZ) <= 1) {
		// start picking up this item
		const actualItemHere = game.groundItems.getItem(itemX, itemZ)
		if (actualItemHere === requestedType) {
			const changeX = itemX - unitX
			const changeZ = itemZ - unitZ

			const rotation = (changeX !== 0 || changeZ !== 0)
				? getRotationByChangeInCoords(changeX, changeZ)
				: (game.entities.drawables.rawData[unit.drawable + DataOffsetDrawables.Rotation]! & Direction.MaskCurrentRotation)
			activityItemPickup.setup(game, unit, rotation, false)
			return
		}
	}

	// path failed or item taken :(
	withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.CurrentId] = memory[pointer - MemoryField.ReturnTo]!
	withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.MemoryPointer] -= MemoryField.SIZE
}

export const onPickedUp = (game: GameState, unit: EntityTraitIndicesRecord) => {

	const withActivitiesMemory = game.entities.withActivities.rawData
	const memory = game.entities.activitiesMemory.rawData
	const pointer = withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.MemoryPointer]! + unit.activityMemory

	withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.CurrentId] = memory[pointer - MemoryField.ReturnTo]!
	withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.MemoryPointer] -= MemoryField.SIZE
}

export const setup = (game: GameState, unit: EntityTraitIndicesRecord, x: number, z: number, type: ItemType) => {
	if (type === ItemType.None)
		throw new Error('Request of pick up none item')

	const withActivitiesMemory = game.entities.withActivities.rawData
	const memory = game.entities.activitiesMemory.rawData
	const pointer = (withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.MemoryPointer] += MemoryField.SIZE) + unit.activityMemory

	const returnTo = withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.CurrentId]!
	withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.CurrentId] = ActivityId.ItemPickUpRoot

	memory[pointer - MemoryField.ReturnTo] = returnTo
	memory[pointer - MemoryField.DestinationX] = x
	memory[pointer - MemoryField.DestinationZ] = z
	memory[pointer - MemoryField.RequestedItemType] = type

	walkingByPathRoot.setupToRect(game, unit, x, z, 1)
}
