import {
	CreateGameArguments,
	Environment,
	FeedbackEvent,
	getSuggestedEnvironmentName,
	loadEnvironment,
	SaveMethod,
} from './environments/loader'
import { GameState } from './game-state/game-state'
import { StateUpdater } from './game-state/state-updater'
import { createRemote, GameSessionSynchronizer, NetworkEvent } from './network/game-session-synchronizer'
import { NetworkStateType } from './network/network-state'
import { TickQueueAction, TickQueueActionType, UpdaterAction } from './network/tick-queue-action'
import State from './util/state'
import CONFIG from './worker/observable-settings'

const TICKS_TO_TAKE_ACTION = 15

const defaultSessionState = {
	'terminated': false,
	'world-status': 'none' as ('none' | 'creating' | 'loaded'),
}


type Action =
	{ type: 'create-game', args: CreateGameArguments }
	| { type: 'invoke-updater-action', action: UpdaterAction }

export interface GameSession {
	readonly sessionState: State<typeof defaultSessionState>

	readonly networkState: State<NetworkStateType>

	resetRendering(): void

	dispatchAction(action: Action): void

	terminate(): void
}

interface Props {
	remoteUrl: string

	feedbackCallback: (event: FeedbackEvent) => void

	canvasProvider: () => HTMLCanvasElement
}

export const createRemoteSession = async (props: Props): Promise<GameSession> => {

	const sessionState = State.fromInitial(defaultSessionState)

	let synchronizer: GameSessionSynchronizer
	let networkState: State<NetworkStateType> | null
	let gameState: GameState | null = null
	let updater: StateUpdater | null = null
	let setActionsCallback: ((tick: number, actions: TickQueueAction[]) => void) | null = null
	let myActions: TickQueueAction[] = []

	const feedbackMiddleware = (event: FeedbackEvent) => {
		switch (event.type) {
			case 'input-action':
				myActions.push({
					type: TickQueueActionType.GameAction,
					action: event.value,
				})
				break
			case 'saved-to-string':
				synchronizer.provideGameStateAsRequested(event.value)
				break
			case 'tick-completed':
				for (const action of event.updaterActions)
					dispatchUpdaterAction(action)
				synchronizer.broadcastMyActions(event.tick + TICKS_TO_TAKE_ACTION, [...myActions])
				myActions.splice(0)
				break
			default:
				props.feedbackCallback(event)
				break
		}
	}

	const suggestedName = getSuggestedEnvironmentName(CONFIG.get('other/preferred-environment') as Environment)
	const environment = await loadEnvironment(suggestedName, feedbackMiddleware)


	const eventCallback = (event: NetworkEvent) => {
		const type = event.type
		switch (type) {
			case 'player-wants-to-become-input-actor':
				myActions.push({
					type: TickQueueActionType.UpdaterAction,
					action: {
						type: 'new-player-joins',
						playerId: event.from,
					},
				})
				break
			case 'actions-received-from-player':
				setActionsCallback?.(event.tick, event.actions)
				break
			case 'became-input-actor':
				loadGameFromArgs({stringToRead: event.gameState})
				break
			default:
				console.warn('Unknown event', type)
				break
			// case 'game-state-received':
			// 	loadGameFromArgs({stringToRead: event.value})
			// 	break
			// case 'game-state-request':
			// 	if (gameState !== null)
			// 		environment.saveGame({method: SaveMethod.ToString, saveName: 'requested-by-other-player'})
			// 	break
		}
	}

	synchronizer = await createRemote({
		connectToUrl: props.remoteUrl!,
		eventCallback: eventCallback,
	})
	networkState = synchronizer.networkState

	const loadGameFromArgs = (args: CreateGameArguments) => {
		sessionState.set('world-status', 'creating')
		environment.createNewGame(args).then((results) => {
			updater = results.updater
			gameState = results.state
			setActionsCallback = results.setActionsCallback
			resetRendering()
			sessionState.set('world-status', 'loaded')
			resumeGame(20)
		})
	}

	const resetRendering = () => {
		environment.startRender({canvas: props.canvasProvider()})
	}

	const resumeGame = (tickRate: number) => {
		if (updater !== null) {
			const lastTick = updater.getExecutedTicksCount()
			for (let i = 0; i < TICKS_TO_TAKE_ACTION; i++)
				synchronizer.broadcastMyActions(lastTick + i + 1, [])

			updater.start(tickRate)
		}
	}

	const dispatchUpdaterAction = (action: UpdaterAction) => {
		if (updater === null) return
		switch (action.type) {
			case 'new-player-joins':
				environment.saveGame({saveName: 'for-player', method: SaveMethod.ToString})
				break
			case 'resume':
				resumeGame(action.tickRate)
				break
			case 'change-tick-rate':
				updater.changeTickRate(action.tickRate)
				break
			case 'pause':
				updater.stop()
				break
		}
	}

	return {
		sessionState: sessionState,
		networkState: networkState,
		resetRendering,
		dispatchAction(action: Action) {
			queueMicrotask(async () => {
				switch (action.type) {
					case 'create-game':
						loadGameFromArgs(action.args)
						break
					case 'invoke-updater-action':
						dispatchUpdaterAction(action.action)
						break
				}
			})
		},
		// provideStartGameArguments(args: CreateGameArguments) {
		// 	queueMicrotask(() => loadGameFromArgs(args))
		// },
		// invokeUpdaterAction(action: UpdaterAction) {
		// 	queueMicrotask(() => {
		// 		if (terminated)
		// 			return console.warn('terminated')
		//
		// 		if (updater === null)
		// 			return console.warn('missing updater')
		//
		//
		// 	})
		// },
		terminate() {
			sessionState.update({
				'terminated': true,
				'world-status': 'none',
			})
			environment.terminateGame({})
			synchronizer.terminate()
		},
	}
}
