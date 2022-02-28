import { Direction } from '../../util/direction'
import { ActivityId, requireActivity } from '../renderable/unit/activity'
import { UnitColorPaletteId } from '../renderable/unit/unit-color'
import { ItemType } from '../world/item'
import { World } from '../world/world'
import activityIdle from './activities/idle'
import { GroundItemsIndex } from './ground-items-index'
import { PathFinder } from './path-finder'


export const ACTIVITY_MEMORY_SIZE = 20

export interface Unit {
	numericId: number
	posX: number
	posY: number
	posZ: number
	color: UnitColorPaletteId
	rotation: Direction
	activityId: ActivityId
	activityStartedAt: number
	activityMemory: Int32Array
	activityMemoryPointer: number
	interrupt: Int32Array
	heldItem: ItemType
}

export class GameState {
	private isRunningLogic: boolean = false
	private readonly _units: Unit[] = []
	private nextUnitId: number = 1

	private constructor(public readonly world: World,
	                    public readonly groundItems: GroundItemsIndex,
	                    public readonly pathFinder: PathFinder) {
	}

	private _currentTick: number = 0

	public get currentTick(): number {
		return this._currentTick | 0
	}

	public get allUnits(): Unit[] {
		return [...this._units]
	}

	public static createNew(
		world: World,
		groundItems: GroundItemsIndex,
		pathFinder: PathFinder): GameState {
		return new GameState(world, groundItems, pathFinder)
	}

	public spawnUnit(atX: number,
	                 atZ: number,
	                 color: UnitColorPaletteId): void {
		const defaultActivity = activityIdle
		const unit: Unit = {
			numericId: this.nextUnitId++,
			posX: atX, posY: 2, posZ: atZ,
			color: color, rotation: Direction.PositiveX,
			activityId: defaultActivity.numericId,
			activityStartedAt: this._currentTick,
			activityMemory: new Int32Array(ACTIVITY_MEMORY_SIZE),
			activityMemoryPointer: 0,
			heldItem: ItemType.None,
			interrupt: new Int32Array(4),
		}
		defaultActivity.setup(this, unit)
		this._units.push(unit)
	}

	public advanceActivities() {
		if (this.isRunningLogic) throw new Error()
		this.isRunningLogic = true
		this._currentTick++

		this.pathFinder.tick(this)

		for (const unit of [...this._units]) {
			const activity = requireActivity(unit.activityId)

			activity.perform(this, unit)
		}
		this.isRunningLogic = false
	}
}
