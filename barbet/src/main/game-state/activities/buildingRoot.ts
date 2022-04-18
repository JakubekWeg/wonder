import { getBuildingMask } from '../buildings'
import { queryBuildingDataById } from '../entities/queries'
import { DataOffsetPositions, DataOffsetWithActivity, EntityTraitIndicesRecord } from '../entities/traits'
import { GameState } from '../game-state'
import * as activityBuilding from './building'
import { ActivityId } from './index'
import * as activityWalkingByPathRoot from './walking-by-path-root'

const enum Status {
	None,
	RequestedWalk,
}

const enum MemoryField {
	ReturnTo,
	BuildingId,
	Status,
	SIZE,
}

export const perform = (game: GameState, unit: EntityTraitIndicesRecord) => {
	const memory = game.entities.activitiesMemory.rawData
	const withActivitiesMemory = game.entities.withActivities.rawData
	const pointer = withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.MemoryPointer]! + unit.activityMemory

	const buildingId = memory[pointer - MemoryField.BuildingId]!
	const status = memory[pointer - MemoryField.Status]! as Status

	switch (status) {
		case Status.None: {
			const data = queryBuildingDataById(game.entities, buildingId)
			if (data === null) {
				// this building doesn't exist, return to parent activity
				break
			}
			const buildingX = data.position[0]!
			const buildingZ = data.position[2]!

			const mask = getBuildingMask(data.typeId)
			memory[pointer - MemoryField.Status] = Status.RequestedWalk
			const xHalfMask = 1 + (mask?.sizeX ?? 0) / 2 | 0
			const zHalfMask = 1 + (mask?.sizeZ ?? 0) / 2 | 0
			activityWalkingByPathRoot.setup(game, unit, buildingX, buildingZ,
				buildingX - xHalfMask, buildingX + xHalfMask,
				buildingZ - zHalfMask, buildingZ + zHalfMask)
			return
		}
		case Status.RequestedWalk: {

			const data = queryBuildingDataById(game.entities, buildingId)
			if (data === null) {
				// this building doesn't exist, return to parent activity
				break
			}

			const positionsRawData = game.entities.positions.rawData
			const meX = positionsRawData[unit.position + DataOffsetPositions.PositionX]!
			const meZ = positionsRawData[unit.position + DataOffsetPositions.PositionZ]!

			const buildingX = data.position[0]!
			const buildingZ = data.position[2]!

			const mask = getBuildingMask(data.typeId)
			const isWithinBuildingRange = Math.abs(buildingX - meX) <= ((mask?.sizeX ?? 0) / 2 | 0) + 1
				&& Math.abs(buildingZ - meZ) <= ((mask?.sizeZ ?? 0) / 2 | 0) + 1

			if (!isWithinBuildingRange) {
				// outside the building zone, might have failed to find path, return to parent
				break
			}

			// really start building
			const returnTo = memory[pointer - MemoryField.ReturnTo]!
			withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.MemoryPointer] -= MemoryField.SIZE
			withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.CurrentId] = returnTo

			activityBuilding.setup(game, unit, buildingId)
			return
		}
	}


	const returnTo = memory[pointer - MemoryField.ReturnTo]!

	withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.MemoryPointer] -= MemoryField.SIZE
	withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.CurrentId] = returnTo
}

export const setup = (game: GameState, unit: EntityTraitIndicesRecord, buildingId: number) => {
	const memory = game.entities.activitiesMemory.rawData
	const withActivitiesMemory = game.entities.withActivities.rawData

	const returnTo = withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.CurrentId]!

	const pointer = (withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.MemoryPointer] += MemoryField.SIZE) + unit.activityMemory

	withActivitiesMemory[unit.withActivity + DataOffsetWithActivity.CurrentId] = ActivityId.BuildingRoot

	memory[pointer - MemoryField.ReturnTo] = returnTo
	memory[pointer - MemoryField.Status] = Status.None
	memory[pointer - MemoryField.BuildingId] = buildingId
}
