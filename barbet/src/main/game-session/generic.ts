import { CreateGameArguments, CreateGameResult, createNewEnvironment, GameListeners } from '../entry-points/feature-environments/loader'
import { Status } from '../game-state/state-updater'
import ActionsBroadcastHelper from '../network/actions-broadcast-helper'
import { TickQueueAction, TickQueueActionType } from '../network/tick-queue-action'


interface Props {
    canvasProvider: () => HTMLCanvasElement | undefined
    sendActionsCallback: ConstructorParameters<typeof ActionsBroadcastHelper>[0]
}

export const createGenericSession = async (props: Props) => {
    const environment = await createNewEnvironment()

    const actionsHelper = new ActionsBroadcastHelper(props.sendActionsCallback)
    let currentGame: CreateGameResult | null = null

    const gameListener: GameListeners = {
        onInputCaused: (action) => {
            actionsHelper.enqueueAction({
                type: TickQueueActionType.GameAction,
                action: action,
            })
        },
        onTickCompleted: (tick) => {
            actionsHelper.tickDone(tick)
        },
    }

    return {
        isMultiplayer: () => { throw new Error() },
        forwardPlayerActions(tick: number, player: string, actions: TickQueueAction[]) {
            currentGame?.setActionsCallback(tick, player, actions)
        },
        async createNewGame(args: CreateGameArguments): Promise<CreateGameResult> {
            if (currentGame !== null) throw new Error('already loaded')
            const result = currentGame = await environment.createNewGame(args)
            actionsHelper.initializeFromTick(result.updater.getExecutedTicksCount())

            result.setGameListeners(gameListener)

            this.resetRendering()
            return result
        },
        setLatencyTicks(count: number) {
            actionsHelper.setLatencyTicksCount(count)
        },
        start(playerIds: string[], tps: number): void {
            if (!currentGame) throw new Error('no game')

            currentGame.setPlayerIdsCallback(playerIds)

            const ticksCount = currentGame.updater.getExecutedTicksCount()
            actionsHelper.tickDone(ticksCount)

            currentGame.updater.start(tps)
        },
        resetRendering() {
            const canvas = props.canvasProvider()
            if (canvas)
                environment.startRender({ canvas })
        },
        stop(): boolean {
            const previousStatus = currentGame?.updater.getCurrentStatus()
            currentGame?.updater.stop()

            return previousStatus === Status.Running
        },
        isRunning(): boolean {
            return currentGame?.updater.getCurrentStatus() === Status.Running
        },
        terminate(): void {
            environment.terminate({ terminateEverything: true })
        },
        getEnvironment() { return environment },
        getCurrentGame() { return currentGame },
    }
}