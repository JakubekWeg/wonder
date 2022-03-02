import { Direction, getChangeInXByRotation, getChangeInZByRotation } from '../../../util/direction'
import { ActivityId } from '../../renderable/unit/activity'
import { ShaderId } from '../../renderable/unit/unit-shaders'
import { ItemType } from '../../world/item'
import { GameState } from '../game-state'
import {
	DataOffsetDrawables,
	DataOffsetItemHoldable,
	DataOffsetPositions,
	DataOffsetWithActivity,
	requireTrait,
	UnitTraitIndicesRecord,
	UnitTraits,
} from '../units/traits'
import activityItemPickupRoot from './item-pickup-root'

const pickUpItemActivityDuration = 10

export const itemPickUpTransformationsSource = () => `
float usedSin = sin(activityDuration / PI / 1.0);
if (isMainBodyVertex && isTopVertex) {
	pos.x += usedSin * (pos.y + 0.05) * 0.8;
	pos.y -= usedSin * pos.x * 0.2;
}
if (isFaceVertex) {
	pos.x += usedSin * (pos.y + 1.1) * 0.35;
	pos.y -= usedSin * pos.y * 0.45;
}
if (isMainBodyVertex && isMiddleVertex) {
	pos.x += usedSin * (pos.y + 0.01) * 1.6;
	pos.y -= usedSin * pos.x * 0.2;
}
if (isLeftArmVertex || isRightArmVertex) {
	bool isPhaseOne = activityDuration < 5.0; 
	if (isPhaseOne)
		pos.x += usedSin * (pos.y + (isBottomVertex ? 1.9 : (isMiddleVertex ? 0.85 : 0.4))) * 0.9;
	else
		pos.x += sin(5.0 / PI / 1.0) * (pos.y + (isBottomVertex ? 1.9 : (isMiddleVertex ? 0.85 : 0.4))) * 0.9 - cos(activityDuration / PI / 1.0) * -0.5;
	pos.y -= usedSin * 0.4;
}
`

const enum MemoryField {
	ActivityFinishTick,
	Direction,
	SIZE,
}

const activityItemPickup = {
	numericId: ActivityId.ItemPickUp,
	shaderId: ShaderId.PickUpItem,
	perform(game: GameState, unit: UnitTraitIndicesRecord) {
		const withActivitiesMemory = game.units.withActivities.rawData
		const memory = game.units.activitiesMemory.rawData
		const pointer = withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.MemoryPointer]!

		const finishAt = memory[pointer - MemoryField.ActivityFinishTick]!
		if (game.currentTick !== finishAt) return
		const direction = memory[pointer - MemoryField.Direction]! as Direction

		const positionsData = game.units.positions.rawData
		const unitX = positionsData[unit.position + DataOffsetPositions.PositionX]!
		const unitZ = positionsData[unit.position + DataOffsetPositions.PositionZ]!

		const itemX = unitX + getChangeInXByRotation(direction)
		const itemZ = unitZ + getChangeInZByRotation(direction)

		game.units.itemHoldables.rawData[unit.itemHoldable + DataOffsetItemHoldable.ItemId] = game.groundItems.getItem(itemX, itemZ)
		game.groundItems.setItem(itemX, itemZ, ItemType.None)

		const drawablesData = game.units.drawables.rawData
		drawablesData[unit.drawable + DataOffsetDrawables.Rotation] &= ~Direction.MaskMergePrevious
		withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.MemoryPointer] -= MemoryField.SIZE
		activityItemPickupRoot.onPickedUp(game, unit)
	},
	setup(game: GameState, unit: UnitTraitIndicesRecord, direction: Direction) {
		requireTrait(unit.thisTraits, UnitTraits.ItemHoldable)

		const now = game.currentTick
		const withActivitiesMemory = game.units.withActivities.rawData
		const memory = game.units.activitiesMemory.rawData
		const pointer = (withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.MemoryPointer] += MemoryField.SIZE)

		withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.CurrentId] = ActivityId.ItemPickUp
		withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.StartTick] = now

		const drawablesData = game.units.drawables.rawData
		const oldRotation = drawablesData[unit.drawable + DataOffsetDrawables.Rotation]!
		drawablesData[unit.drawable + DataOffsetDrawables.Rotation] = Direction.FlagMergeWithPrevious | ((oldRotation & Direction.MaskCurrentRotation) << 3) | direction

		memory[pointer - MemoryField.ActivityFinishTick] = now + pickUpItemActivityDuration
		memory[pointer - MemoryField.Direction] = direction
	},
}

export default activityItemPickup
