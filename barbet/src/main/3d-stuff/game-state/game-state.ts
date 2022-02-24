import { ActivityId, IDLE, requireActivity } from '../renderable/unit/activity'
import { UnitColorPaletteId } from '../renderable/unit/unit-color'

export interface HeldItem {
	type: number
}

export interface Unit {
	posX: number
	posY: number
	posZ: number
	color: UnitColorPaletteId
	rotation: number
	activityId: ActivityId
	activityStartedAt: number
	activityMemory: Float32Array
	heldItem: HeldItem | null
}

export class GameState {
	private readonly _units: Unit[] = []

	private constructor() {
	}

	private _currentTick: number = 0

	public get currentTick(): number {
		return this._currentTick | 0
	}

	public get allUnits(): Unit[] {
		return [...this._units]
	}

	public static createNew(): GameState {
		return new GameState()
	}

	public spawnUnit(atX: number,
	                 atZ: number,
	                 color: UnitColorPaletteId): void {
		this._units.push({
			posX: atX, posY: 2, posZ: atZ,
			color: color, rotation: 0,
			activityId: IDLE.numericId,
			activityStartedAt: this._currentTick,
			activityMemory: new Float32Array(10),
			heldItem: null,
		})
	}

	public advanceActivities() {
		this._currentTick++
		for (const unit of [...this._units]) {
			const activity = requireActivity(unit.activityId)

			activity.perform(this, unit)
		}
	}
}