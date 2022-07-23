import { Camera } from '../../3d-stuff/camera'
import { startRenderingGame } from '../../3d-stuff/renderable/render-context'
import { GameStateImplementation } from '../../game-state/game-state'
import { ActionsQueue, SendActionsQueue } from '../../game-state/scheduled-actions/queue'
import {
	createNewStateUpdater,
	createStateUpdaterControllerFromReceived,
	StateUpdater
} from '../../game-state/state-updater'
import { loadGameFromArgs } from '../../game-state/world/world-loader'
import { performGameSave, SaveGameArguments, SaveGameResult } from '../../game-state/world/world-saver'
import TickQueue from '../../network2/tick-queue'
import { TickQueueAction } from '../../network2/tick-queue-action'
import { initFrontedVariablesFromReceived } from '../../util/frontend-variables-updaters'
import CONFIG from '../../util/persistance/observable-settings'
import { getCameraBuffer, setCameraBuffer } from '../../util/persistance/serializable-settings'
import { setGlobalMutex } from '../../util/worker/global-mutex'
import {
	ConnectArguments,
	CreateGameArguments,
	EnvironmentConnection,
	StartRenderArguments,
	TerminateGameArguments
} from './loader'

// this function is always used
// noinspection JSUnusedGlobalSymbols
export const bind = (args: ConnectArguments): EnvironmentConnection => {
	setGlobalMutex(args.mutex.pass())
	initFrontedVariablesFromReceived(args.frontendVariables)
	setCameraBuffer(args.camera)
	args.settings.observeEverything(s => CONFIG.replace(s))

	let tickQueue: TickQueue | null = null
	let actionsQueue: ActionsQueue | null = null
	let game: GameStateImplementation | null = null
	let updater: StateUpdater | null = null
	let renderCancelCallback: any = null
	return {
		name: 'zero',
		async createNewGame(gameArgs: CreateGameArguments) {
			const stateBroadcastCallback = () => void 0 // ignore, since everything is locally anyway
			actionsQueue = SendActionsQueue.create(action => {
				args.feedbackCallback({ type: 'input-action', value: action })
			})

			game = await loadGameFromArgs(gameArgs, stateBroadcastCallback) as GameStateImplementation
			tickQueue = TickQueue.createEmpty()
			// if (gameArgs.existingInputActorIds)
			// gameArgs.existingInputActorIds.forEach(id => tickQueue!.addRequiredPlayer(id))

			const updaterInstance = createNewStateUpdater(
				async (gameActions, updaterActions) => {

					await game!.advanceActivities(gameActions)

					const currentTick = game!.currentTick
					for (const a of updaterActions) {
						// if (a.type === 'new-player-joins') {
						// 	tickQueue!.addRequiredPlayer(a.playerId)
						// }
					}

					args.feedbackCallback({ type: 'tick-completed', tick: currentTick, updaterActions })
				},
				game.currentTick, tickQueue)

			updater = createStateUpdaterControllerFromReceived(updaterInstance.pass())
			return {
				state: game,
				updater,
				setActionsCallback: (forTick: number, playerId: string, actions: TickQueueAction[]) => {
					tickQueue!.setForTick(forTick, playerId, actions)
				},
			}
		},
		async startRender(args: StartRenderArguments): Promise<void> {
			if (game === null) throw new Error('Start game first')
			renderCancelCallback?.()
			const gameTickEstimation = () => updater!.estimateCurrentGameTickTime(0)
			renderCancelCallback = startRenderingGame(args.canvas, game, updater!, actionsQueue!, Camera.newUsingBuffer(getCameraBuffer()), gameTickEstimation)
		},
		terminate(_: TerminateGameArguments) {
			renderCancelCallback?.()
			updater?.stop()
			actionsQueue = game = updater = null
		},
		async saveGame(saveArgs: SaveGameArguments): Promise<SaveGameResult> {
			const result = game ? (await performGameSave(game, saveArgs)) : false
			if (result === false)
				throw new Error()
			return result
		},
	}
}

