import { GameState } from '../../game-state/game-state'
import { ScheduledAction } from '../../game-state/scheduled-actions'
import { StateUpdater } from '../../game-state/state-updater'
import { SaveGameArguments, SaveGameResult } from '../../game-state/world/world-saver'
import { TickQueueAction, UpdaterAction } from '../../network2/tick-queue-action'
import { DEBUG, FORCE_ENV_ZERO, JS_ROOT } from '../../util/build-info'
import { frontedVariablesBuffer } from '../../util/frontend-variables'
import Mutex from '../../util/mutex'
import CONFIG from '../../util/persistance/observable-settings'
import { getCameraBuffer } from '../../util/persistance/serializable-settings'
import { sharedMemoryIsAvailable } from '../../util/shared-memory'
import { globalMutex } from '../../util/worker/global-mutex'

/** @deprecated */
export type FeedbackEvent =
	| { type: 'tick-completed', tick: number, updaterActions: UpdaterAction[] }
	| { type: 'saved-to-string', serializedState: string, forPlayerId: number, inputActorIds: number[], sendPaused: boolean }
	| { type: 'input-action', value: ScheduledAction }
	| { type: 'became-leader' }

export interface ConnectArguments {
	mutex: Mutex
	frontendVariables: SharedArrayBuffer
	camera: SharedArrayBuffer
	settings: typeof CONFIG
}

export type Environment =
	/** SharedArrayBuffer is not available.
	 *  Do everything on the main thread*/
	'zero'
	/** SharedArrayBuffer is available, but OffscreenCanvas is not.
	 * Do event handling and rendering on the main thread and logic on background thread */
	| 'first'
	/** Both SharedArrayBuffer and OffscreenCanvas are available.
	 * Do event handling on the main thread, rendering on render-thread and logic on background thread */
	| 'second'

export interface StartRenderArguments {
	canvas: HTMLCanvasElement
}

export interface CreateGameArguments {
	saveName?: string
	fileToRead?: File
	stringToRead?: string
}

export interface TerminateGameArguments {
	terminateEverything?: boolean
}

export type SetActionsCallback = (forTick: number, playerId: string, actions: TickQueueAction[]) => void

export interface GameListeners {
	onTickCompleted(tick: number): void

	onInputCaused(action: ScheduledAction): void
}

export interface CreateGameResult {
	state: GameState,
	updater: StateUpdater,
	setPlayerIdsCallback: (ids: string[]) => void
	setActionsCallback: SetActionsCallback
	setGameListeners: (listeners: GameListeners) => void
}

export interface EnvironmentConnection {
	name: string

	createNewGame(args: CreateGameArguments): Promise<CreateGameResult>

	startRender(args: StartRenderArguments): Promise<void>

	saveGame(args: SaveGameArguments): Promise<SaveGameResult>

	terminate(args: TerminateGameArguments): void
}

export const getSuggestedEnvironmentName = (preferredEnvironment: Environment) => {
	let usedEnvironment: Environment = 'zero'
	if (sharedMemoryIsAvailable && preferredEnvironment !== 'zero') {
		const offscreenCanvasIsAvailable = !!((window as any).OffscreenCanvas)
		if (offscreenCanvasIsAvailable && preferredEnvironment !== 'first')
			usedEnvironment = 'second'
		else {
			usedEnvironment = 'first'
		}
	}
	return usedEnvironment
}

export const loadEnvironment = async (name: Environment)
	: Promise<Readonly<EnvironmentConnection>> => {
	if (FORCE_ENV_ZERO && name !== 'zero') {
		if (!DEBUG)
			console.error(`Forced environment change ${name} -> ${'zero' as Environment}`)
		name = 'zero'
	}
	const connect = (await import((`${JS_ROOT}/feature-environments/${name}.js`)))['bind']
	const args: ConnectArguments = {
		mutex: globalMutex,
		frontendVariables: frontedVariablesBuffer,
		camera: getCameraBuffer(),
		settings: CONFIG,
	}
	return Object.freeze(await connect(args) as EnvironmentConnection)
}
